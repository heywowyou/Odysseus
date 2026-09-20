# Four low-confidence advisor investigations resolved

Research date: 9 September 2026. This note settles GitHub issue #157
(advisor plan 027, planned at commit 71da99a). It is an investigation
record, not a change plan: nothing under `packages/` was modified, and
every recommendation that implies code belongs in a follow-up plan.

## Drift note

The plan's drift check fired: three of its in-scope files changed between
71da99a and the investigation commit d083c27. Each was re-verified against
the live code, and all four investigations were run on the live tree:

- `package.json`: only the `packageManager` field moved from
  `pnpm@11.22.0` to `pnpm@12.3.4` (the pnpm 12 bump verified and committed
  by issue #156). The plan's excerpt for investigation (d), the
  `"vitest": "^3.0.4"` dev dependency at `package.json:46`, is unchanged.
- `packages/interface/src/pipeline/analysis-stage.ts`: substantially
  refactored by the audit fallback gate work (issue #162), which moved
  every line anchor the plan quoted. The named patterns themselves are all
  still present and are cited below at their live line numbers.
- `packages/interface/src/queue/job-queue.ts`: a comment-only diff (the
  cancellation registry's doc comment, issue #132 follow-up). The plan's
  anchors, `async start()` at line 88 and the
  `reconcileFailedAuditJobs` call at line 93, are unchanged.

`packages/store/src/reconcile-jobs.ts`, `packages/interface/src/index.ts`,
`packages/interface/package.json`, and
`packages/interface/vite.config.ts` did not change since the plan was
written.

## (a) Review-artifact naming: is a same-second overwrite reachable?

### The question

`runAnalysisStage` writes its operator-facing shadow-review artifact as
`<auditDir>/analyses/<second-precision timestamp>-review.json` with a
plain overwrite, while the correction-review artifact in the same file
carries the analysisId in its filename and writes insert-only. Can any
call path today bring two invocations to the same review path within one
wall-clock second, and if not, should the correction-review pattern be
adopted anyway?

### Evidence

The live write sites (verified at d083c27, line numbers moved from the
plan by the issue #162 refactor):

- Review path built at `analysis-stage.ts:486-489` as
  `` `${timestampForFilename(generatedAt)}-review.json` `` and written at
  `:490-505` with a plain `fs.writeFile` (no options argument, so no
  exclusive-create flag). `timestampForFilename` (`:99-104`) strips
  milliseconds, so the name has second precision. The artifact body does
  carry `auditId`, `analysisId`, and `language` (`:493-501`), so an
  overwrite would lose data but not traceability.
- The in-file precedent: correction-review path at `:422-425` embeds
  `analysisId`, and its write at `:447` passes `{ flag: 'wx' }`.

Caller census. The plan's verification grep over `packages/interface/src`
returns exactly its two documented call-site pairs; a repo-wide grep adds
one superset member the plan's table did not list:

1. `packages/interface/src/queue/pipeline/run-full-audit-job.ts:89`
   (French) and `:104` (English). Sequential inside one job pipeline.
   `pauseBetweenLanguagePasses()` runs at `:101` between the two passes.
   The pause is `LANGUAGE_PASS_PAUSE_MS = 20_000`
   (`packages/llm/src/rate-limit-pacing.ts:20`) and is unconditional, and
   between the French review write and the English one there are at
   minimum three provider calls (French writing pass, French correction
   review, French review pass) on top of it.
2. `packages/interface/src/pipeline/regenerate-writing.ts:124` (French)
   and `:147` (English). Sequential with the same pause at `:146`, plus a
   per-audit in-flight registry (`inFlight` set at `:57`, conflict check
   at `:108-112`, release at `:201`) that turns a second concurrent
   regeneration of the same audit into a `RegenerationConflictError`
   before any stage runs.
3. Superset addition: the standalone CLI command
   `packages/cli/src/commands/analyze.ts:98` imports `runAnalysisStage`
   from the `@odysseus/interface` barrel (`packages/interface/src/index.ts:7`).
   The command accepts exactly one required `--language <fr|en>` option
   (`analyze.ts:37`) per process, so analyzing two languages means two
   separate operator-driven process runs, minutes apart by construction.

Directory scoping closes the cross-audit case. Review files land under
`<auditDir>/analyses/` (`analysis-stage.ts:260`, `:381`), and `auditDir`
is `<artifactsRoot>/<hostname>/<second-precision start timestamp>/`
(`packages/scanner/src/artifacts/paths.ts:87-90`, timestamp format at
`:28-35`). Two different audit runs of the same site never share an
analyses directory, so only the fr-versus-en case inside one run could
ever collide.

New since the plan: the audit fallback gate (issue #162) evaluates
`isAuditFallbackEligible` at `analysis-stage.ts:259`; when it holds, no
model passes run (`:307-334`) and the entire advisory block, review write
included, is skipped (`:411`). Fallback-eligible audits write no review
artifact at all, so the hazard surface exists only for model-generated
analyses.

### Decision

No reachable collision on any current path: both bilingual callers
separate the fr and en invocations with an unconditional 20 second pause
plus multiple provider calls, the CLI path is one language per process,
and distinct audits cannot share a directory. Documented no-change. The
correction-review pattern (`:422-425` plus `{ flag: 'wx' }` at `:447`)
stays the in-file precedent to copy if a future path ever removes the
separation; adopting it proactively is a small hardening candidate for a
follow-up change plan, not something this investigation justifies as
necessary today.

### Follow-up trigger

Any new call path that can bring two `runAnalysisStage` invocations for
the same auditDir within one second (a parallel-language pass, an
automated replay, or a test/stub provider that collapses the inter-pass
latency). The maintenance note in the issue covers the same condition.

## (b) Startup reconciliation cost at the 500-job cap

### The question

`reconcileFailedAuditJobs` (`packages/store/src/reconcile-jobs.ts`) does,
per failed job, three sequential reads (audit at `:80`, fr report at
`:83-85`, en report at `:86-88`) and then an `updateOne` for the jobs it
advances (`:101-104`), capped by `MAX_JOBS_PER_PASS = 500` (`:35`). At
the full cap, is that measurably slow? The advisor's pre-agreed threshold:
recommend batching only if the measured cost exceeds about 2000 ms.

### Evidence

Method: a throwaway vitest file,
`packages/store/src/reconcile-measure.tmp.test.ts`, deleted after the
runs. Seeding copied the exact document shapes of
`packages/store/src/reconcile-jobs.test.ts`: 500 failed `full-audit` jobs
inserted via `createJobModel`, each with a matching audit row
(`createAuditModel`) and a fresh fr/en report pair (`createReportModel`)
whose `FindingsProvenance` matches the audit's on all three compared
fields (`findingsSchemaVersion`, `normalizationFingerprint`,
`findingsDigest`, the field set at `reconcile-jobs.ts:37-48`), so every
job qualifies for advancement. Mongo was the repo's `mongo-test` docker
service (`mongo:7.0.39`, port 27018). One timed
`reconcileFailedAuditJobs(connection)` call per run, with
`assert advanced === 500` as the known-good gate; it passed on both runs.

Figures:

- Run 1: 2556.1 ms, advanced 500.
- Run 2: 2731.9 ms, advanced 500.

The two runs differ by 7 percent, well inside the plan's factor-of-2
stability rule, so the figure is stable.

### Decision

The measured cost exceeds the advisor's 2000 ms threshold on both runs,
so the plan's decision rule fires: recommend batching. One `$in` audit
read for all 500 auditIds plus one report aggregation (or `$in` read
grouped by auditId) replacing the three per-job awaits would collapse the
pass from roughly 1500 round trips to a constant small number. Recorded
context for whoever picks it up: 500 is the worst case the cap allows and
the pass runs once at `JobQueue.start()`
(`packages/interface/src/queue/job-queue.ts:88-96`) wrapped in try/catch,
so the cost delays readiness on a pathological backlog; it never blocks
startup on failure. The figures are from local docker Mongo on the dev
machine, which is the environment the measurement plan prescribed.

### Follow-up trigger

A batching change plan for `reconcileFailedAuditJobs`; the throwaway test
recipe above is the re-measurement method. Re-measure sooner if
`MAX_JOBS_PER_PASS` is raised or failed-job backlogs of hundreds become
routine.

## (c) Five suspect barrel exports in @odysseus/interface

### The question

`refusesUnprotectedNonLoopbackBind` (`index.ts:86`),
`createScalewayArtifactStore` (`index.ts:17`), `computeCrawlEtaMs`
(`index.ts:63`), `runFullAuditJob` (`index.ts:67`), and
`runProspectIngestionJob` (`index.ts:80`) are exported from the barrel
with no known non-test consumer importing them through it. Which of them
would break if the export were removed? The decisive method is
typecheck-removal, one symbol at a time.

### Evidence

Method note: the plan prescribed a throwaway branch for this step. The
coordinating instructions for this session forbade branch creation, so
the identical method ran in the working tree: comment out the single
export line, run `pnpm run typecheck`, record the result, restore the
line. For `computeCrawlEtaMs`, which shares its export line with
`computeScanEtaMs`, only that one name was removed and `computeScanEtaMs`
stayed exported. After the last check the barrel was verified byte-identical
to HEAD (`git status --short` and `git diff` on the file both empty) and
no `advisor/027c*` branch ever existed.

Results, in the plan's order. All five typechecks exited 0:

| Symbol | Barrel line | Verdict |
| --- | --- | --- |
| `refusesUnprotectedNonLoopbackBind` | index.ts:86 | PASS |
| `createScalewayArtifactStore` | index.ts:17 | PASS |
| `computeCrawlEtaMs` | index.ts:63 | PASS |
| `runFullAuditJob` | index.ts:67 | PASS |
| `runProspectIngestionJob` | index.ts:80 | PASS |

PASS means no consumer anywhere imports the name from the barrel; the
compiler named no file. The repo-wide name grep (dist excluded) confirms
why: every consumer imports the defining module's path directly.

- `refusesUnprotectedNonLoopbackBind`: defined at
  `packages/interface/src/server.ts:55`, used in-process at `:77`, test
  import from `./server.js` at
  `packages/interface/src/auth/server-auth.test.ts:10`.
- `createScalewayArtifactStore`: direct-module import at
  `packages/interface/src/artifacts/configured-artifact-store.ts:24`,
  test at `scaleway-artifact-store.test.ts:2`.
- `computeCrawlEtaMs`: direct-module import at
  `packages/interface/src/queue/report-progress.ts:12`, test at
  `eta.test.ts:3`.
- `runFullAuditJob`: direct-module import at
  `packages/interface/src/server.ts:18`, registered as the pipeline for
  `full-audit` at `server.ts:91` (the plan said lines 17 and 90; the file
  gained one import line above since it was written), test at
  `run-full-audit-job.test.ts:21`.
- `runProspectIngestionJob`: direct-module import at
  `packages/interface/src/server.ts:21`, registered at `server.ts:93`
  (plan said 20 and 92), test at
  `run-prospect-ingestion-job.test.ts:54`.

`packages/interface/src/queue/job-queue.test.ts` declares local `vi.fn()`
mocks that happen to share these names; they are not imports. No package
outside `interface` consumes any of the five names. The only cross-package
barrel import of a pipeline symbol anywhere is the CLI's
`runAnalysisStage` (`packages/cli/src/commands/analyze.ts:7`), which is
not on this list.

### Decision

All five symbols are candidates for unexport or for a
`// Barrel: internal only` style annotation; none may be removed by this
document. Confidence notes for the follow-up plan: `computeCrawlEtaMs`
and `createScalewayArtifactStore` are the cleanest unexport candidates,
since even their own tests import the defining module. `runFullAuditJob`
and `runProspectIngestionJob` are the pipeline seams `server.ts`
registers into its `JobQueue`; keeping them exported is defensible only
as a convenience for an external consumer that does not exist today.
`refusesUnprotectedNonLoopbackBind` is exported for test visibility only,
exactly as the plan's table recorded. Applying any of this is a small
follow-up change plan with its own typecheck.

### Follow-up trigger

Any of the five gaining an external consumer voids its entry on this
list; re-run the typecheck-removal check before acting on it.

## (d) Dashboard build toolchain currency, assessed offline

### The question

Are the dashboard build tool versions stale enough to justify a bump now,
and what would a vite major bump touch? Original evidence is offline-only:
declared ranges, installed versions, installed peer ranges, and the config
surface. The changelog sweep was known at plan time to be network-gated.

### Evidence

Declared versus installed, re-verified at d083c27 and unchanged since the
plan:

- `packages/interface/package.json:46` `"vite": "^6.4.3"`, installed
  6.4.3; `:44` `"@vitejs/plugin-react": "^4.7.0"`, installed 4.7.0;
  `:41`/`:45` `"@tailwindcss/vite"` and `"tailwindcss": "^4.3.3"`,
  installed 4.3.3.
- Root `package.json:46` `"vitest": "^3.0.4"`, installed 3.2.7. The root
  file's only change since 71da99a is the `packageManager` field (pnpm
  12.3.4, issue #156).

Peer ranges re-read from the installed packages' own `package.json`
files:

- `@vitejs/plugin-react@4.7.0`: `"vite": "^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0"`.
- `@tailwindcss/vite@4.3.3`: `"vite": "^5.2.0 || ^6 || ^7 || ^8"`.
- `vitest@3.2.7` dependency: `"vite": "^5.0.0 || ^6.0.0 || ^7.0.0-0"`.

Changelog gap confirmed: neither the installed vite nor vitest package
directory contains a `CHANGELOG.md` (`ls` fails with "No such file or
directory" for both globs; `ls ... | wc -l` prints 0), matching the
plan's correction. The changelog sweep for the next majors is therefore
still the blocked, network-gated follow-up.

Config surface a vite major could touch, from
`packages/interface/vite.config.ts`: plugins `react()` and `tailwindcss()`
plus the custom `copyInterFonts()` plugin using `closeBundle` (`:22`) and
`configureServer` middleware (`:31-44`); `root: 'src/dashboard'` (`:49`);
`base: '/'` (`:50`); `publicDir: false` (`:51`);
`build.outDir: '../../dist/public'` with `emptyOutDir: true` (`:53-56`);
`server.proxy` sending `/api` to `http://127.0.0.1:4600` (`:57-61`).
Test config, from the root `vitest.config.ts`: a workspace-wide config
resolving `@odysseus/*` to package sources, a `unit` project including
`packages/**/*.{test,spec}.ts` (excluding `*.e2e.test.ts`), and an `e2e`
project adding `scripts/vitest-e2e-global-setup.mjs`.

### Decision

Wait; do not bump now, and schedule the bump as its own change, not as
drive-by maintenance. Grounds from the evidence actually held: every
installed peer range already admits the next majors (the react plugin
declares vite 7, the tailwind vite plugin declares 7 and 8, vitest 3.2.7
runs against vite 6), so nothing in the installed set exerts compatibility
pressure in either direction; vite 6.4.3 and vitest 3.2.7 are current
within their majors; and the changelogs that would price a major bump
against the inventoried config surface are unavailable offline. Declared
evidence unavailable offline: the vite 7 and vitest 4 breaking-change
lists. Whoever has network access should read
`https://github.com/vitejs/vite/blob/main/packages/vite/CHANGELOG.md` and
`https://github.com/vitest-dev/vitest/blob/main/packages/vitest/CHANGELOG.md`
for changes touching: custom plugin hooks `closeBundle` and
`configureServer`, `root`, `publicDir`, `build.outDir`, `server.proxy`,
`@vitejs/plugin-react`, `@tailwindcss/vite`, and the vitest
projects/globalSetup shape in the root config. That sweep must land
before any version-bump PR.

### Follow-up trigger

The network changelog sweep above, or any concrete incompatibility
reported against vite 6/vitest 3 on the dashboard build or the test
projects.
