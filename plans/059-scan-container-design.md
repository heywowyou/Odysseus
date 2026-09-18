# Plan 059 §4.1 — the secretless scan container: design and feasibility

> **Status**: written analysis, not an implementation. The operator decision
> recorded in `059-execution-handoff.md` §1 is **build the secretless scan
> container** — not "accept the risk", not gVisor. This document is the design
> the next execution session builds from, written so nothing in it has to be
> re-derived from the code again. It was judged too large to land unattended in
> one slice; the staged plan in §9 is the answer to that.
>
> **Two invariants this document does not touch.** `APPROVED_ISOLATION_PROFILES`
> stays exactly `['secretless-scan-container', 'gvisor']`
> (`packages/scanner/src/browser-isolation-preflight.ts`); the test at
> `packages/scanner/src/browser-isolation-preflight.test.ts:63` refuses
> `rootless-userns-container` and must keep refusing it. The preflight logic in
> `assessBrowserIsolation`/`assertBrowserIsolation` is unchanged by this design;
> only its *wiring* is specified here.
>
> **Production approval stays blocked today and stays blocked until the
> container actually deploys.** Nothing in this document attests isolation that
> does not exist yet.

---

## 1. Ground truth today

`odysseus serve` (`packages/cli/src/commands/serve.ts` →
`startInterfaceServer` in `packages/interface/src/server.ts`) is one process
that holds all of:

- the HTTP dashboard and its routes (`packages/interface/src/routes/`);
- the Mongo-backed job queue (`JobQueue` in
  `packages/interface/src/queue/job-queue.ts`; claims are the atomic
  `claimNextQueuedJob` `findOneAndUpdate` in `packages/store/src/jobs.ts`,
  which stamps a fresh `claimId: randomUUID()` on the claimed row);
- the browser scan (`runAuditStage` in
  `packages/interface/src/pipeline/audit-stage.ts` calls
  `launchBrowser` + `scanSite` in-process);
