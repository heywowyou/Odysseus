# Plan 077: Keep the latest version, delete superseded ones after a grace period

Status: TODO. Priority P2. Effort L. Depends on: none. Revisits trade-off 5 ("analyses are inserted, never upserted") by adding a retention step after the insert. The insert itself stays.

## Context

Every "Rewrite the report", "Rewrite fresh", report render and rescan adds a new version and never removes the old one. The only deletion paths are deleting an audit and archiving a prospect. The operator decided on 2026-09-24 that once a newer scan, analysis or report exists, older versions have no reason to stay beyond a few days. The VPS has 200 GB of storage, so this is precautionary hygiene, not an emergency.

### Evidence (local artifacts on the operator's machine, 2026-09-24, about 39 hotel sites, 165 audit directories)

| Fact | Source |
|---|---|
| 5.0 GB in total. Per-page `scan.json` is 3.7 GB (3,322 files, median 1.05 MB), PNG screenshots 1.3 GB, all report PDFs 106 MB, all analysis JSON 6 MB. | `du`/`find` over `artifacts/` |
| Older audits of a site that has a newer audit: 1.5 GB (29%). One site holds 3 audits totalling 1.5 GB. | per-hostname `du` |
| Every stored `scan.json` is the untrimmed v1 shape. `buildScanJson` trimming (axe passes/inapplicable, Lighthouse `screenshot-thumbnails`/`final-screenshot`, `scanJsonVersion: 2`) only applies to new scans. | `packages/scanner/src/artifacts/page-scan-io.ts`; version census of all 3,322 files |
| In one profiled 1.14 MB `scan.json`: Lighthouse screenshot audits about 210 KB, `lighthouse.fullPageScreenshot` 193 KB, axe `passes` + `inapplicable` about 125 KB. No source file reads `fullPageScreenshot`. | JSON profile; grep of `packages/*/src` |
| Findings provenance hashes the normalized findings, not `scan.json` bytes, so compacting `scan.json` cannot change a stored provenance stamp. It only matters if renormalization gives different findings. | `packages/core/src/normalize/findings-provenance.ts` |
| `persistAnalysis` and `persistReport` always insert. Analyses and PDFs are written with timestamped filenames. | `packages/store/src/persist-analysis.ts`, `persist-report.ts`; `packages/interface/src/pipeline/analysis-stage.ts`, `report-stage.ts:159` |
| `deleteAuditArtifacts` removes only the `<hostname>/<timestamp>/` local directory and bucket prefix. Report-quality candidate PDFs under `report-quality/candidates/<auditId>/…` survive audit deletion and prospect archiving. | `packages/interface/src/artifacts/delete-audit-artifacts.ts`, `pipeline/report-quality-storage.ts` |
| The re-audit findings delta uses the newest earlier audit of the same `siteUrl` that has a `reportApprovals` row, and reads its audit row plus finding rows (not its files). | `packages/store/src/findings-delta-baseline.ts` |
| Production records live only on the VPS deployment (database `test`, pinned in `deploy/compose.yaml`). The workstation's `.env` pins `MONGODB_DB_NAME=odysseus-local`, so local runs only see local test data. The "shared database" comments in `artifact-store.ts:4` and `report.schema.ts:55` predate that split. The remaining trap: a machine with neither a database in the URI nor `MONGODB_DB_NAME` falls back to `test`, which is production. | `packages/store/src/connection.ts`, `deploy/runbook.md` "There is one database", `.env` (read-only check, value not reproduced) |
| `odysseus serve` enables every background poller unconditionally, both locally and in production. | `packages/cli/src/commands/serve.ts:30` |
| Outreach previews are already "latest wins": publishing a new preview deletes the superseded public object and revokes its record, and records expire after 90 days. | `packages/interface/src/outreach/publish-preview-v2.ts:512-545`, `packages/store/src/outreach-previews.ts:72` |
| Backups: the legacy nightly tar keeps 30 full copies. The restic path keeps 30 daily, 8 weekly and 12 monthly snapshots. The runbook does not record which one is live, and still says the disk is 30 GB. | `deploy/backup-artifacts.sh`, `deploy/restic-maintain.sh`, `deploy/runbook.md` §7A, §8 |

