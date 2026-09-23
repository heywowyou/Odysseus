# Plan 076 execution handoff

Status: local implementation complete; live acceptance pending. Keep plan 076
active and in `plans/`; do not archive it or mark it DONE until both acceptance
runs complete and satisfy the recorded thresholds.

## Completed locally

- Built the de-identified pushback corpus and shared core host/document
  classifier; wired crawler, render, canonical, Lighthouse, and normalization
  callers to it.
- Added pacing recovery after 20 clean starts and persisted recovery events.
- Added paced stage ETAs, recovery-aware dashboard telemetry, and a prior-full-
  audit estimate on the new-scan form.
- Added stable inventory-order mobile/consent sampling, persisted per-page
  selection reasons, and explicit planned-out-of-scope surface IDs.
- Re-normalized the saved La Corniche audit offline; no network scan was run.

## Deployment and post-deploy verification

- On 2026-09-23, `git pull --rebase origin main` reported the branch was up
  to date. Commit `5da97bd2` was pushed, then deployed through
  `deploy/odysseus-deploy.sh`; the script verified that the running app
  reported build ID `5da97bd2`.
- Production `/health/ready` returned HTTP 200 with database and queue both
  `ok`.
- The existing job `517f3ce0-bf45-472e-a6bd-7f04b0dc6fd1` was active during
  deployment. It continued from 77/232 scan pages and 15/170 Lighthouse pages
  before rollout to 26/170 Lighthouse afterward, then 29/170 during normalize.
  No scan was started or cancelled.
- The targeted dashboard check confirmed the deployed progress page in FR at
  desktop and 390px widths and EN at 390px, with no overflow. The live job had
  passed crawl, so the recovery message itself was covered by the focused
  render/model regressions rather than observed in the live phase.

## Deferred acceptance

The operator deferred the uncapped live Haaitza and La Corniche audits to a
later session. Do not start either in this work session, and do not archive or
mark Plan 076 DONE until both runs meet their recorded thresholds.

The latest `pnpm run test:all` completed with 5,559 passing, 245 skipped,
and two failed provenance checks: the source-derived normalization fingerprint
and committed test-audit stamps. The fingerprint and stamped manifest/analysis
metadata now use `238fa28918941c19`; the two focused provenance files pass (7
tests). The focused dashboard model/render suites also pass (34 tests). The
full suite was not rerun after these targeted repairs. The committed test
fixtures have no raw-document evidence for the new wall classifier, but the
original artifacts for the 15 listed real audits are absent locally, so
`pnpm fixtures:refresh` could not be run here. `pnpm run check` passed, and
the pre-push hook passed it again.

## Definition of done

Do not close or archive plan 076 until its requirement-to-proof ledger is
complete and both uncapped live acceptance runs meet their thresholds.

## Executable closure contract

The requirement-to-proof closure artifact is the ledger in
`076-scan-pacing-that-cannot-spiral.md`. R6 remains open until the live run
artifacts and ETA checkpoints are recorded there and in Plan 075.
