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

## Deferred acceptance

The operator deferred the uncapped live Haaitza and La Corniche audits to a
later time; do not start either in this work session. The operator has allowed
a redeploy. The latest read-only VPS check reported build `093fca00`, which is
before the local 076 implementation, so deploy the 076 commit chain through
`deploy/odysseus-deploy.sh` before the acceptance runs. Then run the full audits
one at a time, record ETA errors at 25/50/75%, and update both this plan and
plan 075's execution ledger. Do not archive 076 before both runs pass.

The latest `pnpm run test:all` completed with 5,559 passing, 245 skipped,
and two failed provenance checks: the source-derived normalization fingerprint
and committed test-audit stamps. The fingerprint and stamped manifest/analysis
metadata now use `238fa28918941c19`; the two focused provenance files pass (7
tests). The full suite was not rerun after this metadata repair. The committed
test audits have no raw-document evidence for the new wall classifier, but the
original artifacts for the 15 listed real audits are absent locally, so
`pnpm fixtures:refresh` could not be run here. `pnpm run check` passed before
the fingerprint metadata repair.

The earlier Plan 075 Haaitza queue handoff remains relevant to any future
deploy: inspect the current-session log and make sure the active Haaitza job has
finished before deploying.

## Definition of done

Do not close or archive plan 076 until its requirement-to-proof ledger is
complete and both uncapped live acceptance runs meet their thresholds.

## Executable closure contract

The requirement-to-proof closure artifact is the ledger in
`076-scan-pacing-that-cannot-spiral.md`. R6 remains open until the live run
artifacts and ETA checkpoints are recorded there and in Plan 075.
