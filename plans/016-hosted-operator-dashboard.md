# Plan 016: Host the operator dashboard on a public EU server

> **Executor instructions**: Complete plans 001 through 013 first. This plan
> must land before plan 014 starts. This is an infrastructure milestone: the
> code slice is small (password session auth in `packages/interface`), and the
> rest is deploy assets, one provisioning session with the operator, backups,
> and documentation. Provisioning steps that need a human (VPS account, DNS,
> Atlas allowlist, secrets) go through the `wizard` skill, never silently.

> **Drift check**: `git diff --stat dbba6ba..HEAD -- packages/interface/src docker-compose.yml deploy docs/decisions docs/product plans`

## Status

- **Priority**: P2 (sequenced: after 013, before 014)
- **Effort**: M (excluding operator provisioning time)
- **Risk**: MED (small code surface, high blast radius: the dashboard fronts
  the whole prospect database, client PDFs, and the scan trigger)
- **Depends on**: plans 001-013
- **Blocks**: plan 014 (the first-100 rollout is when anywhere-access matters)
- **Category**: direction
- **Planned at**: `dbba6ba`, 2026-08-30

## Why this matters

The operator must be able to run the campaign from any browser, anywhere,
including when the home PC is off. The data is already cloud-hosted
(`MONGODB_URI` points at Atlas, previews live in a Scaleway bucket, the public
site is on Vercel); only the dashboard process, the job queue, and the crawler
still live on one machine. This milestone moves those onto a rented EU server,
puts TLS and a password in front, and makes the artifacts survivable. Plan
014's rollout then runs from a hotel lobby as easily as from home.

## Binding decisions

Approved by the operator on 2026-08-30, after the options table in session:

1. **Auth is a built-in password session** in `packages/interface`: one very
   strong password, a signed HttpOnly session cookie, in-process rate
   limiting with lockout. Rejected: reverse-proxy basic auth (no lockout, no
   logout, weakest posture), Cloudflare Access (strong but puts Cloudflare in
   the data path and moves DNS), Tailscale-only (needs an app on every
   device, which fails "any browser anywhere").
2. **Hosting is a Scaleway VPS**, EU region. One provider for bucket and VPS,
   French/EU residency consistent with the prospecting privacy page.
   Rejected: Hetzner and OVH (no existing relationship), PaaS (Chromium plus
   hours-long crawls plus an artifacts volume are unpredictable and pricier
   there).
3. **Packaging is Docker Compose**: a Dockerfile pins Node 22, Playwright's
   Chromium, and fonts; compose wires app, Caddy, and the artifacts volume.
   Docker already enters the dev loop through the test-Mongo compose service,
   so this extends rather than introduces.
4. **Sequenced after plan 013, before plan 014.**
5. Derived, not re-litigated: Mongo stays on Atlas; the public site stays on
   Vercel; the dashboard takes `app.odysseusaudit.com`; artifacts live on a
   VPS volume backed up to the existing Scaleway bucket; the client-facing
   boundary is unchanged (previews stay hash-token gated, the site gains
   nothing, there is still no public client surface to the engine).

## Current state

- `packages/interface/src/config.ts`: `ODYSSEUS_INTERFACE_HOST` defaults to
  `127.0.0.1`; `packages/store/src/connection.ts` reads `MONGODB_URI`;
  `packages/scanner/src/config.ts` reads `ODYSSEUS_ARTIFACTS_ROOT`. All the
  relocatability hooks exist; none need changing.
- `packages/interface/src/router.ts`'s `isAcceptableOrigin` is the CSRF
  posture, and its comment premises localhost binding. No auth, no session,
  no rate limiting exists anywhere in the package.
- `docker-compose.yml` runs test Mongo only, on purpose.
- The report needs its bundled fonts and `REPORT_PDF_CHROMIUM_ARGS`
  (trade-off 19); Playwright Chromium is the single browser dependency.
- Charter tension to resolve explicitly: the charter line "no public web
  interface to the audit engine itself" and the brief's "no auth needed
  anywhere" note (section 7, updated 2026-08-03) describe the current
  deliberate posture. The operator is deliberately revising both for the
  operator dashboard only. Step 5 writes the amendments; the executor must
  not treat those lines as a reason to stop, only as a reason to document.

## Scope

**In scope**: password session auth for every dashboard route; login/logout
pages (FR/EN, Nocturne tokens); rate limiting and lockout; deploy assets
(`Dockerfile` at repo root, `deploy/` with `compose.yaml`, `Caddyfile`,
backup script, runbook); provisioning runbook for a Scaleway VPS; nightly
artifacts backup to the existing Scaleway bucket with a tested restore drill;
charter, brief, trade-offs, and plans index updates.

**Out of scope**: multi-user or roles; moving Mongo off Atlas; any change to
`packages/site`; automatic send; any public client-facing surface; monitoring
and alerting (milestone 13 territory); plan 013's operator pages; mailbox
OAuth credentials on the server. Drafting stays a local CLI act in this plan,
so Gmail credentials never move; only a future plan that makes drafting
server-side may move them, with the operator present.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Auth tests | `pnpm exec vitest run packages/interface/src` | all pass |
| Full validation | `pnpm run check` | exit 0 |
| Image build | `docker build -t odysseus-app .` | builds clean |
| Local stack smoke | `docker compose -f deploy/compose.yaml up` | login works over Caddy |
| In-container PDF smoke | fixture PDF render inside the image | glyphs intact (trade-off 19) |