## Target outcomes

- On the operator's local artifacts, compaction reduces total `scan.json` bytes by **≥ 40%**. Renormalizing each compacted audit gives a **byte-identical `findingsDigest`** for 100% of audits that normalize at all.
- After the grace period, an audit's only stored analyses and reports are the ones in the keep registry below. Every other version is removed from Mongo, the local disk and the bucket together.
- An older audit of the same site and kind is removed once a newer, equal-or-broader audit has existed for 7 days. If it was delivered, it is slimmed instead and stays usable as the findings-delta baseline.
- The scheduled sweeper runs only on the VPS deployment, so local test and calibration data is never cleaned without asking. No scheduled run deletes more than the per-run cap.
- The dashboard shows artifacts-disk usage, warns at ≥ 75% and alarms at ≥ 90%, and shows the last retention run's outcome.

## Binding rules

### R1. Grace period

`RETENTION_GRACE_DAYS = 7`, a code constant, not an env knob. An item becomes eligible 7 days after the moment it was superseded. That moment is the newer item's `generatedAt` (analysis, report, quality run) or `finishedAt` (audit). An item with no newer item is never superseded.

### R2. Within-audit keep registry (applies to every audit, including the newest)

A typed, exhaustive `RetentionKeepReason` union with one entry per reason. The policy returns, for each kept item, the reasons that kept it. Anything with no reason and past grace is deleted.

Reports (row + dark PDF + `-clair.pdf` sibling + finalization override file):
- `latest-per-language`: `getLatestReport` semantics.
- `latest-generated-per-language`: `getLatestGeneratedReport` semantics.
- `latest-finalized-per-language`, plus `finalization-source` for its `supersedesReportId`.
- `approved`: every `reportId` named in any `reportApprovals` row (fr and en).

Analyses (row + `analyses/<ts>-<lang>.json` + `-critic.json` sidecar):
- `selected`: `reportPreparation.writingSelection.selected` fr/en.
- `candidate`: `writingSelection.candidate` fr/en and partial ids.
- `report-source`: the `analysisId` of every kept report.
- `newest-per-language`: keeps the reuse cache in `findReusableAnalysis` meaningful.

Structure files (`analyses/<ts>-structure.json`):
- `structure-of-kept-analysis`: the `structureGeneratedAt` of any kept analysis.
- `newest-structure`.

Report-quality (bucket objects under `report-quality/candidates/<auditId>/<qualityRunId>/` and the `reportBundles` row):
- `active-bundle`: named by `activeReportBundles`.
- `operator-approved-or-promoted`: bundle `state` is `operator-approved` or `promoted`.
- `newest-run`: the newest quality run for the audit.
- `reportQualityRuns` rows are always kept, since they carry model-call provenance and the adjudicated issues the benchmark tallies read. Only the candidate PDFs and the superseded, never-approved bundle rows go.
- Content-addressed `report-quality/objects/` and `report-quality/delivered/` are out of scope: they can be shared across audits, and they are small.

### R3. Audit supersession

- Audit B supersedes audit A when all of these hold: same `siteUrl` and `kind`; `B.startedAt > A.startedAt`; B has `findingsProvenance` (finished and normalized); and `rank(B) ≥ rank(A)`.
- Rank: `quick-check` 0, `prospecting-audit` 1, `full-audit` 2.
- A legacy A without `scanIntent` ranks 2 (only a full audit supersedes it). A legacy B without `scanIntent` never supersedes anything.
- Superseded-at is the earliest qualifying B's `finishedAt`.
- The newest audit per (`siteUrl`, `kind`) is therefore never superseded.

### R4. Delivered audits are slimmed, never deleted

