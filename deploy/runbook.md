# Odysseus deploy runbook

Initial provisioning commands are meant to be run as shown, in order, by the
operator with an assistant walking through them. Do not skip the STOP boxes.
Sections 1 to 3, 5 and 6 are the historical record of the original Scaleway
box. Section 4 is current: the server's secrets list and the permanent
reference-audit release workflow apply to the Hostinger box today.
Routine production deployment is section 7B: run
`deploy/odysseus-deploy.sh` from a clean checkout, on the operator's machine against the Hostinger
box. Section 7A records the retired GitHub release workflow.

## 1. What this stack is

> Sections 1 to 3, 5 and 6 describe the original 2025-08 provisioning on the
> retired Scaleway VPS and are kept as history. Section 4 (secrets on the
> server, reference-audit releases) is current. Production now runs on the
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
- A checkout of this repository on your local machine, with Node 24
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

> Current, not history: this list and the reference-audit workflow below
> apply to the Hostinger box.

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
- The model is pinned in code, not configured here: `OPENAI_MODEL` in
  `packages/llm/src/constants.ts` (trade-offs 102 and its 2026-09-23 GPT-6
  Luna amendment). Changing it is a code change and a deploy; before one,
  re-run the saved-audit comparison trade-off 102 describes.
- The `ODYSSEUS_PREVIEW_BUCKET_*` block: the same Scaleway bucket values the
  local `.env` already uses.
  The server's `serve` process also polls the bucket's `opt-out-requests/`
  prefix once a minute and applies each public opt-out to the blacklist, so
  this key needs list, read and delete there.
