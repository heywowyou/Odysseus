# Odysseus deploy runbook

Initial provisioning commands are meant to be run as shown, in order, by the
operator with an assistant walking through them. Do not skip the STOP boxes.
Once provisioning is complete, section 7A replaces routine source syncing and
rebuilds with a CI-verified, operator-triggered deployment.

## 1. What this stack is

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

Routine releases start only when the operator runs the `Deploy production`
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
input, or `rollback`. It cannot open a shell or print `/srv/odysseus/.env`.

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
commit-tagged app image, restarts Compose, and requires the public unauthenticated
request to return a 302 redirect to `/login`. A failed live check restores the
previous release automatically.

To roll back intentionally, open Actions, `Deploy production`, Run workflow,
and choose `rollback`. From a normal operator SSH session, the equivalent
recovery command is:

```sh
/srv/odysseus/deploy/release.sh rollback
```

Rollback swaps the current and previous pointers, so it can be reversed by
running it again. Five recent releases are retained in addition to whichever
older release is the active rollback target. Every deployment restarts the app,
which logs out the in-memory dashboard session. A job interrupted during the
restart is returned to the persistent queue when the new process starts.

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
  images, and Docker build cache above 4 GB
  (`ODYSSEUS_BUILD_CACHE_KEEP` overrides the ceiling).

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

## 9. In-container PDF glyph smoke

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
const pdf = await generateReportPdf({
  auditDir: dir,
  manifest,
  findings,
  renderMetadata: { reportId: 'glyph-smoke', renderedAt: new Date(), rendererBuild: 'glyph-smoke', templateVersion: 2 },
  analysis: { ...raw, generatedAt: new Date(raw.generatedAt) },
});
writeFileSync('/tmp/glyph-smoke.pdf', pdf);
console.log('wrote /tmp/glyph-smoke.pdf,', pdf.length, 'bytes');
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

Run the whole stack on your machine against the repo's test Mongo. This is
the dry run for sections 7 and 9.

First, uncomment the two `extra_hosts` lines under the `app` service in
`deploy/compose.yaml` (they let the container reach the host-published test
Mongo port). Then:

```sh
cd /path/to/your/odysseus
docker compose up -d mongo-test
cp deploy/.env.smoke.example .env.smoke
docker compose -f deploy/compose.yaml up -d --build
```

`.env.smoke` (gitignored by convention, deleted in the teardown below)
overrides your real `.env` for this run: test Mongo on port 27018, a stub
dashboard hash whose plaintext is `odysseus-smoke-only`, fake bucket values.

Through Caddy, on http://localhost:

```sh
curl -sI http://localhost/
```

Expected: `302` with `location: /login`. Then:

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
docker compose -f deploy/compose.yaml down -v
docker compose down
rm .env.smoke
pgrep -af 'vite|tsx|odysseus serve'
```

The `pgrep` line must print NOTHING (no fixture server, no dashboard dev
process left running). Re-comment the `extra_hosts` lines in
`deploy/compose.yaml` before committing anything.

## 11. Rollback / teardown

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