- An audit is **delivered** if any of these hold: it has a `reportApprovals` row, an `activeReportBundles` row, a bundle in `operator-approved`/`promoted`, a report with `origin: 'finalized'`, or a live outreach preview (`auditId` matches, not revoked, `expiresAt > now`).
- A superseded delivered audit keeps its audit row, finding rows, `manifest.json`, `findings.json`, `audit-scope.json` and every R2-kept analysis/report file. The rest of its directory and bucket prefix (`pages/**`, crawl checkpoint/state) is deleted.
- The audit row gets `retention: { slimmedAt: Date }`. Every route that needs raw evidence (renormalize, `refreshStaleAuditEvidence`, regenerate-writing, regenerate-report, report-quality runs) refuses a slimmed audit up front. The refusal carries a plain operator message ("Les données brutes de ce scan ancien ont été supprimées ; lancez un nouveau scan." with an English twin), instead of failing deep in the pipeline.
- A non-delivered superseded audit is deleted through the existing path: `deleteAuditArtifacts` → `deleteAuditCascade` → `deleteFinishedScanJobsForAudit`, in that order.

### R5. Holds

- Skip, for this run, any audit that has a queued or running job (`queue.isJobInFlight` over the audit's jobs), is in report production (`isReportProductionInFlight`), or belongs to an archived prospect (the archive purge owns those).
- Skip any audit whose artifacts were never on this machine. The local audit directory is absent **and** no bucket prefix exists. It is reported as `not-local`, never deleted by inference.

### R6. The sweeper runs on the VPS; the CLI runs anywhere

- The VPS holds every real audit. Each machine's database only names its own audits, so a run can only touch the data of the machine it runs on.
- The scheduled sweeper starts only when `ODYSSEUS_RETENTION_SWEEP=on`. That flag is set in `deploy/compose.yaml`, not in any `.env`, so a local `odysseus serve` never cleans local calibration audits by itself.
- `odysseus artifacts retention` is a dry run by default and needs `--apply` to change anything, on any machine.
- Compaction (R7) re-uploads to the bucket only when a bucket is configured on that machine.

### R7. `scan.json` compaction

- Extend `trimmedLighthouseResult` to also drop `fullPageScreenshot`.
- Export one `compactScanJson(parsed)` from the scanner that both `buildScanJson` and the migration use. The trim rules live in exactly one place.
- The stored version stays `2`, because the reader at `page-scan-io.ts:207` accepts only `undefined` or `2`.
- `odysseus artifacts compact-scans [--apply]` rewrites each v1 file, or any v2 file that still carries a droppable key, atomically (temp file + rename). It then re-uploads through the artifact store. Idempotent: a second run finds nothing.

### R8. Per-run cap

- A run that would delete more than 20 audits, or slim more than 20, refuses as a whole and reports the counts.
- The CLI can pass `--allow-large` after the operator has read the dry run. The scheduled sweeper never can.

### R9. Record of each run

- Each non-dry run writes one `retentionRuns` document: `startedAt`, `finishedAt`, counts per action kind, bytes reclaimed local/remote, refusals, failures with auditId and step. It has a TTL of 90 days.
- A per-item failure is logged and counted, and the run continues with the next audit. Storage-before-records order keeps each audit retryable, as issue #384 established.

## Design

- **Store** (`packages/store/src/retention.ts`):
  - `loadRetentionSnapshot(connection)` reads projected lean rows for audits, reports, analyses, approvals, bundles, active bundles, quality runs (id, auditId, createdAt only), live previews and archived prospect ids.
  - Targeted deletes: `deleteReportsById`, `deleteAnalysesById`, `deleteReportBundlesById`, `markAuditSlimmed`.
  - `retentionRuns` schema.
  - No filesystem access (package boundary).
- **Interface, pure policy** (`packages/interface/src/retention/retention-policy.ts`):
  - `planRetention(snapshot, now)` returns `RetentionPlan { deleteAudits, slimAudits, deleteReports, deleteAnalyses, deleteStructureFiles, deleteQualityCandidates, kept: Map<itemId, RetentionKeepReason[]>, holds }`.
  - No I/O, so it is exhaustively unit-testable.
- **Interface, executor** (`retention/apply-retention.ts`): resolves file paths per item, measures bytes before deleting, deletes local then bucket then Mongo per item, and writes the run record.
- **Audit deletion gap**: `deleteAuditArtifacts` also deletes the `report-quality/candidates/<encodeURIComponent(auditId)>/` prefix. This fixes prospect archiving and manual deletion too.
- **CLI** (`packages/cli/src/commands/artifacts.ts`): `retention [--apply] [--allow-large] [--json]` and `compact-scans [--apply]`, beside `orphans` and `archived-prospects`.
- **Sweeper** (`retention/retention-sweeper.ts`): same shape as `startOptOutPoller`. It runs every 24 h, with the first tick 15 min after boot so a deploy restart does not sweep immediately. It is wired in `server.ts` behind a `retentionSweep` option that `serve` sets from `ODYSSEUS_RETENTION_SWEEP`, which only `deploy/compose.yaml` sets.
- **Stale comments**: correct the "shared database" wording in `artifact-store.ts` and `report.schema.ts` to the per-machine database split.
- **Dashboard**:
  - `fs.statfs(artifactsRoot)` plus the latest `retentionRuns` doc go into one small read endpoint.
  - It surfaces as a status block in the location `docs/product/dashboard-ia.md` gives system/health information. If that document names none, it goes on the Settings page. The executor records which location it chose.
  - Thresholds 75% (warning) and 90% (danger) are code constants.
  - French-first copy.

## Steps (riskiest first)

1. **Spike: compaction is lossless.**
   - Implement `compactScanJson` plus the `fullPageScreenshot` trim, with unit tests.
   - Write a throwaway script under the scratchpad, never committed, that copies each local audit, normalizes it before and after compaction, and compares `findingsDigest`.
   - Record per-audit results and the byte reduction in this plan's ledger.
   - If any digest differs, stop and find the reader of the dropped key before going further.
2. **`compact-scans` CLI** with atomic rewrite, bucket re-upload and idempotence tests. Commit.
3. **Audit-deletion gap**: candidates prefix in `deleteAuditArtifacts`, with a test using the in-memory store. Commit.
4. **Pure policy**:
   - Build the snapshot types and `planRetention`.
   - Include one fixture test per `RetentionKeepReason` (each alone keeps its item).
   - A registry test proves the union and the fixture list are the same set.
   - Supersession rank tests (every pair of intents, legacy both sides), a grace boundary (6 d 23 h kept, 7 d deleted), R4 delivered detection per signal, and R5 holds.
   - Commit.
5. **Store loaders and deletes plus `retentionRuns`**, with tests against the existing in-memory Mongo test setup. Commit.
6. **Executor, slim marker and refusals**:
   - Executor order and failure tests (a bucket failure leaves records; a retry completes).
   - Every raw-evidence route refuses a slimmed audit, with a test per route.
   - R6 opt-in refusal, R8 cap.
   - Commit.
7. **CLI `retention`** (dry-run table: action, auditId/site, reason, bytes). Commit.
8. **Sweeper, storage endpoint and dashboard block**, with component tests for the three disk states and the last-run summary. Commit.
9. **Ops and docs**:
   - `restic-maintain.sh` retention → `--keep-daily 14 --keep-weekly 6`; `backup-artifacts.sh` default `RETENTION_DAYS` → 14.
   - Runbook: 200 GB disk figure (operator, 2026-09-24), a new "Retention" section (commands, opt-in, cap, how to read a run), and the backup retention numbers.
   - A new trade-off (the next free number when this step runs); amend trade-off 5's last sentence to point at it.
   - Update the `persist-analysis.ts`/`persist-report.ts` header comments ("worth keeping" → "kept until retention supersedes it").
   - Retention subsection in `docs/rules/normalization-rules.md` (it owns artifacts), linking the trade-off.
   - Commit.
10. **Full local gate**: `pnpm run format`, `pnpm run check`, `pnpm run test:all`. Then push.
11. **Production rollout (operator present, external)**:
    1. Deploy with `ODYSSEUS_RETENTION_SWEEP` still unset in compose (the compose line is added in step 4 below).
    2. In the app container, run `artifacts compact-scans` (dry run), then `--apply`, and record the bytes.
    3. Run `artifacts retention` (dry run) and have the operator read the table.
    4. With the operator's go, run `retention --apply` once (with `--allow-large` only if the operator accepts the counts), then deploy the compose change that sets the flag so the sweeper starts.
    5. Check `systemctl list-timers` for which backup timer is live and record it in the runbook.
    6. Record everything in this plan's ledger.

## Closure ledger

| Requirement | Owner / seam | Artifact | Proof |
|---|---|---|---|
| Compaction is lossless | `compactScanJson` (scanner) | `page-scan-io.ts` | Step 1 digest-equality record over every local audit; unit test per dropped key |
| ≥ 40% `scan.json` reduction | `compact-scans` CLI | CLI output | Step 1 and step 11 byte records |
| Compaction idempotent and atomic | `compact-scans` | CLI | Test: second run reports 0; a crash mid-write leaves the original (temp-file test) |
| Keep registry exhaustive, no silent default | `planRetention` | `RetentionKeepReason` union | Registry-equals-fixtures test; one test per reason |
| Grace = 7 days from supersession | `planRetention` | `RETENTION_GRACE_DAYS` | Boundary tests |
| Supersession rank | `planRetention` | rank table | Pairwise intent tests incl. legacy |
| Delivered → slim, never delete | `planRetention`, executor | `retention.slimmedAt` on audit | One test per delivered signal; findings-delta baseline still resolves after slim |
| Slimmed audit refused by raw-evidence routes | route guards | refusal message fr/en | One test per route |
| Holds | `planRetention` | `holds` in plan | Tests: in-flight job, report production, archived prospect, not-local |
| Sweeper only on the VPS | `server.ts` wiring + `deploy/compose.yaml` | `ODYSSEUS_RETENTION_SWEEP` | Test: sweeper not started without the flag; CLI without `--apply` makes zero delete calls |
| Per-run cap | executor | cap constant 20 | Test: 21 deletions refuses whole run; `--allow-large` passes; sweeper cannot |
| Storage before records, retryable | executor | order | Fault test: bucket failure leaves rows; retry completes |
| Audit deletion removes quality candidates | `deleteAuditArtifacts` | prefix list | Test with in-memory store |
| Run record | store | `retentionRuns` (TTL 90 d) | Store test |
| Disk alarm 75/90 | storage endpoint + dashboard | constants | Component test for 3 states |
| Backup retention | `restic-maintain.sh`, `backup-artifacts.sh` | flags | `deploy/restic-scripts.test.sh` updated |
| Production result | operator | runbook + ledger | Step 11 record (counts, bytes, live backup timer) |

## Definition of done

Plan 077 is done only when the local implementation is verified, every row in
the requirement-to-proof closure ledger above has evidence, and the step 11
production rollout is recorded with its counts, bytes and live backup timer.

## Executable closure contract

The requirement-to-proof closure artifact is the ledger in this plan. Before
closing, each row must name its implementation artifact and verification; the
compaction rows must cite the step 1 digest-equality record and the step 1 and
step 11 byte records. Add a `Closure evidence:` record before archiving this
plan.

## Out of scope

- Old audits with no newer audit (for example prospects that never converted). Archiving a prospect already purges those.
- Content-addressed `report-quality/objects/` and `report-quality/delivered/`.
- Outreach previews, already handled (see Evidence).
- Changing screenshot capture or pruning (trade-offs 2 and 74).
- Compressing `scan.json` on disk.
