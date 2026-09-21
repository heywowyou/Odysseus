# Odysseus deploy runbook

Initial provisioning commands are meant to be run as shown, in order, by the
operator with an assistant walking through them. Do not skip the STOP boxes.
Sections 1 through 6 are the historical record of the original Scaleway box.
Routine production deployment is section 7B: run `deploy/odysseus-deploy.sh`
from the operator's machine against the Hostinger box. Section 7A stays as
reference for the disabled workflow mechanism.

## 1. What this stack is

> Sections 1 through 6 describe the original 2025-08 provisioning on the
> retired Scaleway VPS and are kept as history. Production now runs on the
> Hostinger box; see section 7B.

One Scaleway VPS runs two containers: the Odysseus app (built from this
repo's Dockerfile) and Caddy, which terminates HTTPS and is the only thing
exposed to the internet. MongoDB stays on the existing Atlas cluster; the
server never runs a database. Audit artifacts live in a Docker volume on the
VPS and are backed up nightly into the existing private Scaleway bucket
`odysseus-previews` under a `backups/` prefix. Gmail mailbox credentials for
outreach drafting deliberately stay OFF the server: drafting remains a local
machine activity, and the server never sends anything.

## 2. Prerequisites

Have all of these before starting:

- A Scaleway account able to create a VPS.
- DNS control for `odysseusaudit.com` (wherever its nameservers live).
- Atlas project admin access, to add the VPS IP to the network allowlist.
- A checkout of this repository on your local machine, with Node 22
  installed (needed once, to generate the dashboard password hash).
- Local Docker, for the local smoke in section 10.

## 3. Provision the VPS

Create a Debian 12 VPS, 2 vCPU and 2 to 4 GB RAM. Note its IPv4 address.

As root over SSH, install Docker (from Docker's official repository, which
includes the compose plugin Debian's own packages lack):

```sh
ssh root@VPS_IP
apt update && apt full-upgrade -y
curl -fsSL https://get.docker.com | sh
```

Create the non-root `deploy` user and give it Docker:

```sh
adduser deploy
usermod -aG docker deploy
```

SSH keys only. Create `/etc/ssh/sshd_config.d/99-hardening.conf` containing
exactly:

```
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
```

then `systemctl restart ssh`. Confirm you can log in with your key from a
second terminal BEFORE closing the first one.

Firewall: only SSH, HTTP and HTTPS (80 is only needed for certificate
issuance and renewal):

```sh
apt install -y ufw
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Automatic security updates:

```sh
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

Get the repo onto the server at `/srv/odysseus`. From your LOCAL checkout
(adjust the path to your clone), rsync is the simplest exact route:

```sh
rsync -a --delete --exclude .git --exclude node_modules --exclude /artifacts \
  --exclude /data --exclude .env \
  /path/to/your/odysseus/ deploy@VPS_IP:/srv/odysseus/
```

The two output directories are anchored with a leading slash on purpose:
an unanchored `--exclude artifacts` also matches
`packages/scanner/src/artifacts/`, which is scanner source code, and a
sync that drops it fails to build with `TS2307: Cannot find module
'./artifacts/paths.js'`.

Alternatively, `git clone` the repository to `/srv/odysseus` as `deploy`.

## 4. Secrets on the server

The server reads one file: `/srv/odysseus/.env`. Create it BY HAND, with the
operator present, from a copy of `.env.example`:

```sh
cd /srv/odysseus
cp .env.example .env
chmod 600 .env
nano .env
```

Fill in exactly these, leave everything else as shipped:

- `MONGODB_URI`: the Atlas connection string for the production cluster.
  Leave the database out of its path: `deploy/compose.yaml` pins
  `MONGODB_DB_NAME` to the production database (`test`, the name the
  records have always landed in), and a database in the URI path would
  override that pin and empty the dashboard. A scan run from any other
  machine against this URI cannot surface in the dashboard unless it
  names this same database, which is the point (issue #38).
- `ODYSSEUS_DASHBOARD_PASSWORD_HASH`: generated on your LOCAL machine, from
  your local checkout, so the plaintext password never touches the server's
  shell history or a CLI argument. Run locally:

  ```sh
  node scripts/hash-dashboard-password.mjs
  ```

  It prompts on the terminal: type the new dashboard password, press Enter,
  and copy the printed `salt:hash` line into the server's `.env`. The
  password goes over stdin, never a CLI argument (arguments land in shell
  history and process lists). The plaintext itself is written nowhere and
  told to no one.
- `OPENAI_API_KEY`: the analysis key. A fresh key may start on a lower rate-limit
  tier, so verify the limits before running a large batch.
- Optional `OPENAI_BASE_URL`: leave unset for the standard endpoint. Set it to
  the organization's enabled EU regional endpoint when EU data residency is
  required; regional processing carries a 10 percent uplift.
- The application intentionally requests the generic `gpt-5.4-mini` alias.
  Recheck report quality after OpenAI changes the alias target; the operator
  explicitly prefers automatic minor upgrades over a dated snapshot pin.
- The `ODYSSEUS_PREVIEW_BUCKET_*` block: the same Scaleway bucket values the
  local `.env` already uses.
  The server's `serve` process also polls the bucket's `opt-out-requests/`
  prefix once a minute and applies each public opt-out to the blacklist, so
  this key needs list, read and delete there.
- On Vercel (`packages/site`), one-click opt-out needs, besides the existing
  `PREVIEW_BUCKET_*` read values, `OPT_OUT_BUCKET_ACCESS_KEY_ID` and
  `OPT_OUT_BUCKET_SECRET_KEY`: a separate Scaleway key limited by bucket policy
  to `PutObject` on `opt-out-requests/*`. Without them the form answers with
  its error message and the mailto fallback still works.

- Plan 071's permanent reference PDF uses its own object namespace,
  `reference-audit/<sha256>.pdf` plus `reference-audit/current.json`, but not
  necessarily its own bucket. With no `ODYSSEUS_REFERENCE_AUDIT_BUCKET_*`
  values set, the private publisher falls back to the preview bucket, and the
  public site falls back from `REFERENCE_AUDIT_BUCKET_*` to its read-only
  `PREVIEW_BUCKET_*` values, so a permanent example needs no new bucket and no
  new deployment variables. Preview expiry deletes only the object it
  published and the opt-out poller only reads `opt-out-requests/`, so nothing
  sweeps the reference namespace. Configure a separate bucket and key when the
  public read credential must not reach preview objects at all. Either way the
  site key stays read-only for the namespace and must not be reused for
  receipt writes.
- Optional reference-link attribution uses a separate receipt bucket. The
  Vercel site receives `REFERENCE_AUDIT_RECEIPT_BUCKET_*` credentials limited
  to `PutObject` on `reference-audit-receipts/*`. The private interface uses
  `ODYSSEUS_REFERENCE_AUDIT_RECEIPT_BUCKET_*` credentials with only the
  list/read/delete access needed to consume that prefix. It stores only
  bounded receipts; no prospect, email, IP, User-Agent or Referer is sent by
  the public route. Leave this block unset to use the canonical untracked
  reference link; telemetry is optional and fail-open.

### Permanent reference-audit release workflow

A reference release is an explicit operator publication, never an automatic
side effect of a report or template change:

1. Select an already stored qualifying Full scan and the current French report
   lineage; do not rescan a hotel for this artifact.
2. Build the detached showcase, run the source-identity leak gate, and render
   the candidate through the normal paid-report renderer and PDF checks.
3. Complete the normal page-by-page client-report finalization review on that
   exact candidate. A candidate with unresolved identity, factual, editorial
   or rendering defects is not publishable.
4. Upload the digest-addressed PDF, verify the readback digest, then replace
   `reference-audit/current.json` last. Never overwrite an immutable PDF.
5. Probe `https://www.odysseusaudit.com/exemple-audit.pdf` and confirm the PDF
   headers and complete document, then open
   `https://www.odysseusaudit.com/exemple-audit` and page through the reader
   before enabling new Touch-1 drafts. Keep the previous approved manifest for
   rollback.

Steps 2 and 4 are two CLI commands, run locally with the reference bucket
credentials in `.env`:

```bash
# Step 2: builds the candidate folder and never publishes
pnpm exec tsx packages/cli/src/index.ts reference-audit build <artifacts-dir>
# Step 4: run only after the page-by-page review in step 3
pnpm exec tsx packages/cli/src/index.ts reference-audit publish <candidate-dir> --reviewed
```

`build` writes `reference-audit.pdf`, the rendered HTML and a private
`release.json` (which names the source audit) under
`<artifacts-dir>/reference-audit-candidates/<timestamp>/`. `publish` refuses a
PDF whose digest changed after the build, and a candidate built with a report
template, data version or anonymizer older than the running code.

The private dashboard's reference status reports `current`, `stale` or
`missing` by comparing the pointer's report/template/data/anonymizer versions
with the running code. Staleness creates an operator work item; it does not
automatically move the public pointer. Clear it with the two commands above.

> STOP. Do NOT copy `ODYSSEUS_MAILBOX_*` values (the Gmail OAuth block) to
> the server. Outreach drafting stays local by plan; a mailbox credential on
> a public server would widen who can create drafts for nothing. If those
> keys are filled in this file, delete the values now and save.

## 5. DNS

In your DNS provider, add one record:

```
app.odysseusaudit.com.    A    300    VPS_IPv4
```

Add an AAAA record only if the VPS actually has an IPv6 address enabled.
Caddy's certificate issuance needs this record to resolve BEFORE the first
start in section 7.

## 6. Atlas allowlist

In Atlas, under Network Access, add the VPS IPv4 address with comment
`odysseus VPS` so the app can reach the cluster.

> STOP. Do not remove or narrow the operator's existing home IP entry. It
> stays unless the operator explicitly confirms nothing else (MCP read-only
> inspection, local development, ad hoc shell) needs it. Removing it locks a
> working machine out of production data.

## 7. Start and verify

> The `docker compose -f deploy/compose.yaml` commands in this section are
> release-controller and Scaleway-era. On the Hostinger box, compose is run
> via `deploy/odysseus-deploy.sh` with project name `odysseus` from
> `/docker/odysseus`; do not run these commands there.

```sh
cd /srv/odysseus
docker compose -f deploy/compose.yaml up -d --build
```

The first build takes a few minutes (Playwright's Chromium is downloaded
into the image). Then watch the first certificate issuance:

```sh
docker compose -f deploy/compose.yaml logs -f caddy
```

You want to see a certificate obtained for `app.odysseusaudit.com`, then
Ctrl-C. Verify from your LOCAL machine:

```sh
curl -sI https://app.odysseusaudit.com/
```

Expected: `HTTP/2 302` with `location: /login` (unauthenticated page requests
redirect). Then in a browser: open `https://app.odysseusaudit.com`, log in
with the dashboard password from section 4, and confirm the dashboard loads.

Wrong-password behaviour: enter a WRONG password five times. The fifth
attempt answers with a lock and a wait message instead of a plain failure.
Wait it out, then confirm the correct password still logs in.

Logs must never carry secret values:

```sh
docker compose -f deploy/compose.yaml logs app
```

Read it: no password, no hash, no cookie or session values may appear. Key
names at most.

Reboot proof:

```sh
sudo reboot
```

Reconnect after a minute or two, then:

```sh
cd /srv/odysseus
docker compose -f deploy/compose.yaml ps
curl -sI https://app.odysseusaudit.com/
```

Both services `Up`, and the 302 to `/login` again: `restart: unless-stopped`
and the timer stack came back on their own.

## 7A. Configure controlled production releases

> Operator decision, 2026-09-09: production (the Hostinger box serving
> `app.odysseusaudit.com`) is deployed locally with
> `deploy/odysseus-deploy.sh`; this GitHub workflow is deliberately disabled
> (`PRODUCTION_DEPLOY_ENABLED=false`) and agents must not suggest it unless
> the local path is genuinely blocked (trade-off 77). This section stays as
> reference for the mechanism, its guards, and its rollback design.

Routine releases had started only when the operator ran the `Deploy production`
workflow on `main`. The workflow refuses to deploy unless that exact commit has
a successful `CI` push run. It does not pull whatever happens to be at the tip
of a branch later.

The VPS keeps releases under `/srv/odysseus/releases/<full-commit-sha>` and
points `/srv/odysseus/current` at the live one. Docker images carry the same
commit SHA. Compose's project name is pinned to `deploy`, so moving between
release directories continues to use the existing `deploy_artifacts`,
`deploy_caddy_data`, and `deploy_caddy_config` volumes. The production `.env`
stays at `/srv/odysseus/.env` and is symlinked into each release; it is never
included in a release archive.

### Install the restricted command on the VPS

From the checked-out repository already on the VPS:

```sh
cd /srv/odysseus
chmod 0755 deploy/release.sh deploy/github-deploy-command.sh \
  deploy/install-github-deploy-key.sh
```

Generate a dedicated key on the operator's local machine. It is not the
operator's normal SSH key:

```sh
ssh-keygen -t ed25519 -f /tmp/odysseus-github-deploy -N '' \
  -C 'github-actions-production-deploy'
```

Install the public key from the operator's local machine. The installer handles
an existing `authorized_keys` file that does not end in a newline and refuses
non-Ed25519 input:

```sh
ssh deploy@VPS_IP /srv/odysseus/deploy/install-github-deploy-key.sh \
  < /tmp/odysseus-github-deploy.pub
```

`restrict` disables port, agent, X11, and terminal forwarding. The forced
command accepts only `deploy <40-character-sha>` with an archive on standard
input, that same command with the single literal token `force-running`
appended, or `rollback`. It cannot open a shell or print `/srv/odysseus/.env`.

### Configure the GitHub production environment

The repository is private on a GitHub plan that does not provide required
environment reviewers for private repositories. The manual workflow dispatch
is therefore the approval action; a push cannot start the deployment job. Add
these repository-level values:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `PRODUCTION_DEPLOY_ENABLED` | `true`, added last |
| Variable | `PRODUCTION_HOST` | the VPS IPv4 address |
| Variable | `PRODUCTION_USER` | `deploy` |
| Secret | `PRODUCTION_SSH_PRIVATE_KEY` | complete private deployment key |
| Secret | `PRODUCTION_SSH_KNOWN_HOSTS` | trusted VPS `known_hosts` line |

Obtain the host line from an already trusted operator connection. Do not accept
a new host key blindly merely because `ssh-keyscan` returned it. Add
the repository-level `PRODUCTION_DEPLOY_ENABLED=true` only after all other
values and the forced VPS key are in place. Until then, the workflow is
deliberately skipped. A future GitHub plan upgrade may add a required reviewer
to the `production` environment as a second gate without changing the workflow.

Delete `/tmp/odysseus-github-deploy` and its `.pub` file from the operator's
machine after the private key is stored in the GitHub repository and one
deployment has passed. The GitHub copy then becomes the only private-key copy.

### Normal deployment and rollback

After a successful `CI` run on `main`, open Actions, `Deploy production`, Run
workflow, keep branch `main`, and choose `deploy`. Documentation-only pushes
need no deployment. The release controller serializes deployments, builds the
commit-tagged app image, restarts Compose, and requires `/health/ready` to confirm
both MongoDB connectivity and queue initialization. A failed readiness check restores
the previous release automatically. The workflow separately requires the public
unauthenticated request to return a 302 redirect to `/login`, which verifies the
routing and authentication boundary rather than application readiness.

Before recreating the app container, the controller asks the currently running
container for the jobs whose status is `running`. Full-audit jobs are logged
but do not block deployment: Plan 035 gives them a stable run identity,
persistent crawl/content checkpoints, and startup re-claim, so a container
restart resumes the same audit rather than forfeiting it. Other running job
types still refuse the deploy because they do not all carry that resume
contract. The probe itself remains fail-closed: a failure or unreadable answer
refuses the deploy because an unknown queue state is not safe to guess about.
When no app container is running at all the deploy proceeds. To deploy over a
non-resumable running job anyway, append the literal token `force-running` to
the deploy command, or set `ODYSSEUS_DEPLOY_FORCE_RUNNING=1` for a manual SSH
run.

To roll back intentionally, open Actions, `Deploy production`, Run workflow,
and choose `rollback`. From a normal operator SSH session, the equivalent
recovery command is:

```sh
/srv/odysseus/deploy/release.sh rollback
```

Rollback swaps the current and previous pointers, so it can be reversed by
running it again. Five recent releases are retained in addition to whichever
older release is the active rollback target. Every deployment restarts the app,
which logs out the in-memory dashboard session. With the guard above that can
no longer interrupt a running job unless the deploy was forced; an interrupted
job is returned to the persistent queue when the new process starts, and since
plan 035 (issue #124) a full-audit job resumes from its checkpoint on the next
startup instead of restarting from zero.

### Disk usage on the VPS

The VPS disk is 30 GB and the builds are large, so the controller enforces a
data-first disk policy after every successful deploy (`prune_old_releases` in
`deploy/release.sh`):

- Kept: the artifacts volume, `/srv/odysseus/.env`, the Caddy certificates,
  the five most recent release trees (a few dozen MB each), and the app images
  for the current and previous releases only (about 3 GB each). Atlas holds
  the database, off-box.
- Pruned: app images for every other release (a rollback to one of those
  rebuilds the image first; the controller handles a missing image), dangling
  images, and Docker build cache above 4 GB (`ODYSSEUS_BUILD_CACHE_KEEP`, the
  release controller's own knob and not section 7B's
  `ODYSSEUS_DEPLOY_BUILD_CACHE_KEEP`, overrides the ceiling).

Before the controller had this policy the disk filled on 2026-09-03 and
deploys died with `no space left on device` during the image build. If that
ever recurs before the controller's own prune can run, reclaim space from an
operator SSH session, keeping the current and previous images:

```sh
readlink /srv/odysseus/current
cat /srv/odysseus/previous-release
docker images --format '{{.Repository}}:{{.Tag}}' | grep odysseus-app
# docker image rm <tags that are neither of the two pointers above>
docker image prune -f
docker builder prune -f -a --keep-storage 4GB
df -h /
```

A deploy can then be re-run from Actions. Never prune volumes: the artifacts
volume is the data of record on this box (see section 11).

### Artifact bucket orphans

Deleting an audit, a scan or a prospect removes the audit's local directory
and its bucket prefix before its database records (issue #384); a storage
failure answers 503 and keeps the records so the deletion can be retried.
Audits deleted before that change may have left bucket objects behind. To
find them, run from the app container:

```sh
node packages/cli/dist/index.js artifacts orphans           # dry run
node packages/cli/dist/index.js artifacts orphans --delete  # removes listed orphans
```

Archived prospects that still own audits (archived before issue #381 made
archive purge scans, or left part-way by a storage failure) are reconciled the
same way, through the purge the archive action itself runs:

```sh
node packages/cli/dist/index.js artifacts archived-prospects          # dry run
node packages/cli/dist/index.js artifacts archived-prospects --apply  # purge
```

For `artifacts orphans`, only `<hostname>/<YYYY-MM-DDTHH-MM-SSZ>/` prefixes with no matching audit row
and older than 24 hours count as orphans. Any other key is printed as
unidentified and never deleted.

## 7B. Routine local deployments

> Operator decision, 2026-09-09 (trade-off 77): production on the Hostinger
> box is deployed by running `deploy/odysseus-deploy.sh` from the operator's
> own machine. The GitHub workflow of section 7A stays disabled. This section
> is the routine procedure.

One-time setup, on the operator's machine:

```sh
cp deploy/.deploy.local.env.example deploy/.deploy.local.env
```

Fill in `ODYSSEUS_DEPLOY_HOST` (the `user@host` for the box) and the SSH key
path `ODYSSEUS_DEPLOY_SSH_KEY` unless your default `~/.ssh/id_ed25519` is
already authorized there. The other values have working defaults you normally
leave alone: `ODYSSEUS_DEPLOY_REMOTE_PATH` (`/srv/odysseus`),
`ODYSSEUS_DEPLOY_COMPOSE_DIR` (`/docker/odysseus`),
`ODYSSEUS_DEPLOY_COMPOSE_PROJECT` (`odysseus`), and
`ODYSSEUS_DEPLOY_BUILD_CACHE_KEEP` (`4GB`).

Routine deploy, from the operator's machine:

```sh
bash deploy/odysseus-deploy.sh
```

The script, in order: renders the server compose file from the repo's own
`deploy/compose.yaml` and writes it to the server, rsyncs the repo, builds
the app image stamped with `ODYSSEUS_BUILD_ID`, rolls it out with
`up -d app`, verifies the running container reports that build id, and prunes
build cache down to `ODYSSEUS_DEPLOY_BUILD_CACHE_KEEP` (default `4GB`).

Two standing rules:

- `ODYSSEUS_DEPLOY_COMPOSE_PROJECT` must never be `deploy`. The script
  hard-fails that value: it collides with the old release controller's
  project name, and that collision once caused a container/volume mismatch
  on the old box. The default `odysseus` is correct.
- No Hostinger panel click is needed or wanted. The script rolls the image
  out itself; do not click the panel's own Deployer button after a rollout,
  because it re-runs `pull` + `up` from the panel's own context.

## 7C. Chromium sandbox (accepted risk)

Production Chromium runs with `--no-sandbox`, in the same container and user
that hold every production secret. This is recorded as an accepted risk in
`docs/decisions/trade-offs.md` entry 92; read it before changing
`ODYSSEUS_CHROMIUM_EXTRA_ARGS`.

To try restoring the sandbox, prove it on the production host first, never by
editing the compose file and deploying:

1. Check the host allows unprivileged user namespaces:
   `sysctl kernel.unprivileged_userns_clone` (Debian/Ubuntu) and
   `sysctl kernel.apparmor_restrict_unprivileged_userns` (Ubuntu 23.10+; `1`
   blocks it).
2. Start a throwaway container from the current image without the flag and
   launch Chromium once:
   `docker run --rm --entrypoint node odysseus-app:latest -e "require('playwright').chromium.launch().then(b => b.close()).then(() => console.log('sandbox ok'))"`.
   Run it from a directory with no `.env`; the container needs no secrets for
   this check.
3. Only if that prints `sandbox ok` (possibly after adding a seccomp profile
   that allows user namespaces via `security_opt`), remove `--no-sandbox` from
   `deploy/compose.yaml`, deploy, run one Quick check and one PDF render, and
   update trade-off 92.

If Chromium fails to start after a change here, every scan and PDF fails;
roll back by restoring the flag.

### Isolation preflight and the scan container (plan 059)

`assessBrowserIsolation` in `packages/scanner` refuses to start a scan when
Chromium's sandbox is disabled and no evaluated container isolation profile is
declared in `ODYSSEUS_BROWSER_ISOLATION_PROFILE`. The approved values are
`secretless-scan-container` and `gvisor`. Do not add a profile name to the
approved list to make a deployment pass - that empties the gate of its only
content.

Trade-off 92 records that the app container's Chromium runs as the same
unprivileged user, in the same container, as the process holding every secret.
Plan 059 built the first remedy: `deploy/compose.yaml` now defines a `scan`
service - same image as the app, `scan-service` command, no published ports,
the shared `artifacts` volume, no `env_file`, and an explicit environment
allow-list (`ODYSSEUS_ARTIFACTS_ROOT`, the Chromium flags, the isolation
profile, the scan-service token and address, the shared crawl knobs, and the
flagged `CRUX_API_KEY` exception). Nothing credential-shaped beyond that list
may be added to it; a proposal to do so is a deployment-review stop, not a
pattern to extend (trade-off 101).

Deploying that container changes nothing on its own. The app's
`ODYSSEUS_SCAN_SERVICE_URL` is commented out in `deploy/compose.yaml`, so
every scan keeps running in-process exactly as before, and the preflight
stays assessed-but-not-asserted on that path - deliberately, until the
container is the way scans actually run. The enablement procedure below, and
the deployment-gate checklist after it, are what make setting the flag
truthful.

#### Enabling the scan container

1. Generate the shared token and write it where compose interpolation finds
   it. On the server:

   ```sh
   (umask 177; printf 'ODYSSEUS_SCAN_SERVICE_TOKEN=%s\n' "$(openssl rand -hex 32)" \
     >/docker/odysseus/.env)
   ls -l /docker/odysseus/.env
   ```

   The `ls` must show `-rw-------`. The token is a random 64-hex-character
   value; it is never typed by a person, never passed as a CLI argument
   (arguments land in shell history and process lists), and the `printf`
   form keeps it out of the shell history too. The file location is
   load-bearing: compose reads `<project-directory>/.env` for variable
   interpolation, the server compose file lives in `/docker/odysseus`
   (section 7B), so every compose invocation through it - including
   `deploy/odysseus-deploy.sh`'s, which passes no `--env-file` - resolves
   the token identically for the app and the scan service. The operator
   `.env` at `/srv/odysseus/.env` is an env_file into the app container only
   and is never read by the scan service; the scan container must never
   receive it.

2. If CrUX field data should keep flowing after the cut-over (the compose
   default degrades to no CrUX data, exactly like any machine without the
   key), add the same key the app already uses to that file:

   ```sh
   grep '^CRUX_API_KEY=' /srv/odysseus/.env >>/docker/odysseus/.env
   chmod 600 /docker/odysseus/.env
   ```

   This is trade-off 101's recorded exception: a read-only public-data key
   that `buildSanitizedBrowserEnv` strips from the browser process like every
   other `_KEY` name.

3. Uncomment `ODYSSEUS_SCAN_SERVICE_URL` and `ODYSSEUS_SCAN_SERVICE_TOKEN` in
   `deploy/compose.yaml` (in the repository), then deploy by section 7B.
   Optionally rehearse the whole procedure locally first: the smoke overlay
   (section 10) carries a fake smoke token, and uncommenting the same two
   lines in `deploy/compose.smoke.yaml` flips a local smoke onto the
   dispatch path.

4. Create the scan container. The routine rollout updates only `app`, so run
   once by hand on the server:

   ```sh
   docker compose -p odysseus -f /docker/odysseus/docker-compose.yml up -d
   ```

   The same command is how the scan container picks up a new image after
   later deploys; run it during a quiet window, because a restart kills an
   in-flight acquisition (which requeues and resumes from the crawl
   checkpoint). Rotating the token later means regenerating step 1's file and
   re-running this command.

Rolling back: comment the two app lines again and deploy; scans return to the
in-process path. The scan container can keep running - it is inert unless
called.

#### Deployment gate (run on the real host before trusting the profile)

The compose file ships the hardening; only the host can prove it. Run every
check below after step 4, before declaring
`ODYSSEUS_BROWSER_ISOLATION_PROFILE=secretless-scan-container` attested for
the deployment, and add a dated line to the log at the end of this subsection
recording the run. Until then, scans that dispatch to the container run
unattested exactly as in-process scans do, and the dormant Plan-058 compatibility path still cannot produce
`ApprovedAuditEvidence`. Plan 068 deliberately does **not** use that artifact
as a normal report gate: the same environment condition is surfaced as an
operational scan diagnostic, separate from client-facing evidence limitations.

- [ ] Runs as uid 10001, never root:
      `docker compose -p odysseus -f /docker/odysseus/docker-compose.yml exec scan id`
      prints `uid=10001(odysseus)`.
- [ ] No `.env` in the image, no `env_file` on the service, and the
      environment is the compose allow-list plus the image's own variables
      and nothing else: diff `docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}'`
      against the service's `environment:` in `docker compose config`, the
      Dockerfile `ENV` entries (`PATH`, `PLAYWRIGHT_BROWSERS_PATH`,
      `ODYSSEUS_BUILD_ID`, `ODYSSEUS_BUILT_AT`,
      `ODYSSEUS_ARTIFACTS_ROOT`), and the container runtime's own additions.
      Anything else is a failure.
- [ ] Only secret-shaped names present are `ODYSSEUS_SCAN_SERVICE_TOKEN`
      and, if adopted, `CRUX_API_KEY`:
      `docker compose ... exec scan printenv | grep -E '_KEY$|TOKEN|SECRET|PASSWORD|URI'`
      lists only those, and neither appears in a launched Chromium
      environment (`buildSanitizedBrowserEnv` strips them; verify against one
      real scan's recorded launch environment).
- [ ] No Docker socket, no `/var/run` mounts, no host paths beyond the named
      `artifacts` volume, and the hardening is live, not just committed:
      `docker inspect --format '{{.HostConfig.CapDrop}} {{.HostConfig.SecurityOpt}} {{.HostConfig.PidsLimit}} {{.HostConfig.Memory}} {{.HostConfig.NanoCpus}}'`
      shows `[ALL]`, `no-new-privileges`, and the configured limits.
- [ ] Limits hold under a real scan: start one Full scan and watch
      `docker stats`, then adjust `mem_limit` / `cpus` / `pids_limit` in
      `deploy/compose.yaml` from what a Lighthouse page actually costs. The
      service must not starve the host.
- [ ] The service port is unpublished and rejects unauthenticated calls:
      nothing listens on host port 4700 (`ss -ltn | grep 4700` is empty), and
      from inside the app container
      `node -e "fetch('http://scan:4700/scan',{method:'POST'}).then(r=>console.log(r.status))"`
      prints `401` (a wrong or missing token never reaches a scan).
- [ ] With the entire service environment leaked, an attacker obtains
      nothing that opens any production system: no database, bucket, model
      or mailbox credential is in the list.

Deployment-gate log (add one dated line per run, never delete old ones):

- (none yet - the container has not been enabled in production)

What stays blocked regardless of this section, until the gate above has
actually passed on the production host: the preflight stays unwired on the
in-process path (local dev, CLI, and any deployment that has not enabled the
container keep assess-without-assert); the dormant Plan-058
`ApprovedAuditEvidence` path stays blocked, and audits still record
`environment-unapproved` while scans run beside secrets; and the app
container keeps trade-off 92's accepted risk for its own Chromium, which still
renders the PDFs. **Plan 068 changes the product consequence, not the security
fact:** `environment-unapproved` is an operational warning in the normal
Plan-067 report workflow and does not invalidate normalized findings or block a
client report. The isolation work remains necessary on its own security merits.

Chromium is already launched with credential-shaped environment variables
stripped (`buildSanitizedBrowserEnv`), so the browser process no longer carries
`MONGODB_URI`, the model key or the bucket keys. That narrows the blast radius
of a renderer exploit; in the app container it does not close it, since the
same uid can still read `/srv/odysseus/.env` - which is what the scan
container exists to stop carrying at all.

## 8. Backups

The nightly job tars the artifacts volume and copies it to the existing
private bucket `odysseus-previews` under `backups/`, keeping 30 days.

Install rclone and create the remote, as `deploy`, on the server. The
credentials are the SAME ones as `ODYSSEUS_PREVIEW_BUCKET_ACCESS_KEY_ID` /
`ODYSSEUS_PREVIEW_BUCKET_SECRET_KEY` in `/srv/odysseus/.env` (same bucket,
backups just live under a prefix):

```sh
sudo apt-get install -y rclone
rclone config
```

Answer the prompts exactly:

```
n) New remote
name> scaleway
Storage> s3
provider> Other
env_auth> false
access_key_id> <the ODYSSEUS_PREVIEW_BUCKET_ACCESS_KEY_ID value>
secret_access_key> <the ODYSSEUS_PREVIEW_BUCKET_SECRET_KEY value>
region> fr-par
endpoint> https://s3.fr-par.scw.cloud
```

Press Enter through every remaining prompt (defaults), then `y` to confirm
and `q` to quit.

Install the systemd units:

```sh
sudo cp /srv/odysseus/deploy/odysseus-backup.service \
        /srv/odysseus/deploy/odysseus-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now odysseus-backup.timer
systemctl list-timers odysseus-backup.timer
```

The timer fires nightly at 04:20 Europe/Paris and catches up after downtime.
Run it once by hand now:

```sh
sudo systemctl start odysseus-backup.service
sudo journalctl -u odysseus-backup.service -n 50 --no-pager
rclone lsl scaleway:odysseus-previews/backups/
```

The journal shows one `archiving` line, one `copying` line, one `pruning`
line, `done`. The listing shows the archive.

Restore drill, on the server, now and after every future change to the
backup path:

```sh
mkdir -p /tmp/odysseus-restore-drill/extracted
rclone copy "scaleway:odysseus-previews/backups/ARCHIVE_NAME.tar.gz" /tmp/odysseus-restore-drill/
tar xzf /tmp/odysseus-restore-drill/ARCHIVE_NAME.tar.gz -C /tmp/odysseus-restore-drill/extracted
find /tmp/odysseus-restore-drill/extracted -name manifest.json | head -n 3
```

Read one `manifest.json` (it must parse as JSON), then confirm a screenshot
it references exists inside the extraction:

```sh
find /tmp/odysseus-restore-drill/extracted -name '*.png' | head -n 3
```

A real path under the extracted `artifacts/` tree that opens as an image is
a pass. Clean up with `rm -rf /tmp/odysseus-restore-drill`.

Restore drill log (add one dated line per drill, never delete old ones):

- 2026-08-31: operator + ZCode, archive odysseus-artifacts-20260831-140943.tar.gz,
  manifest and screenshot checks passed (manifest parsed as JSON, a 1.4 MB
  screenshot verified as a real PNG, 16 files in the restored tree). First
  drill, on the fresh deployment: the artifacts volume was still empty, so
  one real reference audit was seeded under `_restore-drill.local/` for the
  drill and removed from the live volume afterwards; the drill archive stays
  in the bucket as evidence. Re-run after every backup-path change and once
  real VPS artifacts exist.
- 2026-09-05: operator + Claude, Hostinger migration. Two drills. (1) The
  Hostinger box's own first backup (empty artifacts volume, no audits run
  there yet) archived, uploaded, and pruned correctly after fixing
  `backup-artifacts.sh`'s project-name resolution (see below). (2) Restore
  drill against a real archive already in the bucket from the still-running
  Scaleway box, `odysseus-artifacts-20260903-222012.tar.gz`: extracted
  cleanly, manifest parsed as JSON, 43 files restored for one real audit
  (www.villasfoch.fr). No PNG survived in that archive despite `scan.json`
  referencing `pages/*/raw.png` paths; most likely pruning (trade-off 2)
  removed every screenshot for this audit rather than a restore defect, but
  this was not confirmed against the source volume and is worth checking
  before relying on this archive for evidence recovery. Also found:
  `backup-artifacts.sh`'s `docker compose -f <path> ps` could not match
  running containers to their project from a systemd service's default
  working directory, so every scheduled backup would have silently skipped
  with "nothing to back up" on this host; fixed by adding
  `ODYSSEUS_BACKUP_COMPOSE_PROJECT` to pin the project name explicitly
  (unset preserves prior behavior, so the Scaleway box's already-working
  timer is unaffected). Also discovered mid-migration: the Scaleway box has
  produced real backups since 2026-09-01 (up to 3 GB), so the "clean
  cutover, no data on the box" assumption this migration started from is
  now stale — real audit artifacts exist there and were not migrated to the
  new box before cutover.


### 8.1 Restic encrypted backup path (preferred)

The repository now includes a restic 0.19.1 path for encrypted,
content-deduplicated off-box backups. It is the preferred replacement for the
legacy tar+rclone archive above once one successful backup, integrity check and
restore drill have passed. Do not disable the existing timer before that proof.

Create a dedicated private S3-compatible backup repository/bucket and copy the
template:

```sh
sudo cp /srv/odysseus/deploy/.restic.env.example /srv/odysseus/.restic.env
sudo chown deploy:deploy /srv/odysseus/.restic.env
sudo chmod 600 /srv/odysseus/.restic.env
sudo -u deploy nano /srv/odysseus/.restic.env
```

The restic repository password is separate from the application `.env` and
from object-store credentials:

```sh
sudo -u deploy sh -c 'umask 077; cat > /srv/odysseus/.restic-password'
# type/paste a long random password, then Ctrl-D
```

Initialize the repository once:

```sh
docker run --rm \
  --env-file /srv/odysseus/.restic.env \
  -e RESTIC_PASSWORD_FILE=/run/secrets/restic-password \
  -v /srv/odysseus/.restic-password:/run/secrets/restic-password:ro \
  restic/restic:0.19.1 init
```

Install the restic timer:

```sh
sudo cp /srv/odysseus/deploy/odysseus-restic-backup.service \
        /srv/odysseus/deploy/odysseus-restic-backup.timer \
        /srv/odysseus/deploy/odysseus-restic-maintain.service \
        /srv/odysseus/deploy/odysseus-restic-maintain.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now odysseus-restic-backup.timer odysseus-restic-maintain.timer
```

The maintenance timer retains 30 daily, 8 weekly and 12 monthly snapshots,
then prunes unreachable pack data and runs `restic check`. Retention is
scoped to the production host/tag so another repository user is not
accidentally pruned.

The default artifact volume is `odysseus_artifacts` (the Hostinger compose
project). Override `ODYSSEUS_RESTIC_ARTIFACT_VOLUME` in the systemd service
environment only if the deployed volume name differs.

Before considering the path active, run all three:

```sh
sudo -u deploy bash /srv/odysseus/deploy/restic-backup.sh
sudo -u deploy bash /srv/odysseus/deploy/restic-check.sh
sudo -u deploy bash /srv/odysseus/deploy/restic-restore-drill.sh
```

The restore drill restores the latest production-host artifact snapshot into a
temporary Docker volume, verifies that at least one file exists, and removes
the drill volume. On an intentionally empty fresh deployment, seed a
non-client synthetic artifact before the first drill rather than accepting an
empty restore as proof.

After a successful restic backup/check/restore drill, disable the old rclone
timer to avoid paying for two independent retention systems:

```sh
sudo systemctl disable --now odysseus-backup.timer
```

Keep the legacy scripts until at least one real production restic restore has
been recorded; they are rollback tooling during migration. The application
`.env` is never mounted into the restic container.

## 9. In-container PDF glyph smoke

> The `docker compose -f deploy/compose.yaml` commands in this section are
> release-controller and Scaleway-era. On the Hostinger box, compose is run
> via `deploy/odysseus-deploy.sh` with project name `odysseus` from
> `/docker/odysseus`; do not run these commands there.

Trade-off 19: Chromium's font hinting splits some Inter glyphs in
print-to-PDF; the report launches its browser with
`--font-render-hinting=none` to prevent it. That flag is passed ONLY by the
report's own launch (`REPORT_PDF_CHROMIUM_ARGS` in
`packages/report/src/index.ts`); the deployment flags arrive separately via
`ODYSSEUS_CHROMIUM_EXTRA_ARGS` and are appended after it, never replacing
it. Keep that ordering when touching either file.

Render a fixture PDF inside the running container (no client data, no
MongoDB, nothing written to the artifacts volume):

```sh
cd /srv/odysseus
docker compose -f deploy/compose.yaml exec app node --input-type=module -e "
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const { generateReportPdf } = await import('/app/packages/report/dist/index.js');
const dir = '/app/fixtures/test-audits/small-site';
const manifest = JSON.parse(readFileSync(dir + '/manifest.json', 'utf8'));
const findings = JSON.parse(readFileSync(dir + '/findings.json', 'utf8'));
const analysisFile = readdirSync(dir + '/analyses').filter((f) => f.endsWith('-fr.json')).sort().at(-1);
const raw = JSON.parse(readFileSync(dir + '/analyses/' + analysisFile, 'utf8'));
const { pdf, pageCount } = await generateReportPdf({
  auditDir: dir,
  manifest,
  findings,
  renderMetadata: { reportId: 'glyph-smoke', renderedAt: new Date(), rendererBuild: 'glyph-smoke', templateVersion: 2 },
  analysis: { ...raw, generatedAt: new Date(raw.generatedAt) },
});
writeFileSync('/tmp/glyph-smoke.pdf', pdf);
console.log('wrote /tmp/glyph-smoke.pdf,', pdf.length, 'bytes,', pageCount, 'pages');
"
```

Copy it out and LOOK at it (cover, section headings, findings text):

```sh
docker compose -f deploy/compose.yaml cp app:/tmp/glyph-smoke.pdf ./glyph-smoke.pdf
```

Then open `glyph-smoke.pdf` on your local machine (scp it over first).

> STOP. If glyphs split in-container but not locally, stop and record the
> fixture name, the in-container Chromium version, and a screenshot of the
> split before ANY further deployment step. A glyph defect on a client
> deliverable is a defect regardless of how the rest of the stack behaves.

## 10. Local smoke (before ever touching the VPS)

> The `docker compose -f deploy/compose.yaml` commands in this section run on
> your own machine only; they date from the Scaleway era. On the Hostinger
> box, compose is run via `deploy/odysseus-deploy.sh` with project name
> `odysseus` from `/docker/odysseus`; never run this section's commands there.

Run the whole stack on your machine against the repo's test Mongo. This is
the dry run for sections 7 and 9.

The smoke adds `deploy/compose.smoke.yaml` on top of the production compose
file. That overlay lets the container reach the host-published test Mongo port
and swaps in `deploy/Caddyfile.smoke`, the plain-HTTP `localhost` site, which
the production `deploy/Caddyfile` deliberately does not contain:

```sh
cd /path/to/your/odysseus
docker compose up -d mongo-test
cp deploy/.env.smoke.example .env.smoke
docker compose -f deploy/compose.yaml -f deploy/compose.smoke.yaml up -d --build
```

`.env.smoke` (gitignored by convention, deleted in the teardown below)
overrides your real `.env` for this run: test Mongo on port 27018, a stub
dashboard hash whose plaintext is `odysseus-smoke-only`, fake bucket values.

Through Caddy, on http://localhost:

```sh
curl -s http://localhost/health/live
curl -s http://localhost/health/ready
curl -sI http://localhost/
```

Expected: fixed JSON responses with `live` and `ready` statuses, followed by a
`302` with `location: /login`. The readiness response returns HTTP 503 with only
allowlisted dependency statuses when MongoDB or the queue is unavailable. Then:

```sh
curl -s http://localhost/login
```

Expected: the dashboard SPA HTML (an `index.html` with script tags), served
through Caddy, not an error page.

Login with the stub password:

```sh
curl -si -X POST http://localhost/api/session/login \
  -H 'content-type: application/json' \
  -d '{"password":"odysseus-smoke-only"}'
```

Expected: `HTTP/1.1 204` plus a `set-cookie` header. A wrong password
returns `401` with a JSON error.

The compose file also defines the plan 059 `scan` service. Check it came up:

```sh
docker compose -f deploy/compose.yaml -f deploy/compose.smoke.yaml ps scan
```

Expected: the `scan` container `Up`. If the image predates plan 059 slices
1-3 (the `scan-service` CLI command), it exits and restarts instead; that is
expected and harmless while those slices are unmerged, and the rest of the
smoke is unaffected. Once it is `Up`, confirm the service rejects calls
without the bearer token - the negative half of the section 7C token check:

```sh
docker compose -f deploy/compose.yaml -f deploy/compose.smoke.yaml exec app \
  node -e "fetch('http://scan:4700/scan',{method:'POST'}).then(r=>console.log(r.status))"
```

Expected: `401`. A `404`, `200` or a connection error while `scan` is `Up`
means the token gate is not what the deployment gate requires; stop and
investigate. (To rehearse the full dispatch path locally, uncomment the two
`ODYSSEUS_SCAN_SERVICE_*` lines in the smoke overlay's `app` block and repeat
the smoke; the default smoke rehearses the production default, which has the
flag unset.)

Teardown, exactly, so nothing survives on the host:

```sh
docker compose -f deploy/compose.yaml -f deploy/compose.smoke.yaml down -v
docker compose down
rm .env.smoke
pgrep -af 'vite|tsx|odysseus serve'
```

The `pgrep` line must print NOTHING (no fixture server, no dashboard dev
process left running).

## 11. Rollback / teardown

> The `docker compose -f deploy/compose.yaml` commands in this section are
> release-controller and Scaleway-era. On the Hostinger box, compose is run
> via `deploy/odysseus-deploy.sh` with project name `odysseus` from
> `/docker/odysseus`; do not run these commands there.

Stop the stack while KEEPING all data:

```sh
cd /srv/odysseus
docker compose -f deploy/compose.yaml down
```

For a routine bad release, use the section 7A rollback instead. This section is
for stopping or dismantling the whole stack.

Safe to delete after that:

- The `odysseus-app` image (`docker rmi odysseus-app`).
- The backup units:
  `sudo systemctl disable --now odysseus-backup.timer` then
  `sudo rm /etc/systemd/system/odysseus-backup.service /etc/systemd/system/odysseus-backup.timer`
  and `sudo systemctl daemon-reload`.
- The `scaleway` rclone remote (`rclone config`, delete) and the rclone
  package, if nothing else uses it.
- `/srv/odysseus` itself, AFTER archiving `.env` out of it (or just leaving
  the directory in place costs nothing).
- The VPS IP entry in the Atlas allowlist, and the DNS record, if the
  server is gone for good.

NOT safe to delete:

- The `artifacts` volume: it holds every audit's deliverables. `down -v`
  DESTROYS it. Only run `docker compose -f deploy/compose.yaml down -v` if
  you have confirmed a restorable backup in section 8 and the operator has
  said the artifacts are disposable.
- `caddy_data`: the managed certificates. Deleting it forces re-issuance
  (rate-limited by Let's Encrypt) and should be a conscious choice, not a
  cleanup step.

Mongo has nothing to tear down on the server: it stays on Atlas.