- On Vercel (`packages/site`), `PREVIEW_BUCKET_*` carries the same bucket,
  endpoint and region as the server but its own key, never the server's
  (issue #556). That key is limited by bucket policy to `GetObject` on
  `previews/*`, `opt-out-links/*` and `reference-audit/*`: the site only
  reads, and the bucket also holds the server's backups and every other
  prefix. One-click opt-out also needs `OPT_OUT_BUCKET_ACCESS_KEY_ID` and
  `OPT_OUT_BUCKET_SECRET_KEY`: a separate Scaleway key limited by bucket policy
  to `PutObject` on `opt-out-requests/*`. Without them the form answers with
  its error message and the mailto fallback still works.
- Key inventory, by type and never by value: the server key (app and, for
  the legacy backup, rclone), the site read key, the site opt-out write key,
  and the receipt write key. If one key was ever shared between Vercel and
  the server or rclone, treat it as exposed: create the scoped replacement,
  set it where it belongs, redeploy, then delete the old key in the Scaleway
  console.

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
  the public route. Tracked links are used only when
  `ODYSSEUS_REFERENCE_AUDIT_LINK_TRACKING=on` is also set; otherwise Touch 1
  prints the canonical untracked reference link in full. Telemetry is optional
  and fail-open.

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

### There is one database, and it is named `test`

Confirmed 2026-09-22. The production app's `MONGODB_URI` and the workstation's
`MDB_MCP_CONNECTION_STRING` resolve to the same Atlas cluster and the same
default database, whose name is `test`. The cluster also carries an
`odysseus-local` database, which is *not* where production data lives. So
`test` holds every real audit, job, finding, report and prospect.

Two consequences:

- The MCP connector is a read-only window onto production, not a sandbox.
  Anything it returns is live client data, and any write path pointed at the
  same string would hit production. Local development that wants a throwaway
  database must set its own `MONGODB_URI`.
- A database called `test` invites exactly the accident its name suggests:
  a cleanup script, an unfamiliar session or a stray `drop` aimed at a
  scratch database would destroy production. Renaming it to something like
  `odysseus-prod` would remove that trap. It is not urgent, and it is not
  free: the rename means a dump/restore into the new name, updating
  `MONGODB_URI` on the VPS and `MDB_MCP_CONNECTION_STRING` on the
  workstation, and a redeploy, with the app stopped throughout. Do it during
  a deliberate maintenance window, not alongside other work.

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

## 7A. Retired GitHub release workflow

GitHub only versions the repository (operator decision, 2026-09-25, trade-off
120): no GitHub Actions workflow runs. The dispatched release workflow, its
release controller (`deploy/release.sh`), the forced-command SSH key scripts
and this section's setup and rollback procedure were removed from the tree.
Commit `a91c93e2` is the last one that holds them, for reference. Production
deploys are section 7B only.

## 7B. Routine local deployments

> Operator decision, 2026-09-09 (trade-off 77): production on the Hostinger
> box is deployed by running `deploy/odysseus-deploy.sh` from the operator's
> own machine. GitHub runs no workflow (trade-off 120). This section is the
> routine procedure.

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

Routine deploy, from the operator's machine, on a clean checkout of the
commit to ship:

```sh
bash deploy/odysseus-deploy.sh
```

The script refuses a dirty working tree, so the image always matches a
commit. It does not require the release gate (trade-off 123). Run
`pnpm run gate` (`scripts/gate.sh`) on demand: before shipping a dependency
upgrade, a Dockerfile or `deploy/` change, or as a periodic check. It runs the
static check, the builds, the IBM Equal Access engine, the deploy-script
tests, the full test suite against the replica-set test MongoDB, and the Trivy
and Semgrep security gates, including a Trivy scan of a locally built
production image. It needs Docker and Playwright's Chromium.

To roll back a bad release, check out the last good commit (detached is fine)
and deploy it the same way.

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

The app container is CPU-capped (`cpus`, default 2) because audits run their
Chromium inside it. Without the cap, a long audit once pushed the VPS past
Hostinger's CPU limit and the panel throttled the whole box (2026-09-24). To
change the cap for a different plan, set `ODYSSEUS_APP_CPUS` in
`$ODYSSEUS_DEPLOY_COMPOSE_DIR/.env` (compose reads it for interpolation)
and redeploy. Check it took effect with
`docker inspect --format '{{.HostConfig.NanoCpus}}' odysseus-app-1`.

## 7D. Prospect data expiry (90 days)

The public `/bot` and `/confidentialite-prospection` pages promise that
prospecting data, screenshots included, is deleted automatically after 90
days (trade-off 125, issue #538). The daily retention sweep enforces it once
the server `.env` sets `ODYSSEUS_PROSPECT_EXPIRY=on`.

A prospect expires when nothing has happened to it for 90 days (no scan, no
outreach touch, no reply, no operator edit). It is deleted exactly as the
dashboard's Delete action deletes it, audits and their files included.
Suppression entries are kept. `won`, `call` and `quoted` prospects, and any
prospect with a delivered audit, never expire.

Before enabling it, and whenever the sweep logs a cap refusal:

```bash
docker compose exec app node packages/cli/dist/index.js artifacts prospect-expiry
docker compose exec app node packages/cli/dist/index.js artifacts prospect-expiry --apply --allow-large
```

The first command is a dry run: record its counts, read the list, then apply.
The sweep itself never lifts the cap of 20 prospects per run.

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

### Isolation preflight (plan 059)

`assessBrowserIsolation` in `packages/scanner` refuses to start a scan when
Chromium's sandbox is disabled and no evaluated container isolation profile is
declared in `ODYSSEUS_BROWSER_ISOLATION_PROFILE`. The approved values are
`secretless-scan-container` and `gvisor`. Do not add a profile name to the
approved list to make a deployment pass - that empties the gate of its only
content.

Trade-off 92 records that the app container's Chromium runs as the same
unprivileged user, in the same container, as the process holding every secret.
Plan 059 designed the remedy, a secretless `scan` container that would run the
audit browser with no database, bucket, model or mailbox credential. Its
compose service shipped but the `scan-service` command it ran was never built,
so it was removed rather than left to crash-loop on a full `docker compose up`
(issue #525, trade-off 101's amendment). The design, the environment
allow-list and the deployment-gate checklist remain in
`plans/archive/059-scan-container-design.md` for whoever builds it. Until
then every scan runs in-process in the app container, the preflight stays
assessed-but-not-asserted, audits record `environment-unapproved`, and the
dormant Plan-058 `ApprovedAuditEvidence` path stays blocked. **Plan 068
changes the product consequence, not the security fact:**
`environment-unapproved` is an operational warning in the normal Plan-067
report workflow and does not invalidate normalized findings or block a client
report.

Chromium is already launched with credential-shaped environment variables
stripped (`buildSanitizedBrowserEnv`), so the browser process no longer carries
`MONGODB_URI`, the model key or the bucket keys. That narrows the blast radius
of a renderer exploit; in the app container it does not close it, since the
same uid can still read `/srv/odysseus/.env` - which is what the designed
scan container would stop carrying at all.

## 8. Backups

The nightly job tars the artifacts volume and copies it to the rclone remote
in `ODYSSEUS_BACKUP_REMOTE`, keeping 14 days (plan 077, down from 30). The
archive is not encrypted, so it must not share a bucket or key with anything
the public site can read (issue #556): the preferred path is the encrypted
restic repository of section 8.1, and short of that a separate private bucket
with its own key. Left unset, the remote defaults to the legacy location, the
previews bucket under `backups/`, and the job logs a warning on every run
until it is moved.

Moving it off the previews bucket, as the operator: create a private bucket
(for example `odysseus-backups`) and a Scaleway key limited to it, add a
second rclone remote with that key (`rclone config`, name `backups`, same
answers as below), then:

```sh
echo 'ODYSSEUS_BACKUP_REMOTE=backups:odysseus-backups/artifacts' | sudo tee /srv/odysseus/.backup.env
sudo chown deploy:deploy /srv/odysseus/.backup.env && sudo chmod 600 /srv/odysseus/.backup.env
sudo cp /srv/odysseus/deploy/odysseus-backup.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start odysseus-backup.service
sudo journalctl -u odysseus-backup.service -n 20 --no-pager
```

The journal no longer shows the previews-bucket warning. Delete the old
`backups/` prefix from the previews bucket once a restore drill from the new
remote passes.

Live on the Hostinger VPS (checked 2026-09-25 with `systemctl list-timers`):
this legacy path, `odysseus-backup.timer` running
`/srv/odysseus/deploy/backup-artifacts.sh` nightly at 02:20 UTC. The restic
timers of section 8.1 are not installed there.

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

Store a second copy of that password off the server (the operator's password
manager). Snapshots cannot be restored without it, and a server copy alone is
lost with the server.

Both files live next to the rsynced checkout but are not in it.
`deploy/odysseus-deploy.sh` excludes `/.restic.env`, `/.restic-password` and
`/.env.smoke` from its `rsync --delete`, and `odysseus-deploy.test.sh` asserts
it (issue #484). A new server-only file in `/srv/odysseus` needs the same
exclude, or the next deploy deletes it.

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

The maintenance timer retains 14 daily and 6 weekly snapshots (plan 077,
down from 30 daily, 8 weekly and 12 monthly: retention removes superseded
audits from the live disk, and a year of monthly snapshots would keep every
one of them), then prunes unreachable pack data and runs `restic check`. Retention is
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
Only the smoke overlay loads it; `deploy/compose.yaml` never names it, and the
deploy script never copies it to the server.

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

For a routine bad release, use the section 7B rollback instead. This section is
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