- the LLM analysis and report/PDF rendering (`runAnalysisStage`,
  `runAllReportsStage`, which launches a second Chromium through
  `packages/report`'s print-to-PDF path).

**The Mongo-claim paradox.** The scan cannot be lifted into its own container
by letting that container claim jobs from the queue: claiming requires
`MONGODB_URI`, which is exactly the secret the container must not hold. The
resolution is ownership: the app container keeps the queue and every database
touch, and *calls* the scan container over a narrow channel that carries scan
options in and artifacts/progress out.

**The seam is real.** In `runAuditStage` the browser phase —
`launchBrowser` → `buildRunAuditScope` → `scanSite` → `writeAuditArtifacts` →
`normalizeAudit` → `writeFindingsFile` → `writeManifestFile` →
`runEvidenceGraphStage` → `pruneScreenshots` — runs entirely against local
disk and the public network. The first database touch (`getProspectHub`) and
the first bucket touch (`syncAuditDirToBucket`) both happen strictly after it.
Everything before `persistAudit` needs no Mongo connection, no bucket
credentials, and no model key.

**Why the gate is currently open-shaped.** Chromium runs in the app container
as the same unprivileged user as `odysseus serve`, with
`ODYSSEUS_CHROMIUM_EXTRA_ARGS: --no-sandbox --disable-dev-shm-usage`
(`deploy/compose.yaml`), next to `MONGODB_URI`, the model key, mailbox
credentials and bucket keys (`docs/decisions/trade-offs.md` entry 92, amended
by entry 99: the browser env is sanitized, which narrows but does not close the
blast radius). Today's deployment can truthfully declare neither approved
profile, so `assertBrowserIsolation` is deliberately **not wired into scan
start** — the evidence graph *records* the isolation verdict
(`runEvidenceGraphStage` in
`packages/scanner/src/artifacts/evidence-graph-stage.ts` calls
`assessBrowserIsolation` and the fingerprint records
`containerProfileId: 'undeclared'`), which is why every real audit is assessed
`failed` / `environment-unapproved`. That is the intended fail-closed state
(handoff §0.2), not a defect.

---

## 2. Target topology

Two services, one image, different command and environment:

| | `app` (existing) | `scan` (new) |
| --- | --- | --- |
| Image | `odysseus-app` (Dockerfile unchanged) | same image |
| Command | `serve` (unchanged) | new `scan-service` CLI subcommand |
| Secrets | Mongo URI, model key, mailbox, buckets, dashboard hash | none (see §2.1) |
| Volumes | `artifacts:/data/artifacts` | `artifacts:/data/artifacts` (same named volume) |
| Network | compose internal net + Caddy front | compose internal net; **no published ports**; public egress |
| Browser | none after the cut-over (PDF render stays initially, §2.2) | the audit browser only |
| Queue/DB | owns Mongo, the queue, all stages after acquisition | none |

The scan container's command is `node packages/cli/dist/index.js scan-service`
beside the existing `CMD ["…", "serve"]` in the `Dockerfile` — the image keeps
`serve` as its default, and only compose changes the command, exactly as
handoff §4.1 proposes ("same image; only command and environment differ").

### 2.1 The scan container's environment — complete list

The scan service gets **no `env_file`** — no `.env` is read (the image already
cannot contain one: `.dockerignore` excludes `.env`/`.env.*`, and
`packages/scanner/src/config.ts`'s `ensureEnvLoaded` tolerates the missing
file). Everything below arrives as explicit compose `environment:` entries.

**Required by the scan container:**

| Variable | Why it is genuinely needed |
| --- | --- |
| `ODYSSEUS_ARTIFACTS_ROOT=/data/artifacts` | `getArtifactsRoot()` anchors every artifact path; unset it would fall back to `<workspace>/artifacts` inside the container, off the volume. |
| `ODYSSEUS_CHROMIUM_EXTRA_ARGS=--no-sandbox --disable-dev-shm-usage` | Deployment Chromium flags (rootless container cannot create the sandbox namespaces). Parsed by `parseChromiumExtraArgs` in `packages/scanner/src/browser.ts`. This flag is precisely why a profile attestation is required at all. |
| `ODYSSEUS_BROWSER_ISOLATION_PROFILE=secretless-scan-container` | The attestation itself. Set **only** on the scan service — never on `app`, which must keep failing any preflight it were to run (§6). |
| `ODYSSEUS_SCAN_SERVICE_TOKEN` | Shared random token; the `app` sends it and the `scan` service requires it on every request (§3.5). Secret-shaped by name, stripped from the browser env by `buildSanitizedBrowserEnv` like any other. |
| Crawl knobs: `MAX_PAGES`, `MAX_CRAWL_DEPTH`, `CRAWL_DELAY_MS`, `SCAN_CONCURRENCY`, `PAGE_TIMEOUT_MS`, `LIGHTHOUSE_TIMEOUT_MS`, `RENDER_SETTLE_TIMEOUT_MS` | `runAuditStage` clamps per-job options against these (`Math.max(delayMs, getCrawlDelayMs())`, `Math.min(scanConcurrency, getScanConcurrency())`) and the `AuditConfigSnapshot` records the effective values, so the *clamp ceiling now lives in the scan container*. Both services must carry identical values — define them once in compose (YAML anchor shared by `app` and `scan`) so they cannot drift. After the cut-over the scan side's values are the authoritative ones for clamping; app-side copies exist only to stay identical. |
| `PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright` | Already baked into the image (`ENV` in the `Dockerfile`); listed so nobody "cleans it up" from the compose env. |
| `ODYSSEUS_BUILD_ID`, `ODYSSEUS_BUILT_AT` | Stamped at image build (issue #58); `readOdysseusBuildId` feeds the environment fingerprint's build profile. Same image, so same values as `app`. |
| `ODYSSEUS_SCAN_SERVICE_HOST` / port binding | The service binds the compose-internal interface (e.g. `0.0.0.0:4700` inside the network — unreachable from outside because nothing is published). |

**Deliberate exception to recommend at deployment review:**
`CRUX_API_KEY`. `scanSite` fetches CrUX field data itself
(`packages/scanner/src/scan-site.ts:1996`) and folds the result into the
manifest, so moving the fetch app-side would split manifest provenance across
the trust boundary — the honest options are "pass it" or "lose CrUX".
`CRUX_API_KEY` is a read-only public-data key, is not a database/model/bucket/
mailbox credential (the trade-off 92 list), and never reaches the browser
process because `isSecretEnvName` matches `_KEY$` and
`buildSanitizedBrowserEnv` strips it at launch. Recommendation: pass it,
record the decision in `deploy/runbook.md` §7C when the container deploys, and
treat any *new* credential-shaped variable on this service as a review stop,
not a pattern extension.

**Forbidden on the scan container (each because the whole profile claim
depends on its absence):** `MONGODB_URI` / `MONGODB_DB_NAME`, model keys
(`OPENAI_API_KEY` and every Plan-058 report-quality variable), bucket
credentials (`ODYSSEUS_ARTIFACTS_BUCKET_*`, `ODYSSEUS_PREVIEW_BUCKET_*`),
mailbox variables (`MAILBOX_ENV_VARS` in `packages/interface/src/config.ts`),
`DASHBOARD_PASSWORD_HASH`, `SENTRY_DSN`/Langfuse keys, the
`ODYSSEUS_*_FILE_PATH` registry inputs (the obligation stage stays app-side),
and any `env_file`/`.env` mount of any kind.

### 2.2 What about PDF rendering?

Trade-off 92's remedy names "scanning and PDF rendering" together, but the
handoff's proposed service and the plan's gate (`assertBrowserIsolation` is
specified as a *scan-start* check; the PDF browser renders locally generated
HTML, not page-origin JavaScript) scope this design to acquisition. The PDF
render stays in the `app` container initially and remains covered by the
existing accepted risk; moving it into the scan service (or a sibling) is a
follow-up that reuses the same service shell and is explicitly **not** a
prerequisite for wiring the preflight for scans. Do not let scope-creep here
delay the gate.

---

## 3. The scan service boundary

### 3.1 Process shape

A new CLI subcommand `scan-service` (packages/cli, beside
`commands/serve.ts`) boots an HTTP server and nothing else: no Mongo
connection, no bucket client, no model client, no mailbox poller. Its whole
job is to run the acquisition phase (§3.2) for one caller.

### 3.2 The seam, made into a module

Extract from `runAuditStage` an **acquisition stage** with *no* `@odysseus/store`
import — the extraction is proven by a dependency-cruiser rule added in the
same slice (verified by `pnpm run architecture:check`), because file-level
discipline alone would not survive the next refactor:

```text
runAcquisitionStage(url, options)            # scan container (and still callable in-process)
  launchBrowser({ networkPolicy: PUBLIC_SITE_NETWORK_POLICY })
  buildAuditDir(getArtifactsRoot(), hostname, startedAt)
  writeAcquisitionLease(auditDir, claimId)
  audit-scope.json write (buildRunAuditScope)
  scanSite({ …, writePagesAsScanned: true, checkpointContext, onResumeDecision })
  writeAuditArtifacts → normalizeAudit → writeFindingsFile → writeManifestFile
  runEvidenceGraphStage (graph + assessment; approval is NOT written here)
  pruneScreenshots
  → returns { manifest, findings, auditDir, visitedCount, prunedPageDirCount,
              coverageSummary, evidenceGraph, launchEnvironment }
```

`runAuditStage` is then re-expressed as: `runAcquisitionStage` + the existing
post-sequence (`getProspectHub`, `runObligationStage`, `persistAudit`, bucket
sync, read-back, approval, manual-field writes). The CLI path and the in-process
queue path keep byte-identical behavior; `git` diff on the stage's post-sequence
should be pure motion.

Two inputs move from process state to explicit payload fields:

- `launchEnvironment`: the scan-side environment facts the evidence graph and
  fingerprint must record about the machine that actually acquired the
  evidence — `launchArgs` (already collected by `launchBrowser`), the
  isolation assessment, and `describeCurrentRuntimeProfile(...)` (node/kernel/
  cores/memory of the scan container). Today these are read from the scanning
  process implicitly (`evidence-graph-stage.ts` reads
  `process.env['ODYSSEUS_BROWSER_ISOLATION_PROFILE']` and hardcodes
  `containerProfileId: 'undeclared'`). After the split the *app* passes the
  scan-reported values in; it does not read its own env for them, because its
  env is no longer the acquiring environment.
- the acquisition claim (§3.4).

### 3.3 `POST /scan` contract

One request carries options, one response streams progress and ends with the
result. No run-store, no polling endpoint, no second service.

- **Request**: `POST /scan` with header `Authorization: Bearer
  <ODYSSEUS_SCAN_SERVICE_TOKEN>` and a JSON body:
  `{ jobId, claimId, runIdentity: { startedAt, auditId }, url, options }`,
  where `options` is exactly what `crawlOptionsFromJob`
  (`packages/interface/src/queue/pipeline/job-crawl-options.ts`) already maps —
  `maxPages`, `maxDepth`, `delayMs`, `scanConcurrency`, `seeds`,
  `exclusions`, `bookingEngineUrl` — plus `scanIntent`, `skipLighthouse`,
  `sitemapMode`, `manualSiren` stays **out** (it feeds `runObligationStage`,
  which is app-side), and `prospectId` stays **out** (identity sync is
  post-seam, app-side).
- **Response**: `text/event-stream` (SSE). Recommendation and rationale:
  progress is a strictly one-directional JSON event flow, which is exactly
  SSE's shape; it needs no dependency (unlike WebSockets), traverses any
  future reverse-proxy hop, and its comment-heartbeat gives the app a
  watchdog for a silently-dead scanner (§4). The app consumes the stream
  programmatically with `fetch` + an `AbortSignal`; reconnection semantics
  are irrelevant because a dropped stream is a cancellation (below).
  Framing: the first event is `scan-id` (the service's run handle); then the
  `ScanProgressEvent` union from `packages/scanner/src/scan-site.ts` verbatim
  as `progress` events; then exactly one terminal event — `result` (the
  acquisition payload of §3.2), `error` (message + classification), or
  `cancelled`.
- **Idle watchdog**: the service emits an SSE comment at least every 30s; the
  app treats silence beyond a generous bound (recommend 30 minutes — a single
  Lighthouse page can legitimately run ~2 minutes under throttling, and
  `DEFAULT_LIGHTHOUSE_TIMEOUT_MS` is 120s, so 30 minutes is far outside any
  legitimate page) as scanner death.
- **Concurrency**: the service runs one acquisition at a time and answers
  `409` when busy. `DEFAULT_QUEUE_CONCURRENCY` is 1
  (`packages/interface/src/config.ts`), and `OriginLock` already serializes
  same-origin work in the app, so v1 needs no internal pool; if
  `QUEUE_CONCURRENCY` is raised later, the service, not the app, is the
  capacity bound and the app maps `409` to requeue-with-backoff.
- **Errors map to the terminal event, never to fabricated success**: a
  `StaleAcquisitionLeaseError` is reported as `superseded` (the app writes
  nothing, mirroring `JobQueue.runJob`'s handling); `JobCancelledError`
  semantics travel as `cancelled`; anything else is `error`.

### 3.4 How cancellation, the plan-035 checkpoint and the step-22 lease survive

**Cancellation.** Today the operator's stop is written durably
(`cancel-requested`) and delivered in-process by `CancellationRegistry`
(`packages/interface/src/queue/cancellation.ts`), observed inside
`createScanProgressReporter` (`report-progress.ts`), which throws
`JobCancelledError` between pages and force-closes the run's Chromium
contexts via the `PageWorkGuard`. Across the boundary:

1. the cancel route keeps working unchanged for the *document*;
2. the app additionally detects `isRequested(jobId)` while draining the SSE
   stream (the reporter logic moves to the app side of the stream) and calls
   `POST /scan/<scan-id>/cancel`;
3. the scan service runs the same observer loop stream-side: between pages it
   checks its own cancellation flag, calls `guard.closeAll()`, and stops —
   the exact mechanics that make a stop land within one page of work today;
4. a dropped SSE connection sets the same flag. Justification: the stream's
   only legitimate consumer is the app process that owns the run; if that
   process died, the queue's startup recovery (`resetOrphanedRunningJobs`)
   requeues the job and a fresh `POST /scan` with the same `runIdentity`
   resumes from the checkpoint. A hung connection is not allowed to keep a
   dead run's browser alive for hours.

**Plan-035 crawl checkpoint.** Nothing about it crosses the channel, because
it never lived in process state: `crawl-checkpoint.json` / `crawl-state.json`
(`packages/scanner/src/artifacts/crawl-checkpoint-io.ts`) sit in the audit
directory, which is on the shared `artifacts` volume. The service passes
`checkpointContext: { startedAt, config }` and `onResumeDecision` exactly as
`runAuditStage` does today; `startedAt` comes from `runIdentity` in the POST
body, which the app mints once per job (`ensureJobRunIdentity`) exactly as
now — so an orphaned run's replacement lands in the same directory and
reuses every per-page result on disk. **Deletion stays app-side**:
`deleteCrawlCheckpoint`/`deleteCrawlStateFile` at `completeJob`
(`run-full-audit-job.ts`) — the checkpoint must outlive the job's terminal
transition for the same post-audit-crash reason documented there, and the
service must never treat job completion as its business.

**Step-22 acquisition lease.** The lease is a *file* protocol
(`acquisition-lease.json`, `writeAcquisitionLease`/`assertAcquisitionLease`
in `packages/scanner/src/artifacts/acquisition-lease-io.ts`) plus one Mongo
read (`isJobClaimCurrent`). Split it along the same line as everything else:

- the service receives `claimId` in the POST body, writes the lease file
  before any acquisition, and its `holdClaim` equivalent does the **file
  half** (`assertAcquisitionLease`) before each evidence write — unchanged
  code, because the file check never needed Mongo;
- the app owns the **Mongo half**: it watches the progress stream and checks
  `isJobClaimCurrent(connection, jobId, claimId)` (a) on every `phase`
  transition it forwards to `reportJobPhase`, and (b) once after the terminal
  event; when the claim has gone stale it cancels the remote run and writes
  nothing — a superseded worker's row belongs to the new claim, exactly as
  `JobQueue.runJob` treats a local `StaleAcquisitionLeaseError` today.

The two halves compose: a re-claimed job sends a second `POST /scan` whose
`writeAcquisitionLease` overwrites the file, so the superseded remote run
stops at its next file check even if the app-side Mongo-driven cancel was
late. Both workers share the volume; the lease protocol already assumes
exactly that.

---

## 4. Job ownership and failure modes

The app container keeps the queue, mints run identities, holds claims, calls
the scan container, and performs every post-acquisition stage. Honest
dispositions, per handoff §4.1's rule — fail closed, never fabricate evidence:

| Failure | Detection | Disposition |
| --- | --- | --- |
| Scan container down at dispatch | connection refused on `POST /scan` | `failJob` with the transport error. No evidence exists; nothing may be invented. Operator (or a future requeue policy) retries; the queue is not silently wedged because the claim loop keeps claiming — consider a dispatch-failure backoff only if flapping is observed in practice. |
| Scan container crashes mid-scan | SSE stream ends without a terminal event (or watchdog silence) | Treat as a failed run: cancel the remote side if anything is still listening, `failJob`. On any requeue, the same `runIdentity` + volume-resident checkpoint resume the crawl — this is *better* recovery than today's in-process crash, not worse. |
| Run exceeds sane lifetime | watchdog silence beyond the §3.3 bound | Same as a crash. The bound must be generous; a false kill costs a resume, not evidence. |
| Partial artifacts after any of the above | directory exists, graph incomplete | Left in place, exactly as a crashed in-process run leaves them. They are never approved: approval is written app-side only after the graph verdict, the bucket sync and the byte-for-byte read-back (`audit-stage.ts`, plan step 38). A later resume overwrites/reuses per plan 035's identity rules. |
| Scan service reports `error` | terminal event | `failJob` with the service's message. Classification (`classifyJobError`) keeps telemetry truthful. |
| Scan service reports `superseded` | terminal event | Write nothing, mirror `runJob`'s `StaleAcquisitionLeaseError` branch. |
| Scan service reports `cancelled` | terminal event | `cancelJob` safety-net write, as `runJob` does for `JobCancelledError`. |
| App container dies mid-stream | the service notices the drop and cancels the run | Startup recovery requeues the job; resume per above. |
| App-side stage fails after a successful acquisition | existing stage errors | Unchanged from today: job requeues, `persistAudit` upserts, checkpoint avoids a re-crawl. |
| Scan service fabricates or corrupts evidence | n/a — trust boundary | The service has **no completion authority**: it cannot mark a job complete, write Mongo, touch the bucket, or write `approved-audit-evidence.json` (approval is produced app-side after the private store read-back). Residual risk, stated plainly: a *compromised* scan container can write arbitrary bytes into the artifacts volume, so content-level poisoning of acquisition artifacts is not prevented by this design; it is raised in cost by the evidence graph's consistency gates and the fingerprint binding, and a cryptographic attestation from scanner to app is a possible follow-up, explicitly out of scope here. |

---

## 5. Isolation profile wiring

**What `secretless-scan-container` must truthfully mean at run time.** For a
scan started with `ODYSSEUS_BROWSER_ISOLATION_PROFILE=secretless-scan-container`,
all of the following are statements about the *scan container*, and all must
hold at deployment (they are verifiable, not aspirational — see §8):

1. Chromium runs with `--no-sandbox` (rootless container), so an approved
   equivalent profile is required — that is the branch
   `assessBrowserIsolation` takes into `profile: 'approved-equivalent'`.
2. The process is not root (uid 10001 in the image; the preflight's
   `running-as-root` check enforces this independently).
3. The environment contains no Mongo URI, no model key, no bucket or mailbox
   credential, and no `.env` was read — the preflight's
   `credentials-visible-to-browser` check verifies the sanitized env names;
   §2.1's compose list is the human-reviewed complement (the gate checks
   *shape*, the deployment review checks *this list*).
4. Every scan runs under the `public-site` network policy (the preflight's
   `non-production-network-policy` check), and the CDP debug port stays on
   loopback inside the container (its `remote-debugging-exposed` check).
5. The only writable path with audit artifacts is the shared volume; there is
   no Docker socket, no host bind mount, no credential file.

**Where `assertBrowserIsolation` lands.** Inside the acquisition stage, after
`launchBrowser` returns (so `launchArgs` are the real, complete flag set) and
before any navigation:

```ts
assertBrowserIsolation(
  describeCurrentBrowserEnvironment({
    chromiumArgs: launchEnvironment.launchArgs,
    networkPolicyId: PUBLIC_SITE_NETWORK_POLICY.id,
  }),
);
```

This is the exact call shape `runEvidenceGraphStage` already *records*; the
change is only that it now *throws before the browser navigates* — plan §21
makes preflight failure a stop condition, and the point of stopping here is
that every later stopping point has already executed the page's JavaScript.

**The gate logic is untouched.** No new profile, no softening, no env-driven
bypass. What changes is *who must pass it*:

- **Scan-service path** (the container exists): the assertion runs and must
  pass, because the deployment can truthfully declare the profile.
- **In-process path** (`ODYSSEUS_SCAN_SERVICE_URL` unset — local dev, CLI,
  un-migrated deployments): the preflight stays **assessed, not asserted**,
  exactly as today. Wiring it unconditionally would refuse every current
  deployment at scan start, which is the state the handoff forbids
  improvising into ("do not soften the preflight to make a deploy green" —
  and equally, do not harden it before its remedy exists, which would make
  every local scan impossible). The evidence graph continues to record the
  verdict, so approval stays blocked for un-isolated runs.

**App-side validation of scan-reported facts.** The app does not blindly copy
the service's claimed profile into the fingerprint: it checks the reported
`declaredIsolationProfileId` against `APPROVED_ISOLATION_PROFILES` and the
reported assessment's `ok` flag before recording, and a mismatch is a failed
run. This costs nothing (the lists are exported constants) and keeps the
app from laundering a misconfigured service's self-description into evidence.
`containerProfileId: 'undeclared'` in
`packages/scanner/src/artifacts/evidence-graph-stage.ts` becomes the scan-
reported profile id; the app-side default stays `'undeclared'` for in-process
runs.

**Production approval remains blocked** until this wiring is live against a
real deployment: the graph keeps failing audits `environment-unapproved`
while scans run in-process, and that remains the correct answer on
workstations and un-migrated servers.

---

## 6. Network egress and compose policy

**Connection-time enforcement does not move.** The scan container runs the
same `launchBrowser({ networkPolicy: PUBLIC_SITE_NETWORK_POLICY })`, which
starts the loopback egress proxy (`packages/scanner/src/egress-proxy.ts`):
Chromium is pinned to proxy args, the proxy resolves, classifies via
`checkNetworkTarget` (`packages/scanner/src/network-target-policy.ts`),
refuses private/reserved/metadata space, and connects only to the addresses
it classified (`assertPinnedAddress`). Redirect hops go through
`checkRedirectTarget`. Scanner-side fetches (robots, sitemap, CrUX, security
headers) use the same policy. Job payloads cannot select another policy
(`resolveNetworkTargetPolicyForJob` refuses anything but `public-site`).
Nothing in this design adds, widens, or makes configurable any of that.

**Compose-level posture for the `scan` service** (all verifiable from the
compose file at review):

- joins the existing internal compose network; **no `ports:`** — nothing is
  published. The app reaches it over the internal network only; Caddy never
  routes to it;
- no `extra_hosts`, no host bind mounts; the single volume is the named
  `artifacts` volume;
- candidate hardening to prove on the production host before relying on it
  (runbook §7C's own rule: prove it, never assume it): `security_opt:
  [no-new-privileges]`, `cap_drop: [ALL]`, `pids_limit` (Chromium fans out
  renderer processes; size from observation, not hope), `mem_limit`/`cpus`
  sized for a Lighthouse run, and a `shm_size` consistent with
  `--disable-dev-shm-usage`;
- the app service loses `ODYSSEUS_CHROMIUM_EXTRA_ARGS: --no-sandbox` *only if*
  it also stops launching scan browsers entirely (PDF render still launches
  Chromium there — see §2.2; keep the flag until the PDF path moves, and keep
  `app` unable to pass any preflight, per §5).

The scan container needs DNS + public egress (that is its job) and the app↔scan
internal route; it does not need, and with no credentials cannot use, any route
to Mongo/Atlas or the bucket — which is the difference between "network
segmentation" and "theft of a useless network path".

---

## 7. Security review checklist (deployment gate, not code)

Run this at deployment review and record it in `deploy/runbook.md` §7C:

- [ ] Runs as uid 10001 (`odysseus`), never root; `running-as-root` preflight
      check would refuse otherwise.
- [ ] No `.env` in the image (`.dockerignore`), no `env_file` on the service,
      `ensureEnvLoaded` finds no file; environment matches §2.1's allow list
      and nothing else (`docker inspect` / `docker compose config` diff).
- [ ] `isSecretEnvName` over the service's env yields only
      `ODYSSEUS_SCAN_SERVICE_TOKEN` and (if adopted) `CRUX_API_KEY`, and both
      are absent from the launched Chromium env (`buildSanitizedBrowserEnv`).
- [ ] No Docker socket, no `/var/run` mounts, no host paths beyond the named
      volume; `cap_drop: [ALL]` + `no-new-privileges` verified live.
- [ ] CPU/memory/pids limits set and observed under a real scan; the service
      cannot starve the host.
- [ ] Service port unpublished; reachable only from the compose network;
      rejects requests without the bearer token (negative test in the slice).
- [ ] No Mongo/bucket/model/mailbox variables; with env leaked, an attacker
      obtains nothing that opens any production system.

**What a compromised page context can and cannot reach.** Chromium runs
sandbox-less by necessity, so a renderer exploit must be assumed to reach
code execution at the `odysseus` uid *inside the scan container*. It can:
reach the public internet through the egress proxy (policy-filtered),
read/overwrite artifacts on the shared volume (any audit's — the volume is
not per-run fenced; stated as residual risk), consume the container's
resources, and replay the scan-service token against its own service. It
cannot: read or write Mongo, the bucket, the model key, the mailbox, the
dashboard, or any other host file; reach internal/metadata address space
(classified and refused); or mark evidence approved. That is exactly the
blast-radius trade the operator bought: from "everything" to "artifacts and
egress". Per-run volume fencing or scanner-to-app signatures would narrow it
further and remain future work.

---

## 8. Staged rollout

Every slice is offline-testable (loopback fixtures under the test-only network
policy, stub runners at the HTTP seam); no slice requires a live third-party
site. Each slice is one commit/PR-sized change; `pnpm run check` + the named
tests gate it. The **flag gate** for production behavior is
`ODYSSEUS_SCAN_SERVICE_URL` on the app: unset (default) ⇒ every existing call
path behaves exactly as today, in-process; set ⇒ dispatch. The scan service
itself is inert unless something calls it.

**Slice 1 — extract the acquisition seam (no container yet).**
New module with `runAcquisitionStage` as in §3.2; `runAuditStage` refactored
to call it plus the unchanged post-sequence; dependency-cruiser rule forbids
`@odysseus/store` imports in the module; `launchEnvironment` captured.
Tests: existing `audit-stage`/`run-full-audit-job` suites pass unmodified
(behavior identical); a focused test asserts the extraction writes
`audit-scope.json`, lease, findings, manifest, graph in one call; unit test
that the clamp math reads only its injected config.

**Slice 2 — the scan service command and channel.**
`scan-service` CLI command; HTTP layer implementing §3.3 (SSE framing, token
auth, one-at-a-time, cancel endpoint, terminal-event mapping); client in
`packages/interface` used by `runFullAuditJob`/`runQuickCheckJob`/
prospecting runners only when `ODYSSEUS_SCAN_SERVICE_URL` is set; app-side
claim watching and cancellation forwarding per §3.4.
Tests (offline, by construction): the service is constructed with an
*injected acquisition runner*, so contract tests drive it with a stub —
progress framing, terminal events, `409` on busy, auth rejection, cancel
mid-stream lands as `cancelled` and invokes `guard.closeAll()`,
`superseded` mapping; client tests assert option mapping equals
`crawlOptionsFromJob`'s output and that a dropped stream surfaces as a
run failure. Real-scan behavior stays covered by the existing scanner e2e
suite against loopback fixtures, which Slice 1 did not disturb.

**Slice 3 — preflight wiring and provenance plumbing.**
`assertBrowserIsolation` in the acquisition stage (§5), active on the
service path and inert in-process (flag-conditional); scan-reported
environment flows into `runEvidenceGraphStage` inputs; app-side validation
against `APPROVED_ISOLATION_PROFILES`; `containerProfileId` stops being
hardcoded `'undeclared'` on the service path.
Tests: assertion fires before navigation with a bad env (negative test —
plan-quality gate 7); in-process path still records-but-does-not-assert;
app rejects a service claiming an unapproved profile; fingerprint digest
changes when the reported profile changes.

**Slice 4 — compose and deployment artifacts.**
`scan` service in `deploy/compose.yaml` (§2, §6; YAML anchor for shared
crawl knobs; token generation in the runbook procedure), smoke overlay
entries in `deploy/compose.smoke.yaml`, `pnpm run test:deploy` coverage for
the new service block, runbook §7C rewrite (the "not yet wired" paragraph
becomes the deployment checklist §7), trade-offs entry recording the
deployment decision and the §7 review results.
Tests: `deploy/*.test.sh` style static checks; smoke runbook updated.

**Slice 5 — live-environment verification (blocked until a host exists).**
The items that cannot close offline, listed so nobody pretends otherwise:
Chromium launch under `cap_drop: [ALL]`/`no-new-privileges`/limits on the
real host (runbook §7C's "prove it on the production host first" rule);
the §7 checklist executed against the deployed compose; one real named-site
rehearsal (done criterion 44) which additionally requires the operator's
fresh authorization for `www.villasfoch.fr`; plan §19/criterion-43 corpus
work (§5.1 of the handoff — still artifact-blocked, unrelated to this
design but still gating DONE).

**What stays blocked until the container actually deploys** (unchanged from
the handoff, restated so the boundary is explicit): `assertBrowserIsolation`
on the in-process path; production `ApprovedAuditEvidence` (every audit stays
`environment-unapproved` while scans run beside secrets); the live rehearsal;
and 058 promotion behind it.

---

## 9. Feasibility verdict

**Buildable and integration-testable offline, by one agent session, in the
five slices above — with two named exceptions.** The seam is real and already
runs the browser phase to completion with no database or bucket touch; the
lease is a file protocol that already tolerates a shared volume and needs no
Mongo in the scan container; progress, cancellation and resume all have
existing in-process mechanics that map onto the channel without weakening
anything; and the offline proof strategy is honest: scanner behavior stays
covered by the loopback e2e suite, and the service boundary is covered by
contract tests over an injected runner. The exceptions: (1) the host-level
hardening claims (caps, limits, launch under restriction) and the §7 checklist
are verifiable only on the real deployment host, and the design deliberately
does not declare them true — Slice 5 owns them; (2) no live third-party scan
can be run from an agent session, so end-to-end behavior against a real
hotel awaits the operator's fresh rehearsal authorization. Nothing in this
design requires touching `packages/core/src/normalize/`, `findings.ts`, or
`manifest.ts`; the fixture fingerprint is unaffected.

---

## 10. Unchanged invariants (checklist for the implementer)

- `APPROVED_ISOLATION_PROFILES` is not edited. The
  `rootless-userns-container` refusal test keeps passing.
- `assessBrowserIsolation` / `assertBrowserIsolation` /
  `describeCurrentBrowserEnvironment` logic is not edited; only called.
- The preflight is not softened, and is not hard-wired onto paths that cannot
  pass it today (in-process scans keep assess-without-assert until the
  container is the way scans run).
- `NetworkTargetPolicy` enforcement is not moved, made configurable, or
  widened; the scan container runs the same connection-time proxy.
- The scan container never receives or reads `.env`, Mongo, model, bucket or
  mailbox credentials; the app keeps every queue/DB/bucket/approval
  responsibility; the scan service never holds completion authority.
- Plan 035 checkpoint semantics, step-22 lease semantics, and the plan-059
  fail-closed dispositions in §4 survive the boundary with their guarantees
  intact.
- No code is written by this document itself; production approval remains
  blocked until the container is real, and that is the intended state.
