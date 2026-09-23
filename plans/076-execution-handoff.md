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

The operator explicitly deferred production deployment and the uncapped live
Haaitza and La Corniche audits from this work session. No deploy or live site
scan has been performed. Before closing 076, deploy through
`deploy/odysseus-deploy.sh`, run the full uncapped audits one at a time, record
ETA errors at 25/50/75%, and update both this plan and plan 075's execution
ledger. Do not archive 076 before those runs complete.

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
