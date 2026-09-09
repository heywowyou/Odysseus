# Plan 035: Full-audit checkpoint and resume across crashes and redeploys

Added 2026-09-09, operator-approved via scoped interactive decisions the same
day. Resolves GitHub issue #124: a full audit runs inside one container
lifetime and nothing it completes is resumable, so every redeploy or crash
silently forfeits the whole run. The 2026-09-08 incident lost a five-hour,
79-of-202-page content scan to a routine redeploy; with issue #111's slow
pacing making 10-plus-hour audits routine, the exposure window is no longer
rare.

## Outcome

A full-audit job that is orphaned by a redeploy, crash, or OOM and then
re-claimed continues from what already finished on disk instead of restarting
from zero. Specifically:

1. The audit directory is stable across re-claims of the same job, so the
   per-page results that already stream to disk (`writePagesAsScanned`,
   issue #64) are reusable.
2. The crawl inventory is checkpointed right after the crawl coverage gate
   passes, so any post-crawl crash skips re-crawling entirely.
3. The content-scan and Lighthouse phases skip pages whose results are
   already on disk and replay the planner deterministically for the rest.
4. A crash during the crawl itself resumes from a persisted frontier rather
   than re-crawling visited pages.
5. A fast container bounce can no longer wedge a job as `running` forever.
6. The release flow refuses to recreate the container while a job is
   running, unless the operator explicitly overrides.

## Scope and non-goals

- In scope: the full-audit path only (staged planner, `fullAuditPlanning`,
  `writePagesAsScanned`).
- Not in scope: hotel-prescan resume (issue #114 tracks it), prospecting
  resume, any change to the locked contracts, any change to `persistAudit`
  upsert / `persistAnalysis` insert semantics (trade-off 5), any change to
  crawl politeness (the delay, robots.txt, and the continuation guard all
  carry across a resume unchanged), dashboard layout work.

## Binding decisions (operator, 2026-09-09)

1. Full scope: core checkpoint/resume, crawl-phase resume, and the deploy
   guard all land in this plan.
2. The audit directory stays keyed by hostname plus timestamp. The run's
   `startedAt` and `auditId` are stamped onto the job document at first
   claim and reused on every re-claim. The on-disk timestamp-directory
   layout, `parseAuditTimestampDir`, and bucket keys stay untouched.
3. The crawl checkpoint is a file inside the audit directory, on the
   persistent artifacts volume. The job document carries only the identity
   stamp.
4. The deploy guard refuses (with an explicit override) rather than warning.

## Design contracts

- **Run identity.** `jobs` gains `runIdentity: { startedAt, auditId }`,
  written once by a new store helper (`ensureJobRunIdentity`) using an
  atomic create-or-return. `claimNextQueuedJob`'s `startedAt` keeps its
  existing meaning (current claim time, used for orphan detection);
  `runIdentity.startedAt` is the audit's stable timestamp and is what
  `buildAuditDir` receives. `runAuditStage` accepts an optional run
  identity and mints one internally when absent, so the CLI path is
  unchanged. `auditId` is minted at run start instead of inside
  `writeAuditArtifacts`, which already accepts a caller-supplied
  `auditId`.
- **Two checkpoint files, both inside the audit directory.**
  - `crawl-checkpoint.json`: written once the coverage gate passes and
    before any content work. Carries the complete `CrawlResult` (pages
    with their audit profiles), the effective `AuditConfigSnapshot`, a
    tool-identity block, and the run `startedAt`. Deleted after the audit
    stage fully succeeds.
  - `crawl-state.json`: periodic frontier snapshots during the crawl
    (queue, visited set, recorded pages, discovered-URL bookkeeping,
    continuation-guard state, robots text, sitemap result, phase flags).
    Throttled (page count and minimum interval), written atomically via
    temp file plus rename, synchronously like every other artifact write
    on this filesystem. Deleted when the crawl completes.
- **Resume validation.** A checkpoint is reused only when the recomputed
  effective config (options plus environment-derived clamps) and the tool
  identity (scanner package version, planner version, checkpoint format
  version) match exactly, and the file's `startedAt` matches the audit
  directory. On any mismatch or corruption the checkpoint files and this
  run's partial `pages/` directory are deleted before a fresh crawl: skip
  existing results is never active outside a validated resume, so stale
  artifacts can never leak into a new configuration's manifest.
- **Coverage gate cannot be laundered.** The gate runs after the crawl in
  the fresh path before the checkpoint is written (unchanged), and again
  on the checkpointed inventory in the resume path. A resume that would
  fail the gate today still fails.
- **Deterministic planner replay.** `scan.json` gains two additive fields,
  `checkOutcomes` and `renderedCostProfile`, so a resume can rebuild every
  input `finalizeLighthousePlan` needs from disk. The re-finalized plan is
  then byte-equivalent to the interrupted run's plan.
- **Content-scan skip rule.** A page whose `scan.json` exists is done: its
  content passes are never re-run (a recorded failure is a recorded fact,
  not something a resume retries). A page selected for Lighthouse whose
  `scan.json` carries neither `lighthouse` nor `lighthouseError` still
  gets its Lighthouse pass on resume.
- **Politeness across a crawl resume.** The restored frontier reuses the
  persisted `effectiveDelayMs` and does not exempt the first resumed fetch
  from the delay. The continuation guard's family counters restore exactly,
  so a resumed crawl cannot re-hammer a family it had already bounded.
- **Startup orphan recovery.** The deployment is a single app container, so
  at `JobQueue.start()` every `running` job is by definition unowned:
  startup resets all of them, not only heartbeats older than ten minutes.
  The stale-heartbeat default stays available for any future multi-worker
  caller.
- **Deploy guard.** `release.sh` probes the running stack for `running`
  jobs immediately before `compose up -d`, via a one-shot Node script
  inside the current app container using its own mongoose and
  `MONGODB_URI`. Any running job aborts the release with its jobId and
  phase; a probe failure counts as "unknown, refuse". The forced SSH
  command gains one explicit token (`deploy <sha> force-running`) that
  sets the override environment variable; nothing else about the
  CI-verified, operator-triggered release flow (trade-off 61) changes.

## Steps

1. **Startup reset (store, interface).** `resetOrphanedRunningJobs` gains an
   option to include fresh-heartbeat jobs; `JobQueue.start()` passes it.
   Mongo-gated store tests updated plus new coverage for the fresh case.
2. **Run identity (store, interface).** Schema field, `ensureJobRunIdentity`,
   `runAuditStage` parameter, `runFullAuditJob` wiring. Job-queue pipeline
   tests assert the stamp is created once and reused by a simulated
   re-claim.
3. **Crawl checkpoint and content-scan resume (scanner, interface).**
   Checkpoint IO module, scan.json additive fields, checkpoint write after
   the gate, resume path through `scanSite`/`runStagedFullAuditScan`,
   coverage-gate re-run, progress counters that start from the reused
   count, checkpoint deletion on success. Unit tests for the IO round trip
   and the partition logic; interface tests for the wiring; an e2e test
   against the vite fixture that runs `scanSite` twice over one audit
   directory and proves the second pass crawls nothing, re-scans nothing,
   and produces an equivalent manifest.
4. **Crawl frontier resume (scanner).** `ContinuationGuard` snapshot pair,
   frontier serialization inside `crawl.ts` (it owns the state shape),
   throttled snapshots, resume with the persisted robots/sitemap/delay
   state, file deletion on completion, config validation shared with step
   3. Unit tests for guard and state round trips; e2e coverage that a
   resumed crawl continues the queue without re-visiting.
5. **Deploy guard (deploy).** Probe in `release.sh`, `force-running` token
   in `github-deploy-command.sh`, runbook section 7A updated. `bash -n`
   plus manual review of the probe script.
6. **Docs.** Trade-offs entry 76 (why job-stamped identity, why file
   checkpoints, why config and tool fingerprints, why the gate re-runs,
   why startup resets everything, why the deploy probe fails closed) and
   the one-line charter index entry.

## Verification

```bash
pnpm run format
pnpm test -- packages/store/src packages/scanner/src packages/interface
pnpm run test:e2e            # touched scanner suites
pnpm run test:store          # mongo-gated store suites
pnpm run check
```

Live acceptance is a separate operator decision: redeploying the VPS during
a real audit to watch it resume is the plan's `IMPLEMENTED`-to-`DONE` gate,
exactly as prior plans kept a human step. No live third-party scan is
authorized by this plan.

## Status

IMPLEMENTED 2026-09-09 (all steps landed, suites green, `pnpm run check`
green; decisions recorded in `docs/decisions/trade-offs.md` entry 76).
`DONE` still needs the operator's live acceptance: one forced redeploy
during a real audit, watched resuming from its checkpoint on the VPS. No
live third-party scan is authorized by this plan; that acceptance is an
operator step against production, on the operator's own timing.