## Git workflow

- Work directly on `main`; do not create another branch.
- Commit with `Host the operator dashboard behind a password session`.

## Steps

### Step 1: Password session auth in `packages/interface`

Hash compare with `node:crypto` scrypt and `timingSafeEqual`; the password is
configured as `ODYSSEUS_DASHBOARD_PASSWORD_HASH` (scrypt `salt:hash`), never
plaintext. Login route plus bilingual login page following the existing
`public/` page pattern. Sessions are random 256-bit tokens in an in-memory
store with expiry and sliding renewal, carried in an HttpOnly, Secure,
SameSite=Lax, host-only cookie; a restart logs the operator in again, which
is acceptable for one user. Per-IP rate limiting with exponential lockout on
login failures. Pages redirect to login; API routes return JSON 401.

**Fail-closed rule**: without a configured hash, the server keeps today's
localhost-only unauthenticated behaviour (local dev and existing tests stay
honest); binding anything other than the loopback host without a hash refuses
to start. Re-check `isAcceptableOrigin` under the proxy: Caddy passes Host
through, so Origin must equal that Host, and the public site's host fails the
match, which is the desired same-site cross-origin protection. Pino must
never log the password, the hash, or the cookie.

**Verify**: route tests prove unauthenticated page redirect and API 401;
login sets the stated cookie flags; wrong-password lockout escalates;
logout clears; expiry works; the refuse-to-start rule fires; login page
strings pass the FR/EN parity test used by sibling pages.

### Step 2: Deploy assets

`Dockerfile` at repo root: `node:22-bookworm-slim`, pnpm fetch, `tsc -b`
build, Playwright Chromium plus system deps and the report's fonts, non-root
user, `ODYSSEUS_ARTIFACTS_ROOT` pointed at a mounted volume, Chromium launch
args verified in-container (sandbox flags for rootless container use, and
trade-off 19's `--font-render-hinting=none` still applied only to the
report's own launch). `deploy/compose.yaml`: `app` (never published to the
host's public interfaces) plus `caddy` (80/443, cert storage volume)
proxying to the app with Host passed through, `restart: unless-stopped`.
`deploy/Caddyfile` serves `app.odysseusaudit.com` with automatic HTTPS.
`deploy/runbook.md` records every command this plan and step 3 run.

**Verify**: image builds; `deploy/compose.yaml` up locally with a stub hash
serves the login page through Caddy; a scan of `fixtures/spa-demo` started
through the dashboard completes and the fixture PDF renders with intact
glyphs inside the container; everything torn down afterwards and `pgrep`
confirms no fixture server survived.

### Step 3: Provisioning with the operator (wizard-assisted)

Scaleway VPS (Debian 12, 2 to 4 GB RAM), SSH key-only, ufw allowing only SSH,
80, 443, unattended-upgrades, non-root deploy user, Docker, repo plus
`deploy/` synced, server `.env` written by hand with the operator present
(`MONGODB_URI`, password hash, Mistral key, Scaleway preview credentials).
DNS A record for `app.odysseusaudit.com` to the VPS IP. Atlas IP allowlist
gains the VPS IP.

**STOP**: do not narrow or remove the operator's home IP in the Atlas
allowlist without the operator explicitly confirming nothing else needs it;
do not copy mailbox or Gmail credentials to the server (out of scope above);
stop and record if the in-container PDF render diverges from trade-off 19
expectations before proceeding.

**Verify**: dashboard reachable over `https://app.odysseusaudit.com`, login
succeeds, a wrong password locks, logs carry no secrets, `systemd`/compose
restart policy proven by an actual reboot.

### Step 4: Artifacts backup and restore drill

Nightly timer (systemd timer or a small rclone container; no npm dependency)
tars the artifacts root to the existing Scaleway bucket, 30-day retention.
Confirm Atlas's own backup tier is active for `MONGODB_URI`; if it is not,
add a weekly `mongodump` to the same bucket. `deploy/runbook.md` documents
the restore procedure.

**Verify**: a restore drill into a scratch directory yields an artifacts tree
the tool reads (manifest and screenshots resolve), run once, recorded in the
runbook with the date.

### Step 5: Campaign posture and documentation

Crawls now originate from the VPS IP with the same user agent, robots
behaviour, and pacing; the first real prescan batch from the VPS is
operator-witnessed (browser audits remain deliberate acts per the charter's
live-site rules). Documentation, same-commit: charter's "no public web
interface" line gains a superseding note pointing at the new trade-offs
entry; the brief's section 7 "no auth needed anywhere" note is amended the
same way and section 7 gains the new milestone entry; `plans/README.md` row
flips to `IMPLEMENTED` then `DONE` per its own rules; a new numbered
`docs/decisions/trade-offs.md` entry records the decision, the rejected
alternatives with reasons, the origin-check assumptions behind a proxy, the
in-memory session model, and the credentials that deliberately did not move.

**Verify**: `pnpm run check` green; every amended document cross-links the
trade-offs entry; the runbook alone suffices to rebuild the server from
scratch.

## Status notes

- Registered 2026-08-30 at `dbba6ba`, operator-approved same day. Status
  `TODO` until plan 013 completes.
