# Plan 006: Score hotel candidates with immutable versioned breakdowns

> **Executor instructions**: Complete plans 001 through 005. Do not change the
> shipped cost gates or enable selection before operator weight approval.
>
> **Drift check**: `git diff --stat f7ef7cf..HEAD -- packages/core/src/cost-gating packages/core/src/prospecting packages/store/src/prescans.ts packages/store/src/scores*`

## Status

- **Status**: DONE
- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 001-005
- **Category**: direction
- **Planned at**: `f7ef7cf`, 2026-08-27

## Why this matters

Scoring selects scarce emails. Separate immutable score snapshots allow the
same prescan to be rescored and compared without corrupting scan history.

## Current state

- `computeBrokennessScore` and `isProspectingWorthy` are locked cost-gate
  semantics; do not modify them.
- Operator decision parks hotels below 3 stars before scoring.
- The selection rule is top brokenness decile within the top ability half.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Core tests | `pnpm exec vitest run packages/core/src/prospecting/outreach-selection.test.ts` | all pass |
| Store tests | `pnpm exec vitest run packages/store/src/scores.test.ts` | all pass |
| Validation | `pnpm run check` | exit 0 |

## Scope

**In scope**: pure two-score module; approved versioned weights/reasons;
immutable `scores` collection; cohort selector; rescore/diff CLI with dry-run/
limit; vendor fingerprint aggregate.

**Out of scope**: LLM scoring, visual-taste "recent web spend", below-3-star
selection, mutating prescans/old scores, existing cost-gate changes, or vendor
outreach.

## Git workflow

- Work directly on `main`; do not create another branch.
- Commit with `Add immutable hotel outreach scores`.

## Steps

### Step 1: Define pure scoring inputs and outputs

`computeOutreachSelection(input, config)` accepts resolved facts only and
returns version, brokenness/ability totals, component reasons/points, and
worthiness. Brokenness prioritizes booking blocking/CTA/render evidence;
ability prioritizes configurable direct booking, then verified rating,
capacity 25+, effectif 10+, and independence. Missing is not false.

**Verify**: exhaustive table tests and input-order stability pass.

### Step 2: Approve `hotel-outreach-v1`

Present proposed numeric weights and rankings across synthetic or authorized
historical fixtures. Operator approval is required before `selected` can be
written. Unapproved configuration emits `calibration` only.

**Verify**: every nonzero weight maps to a documented deterministic fact.

### Step 3: Persist separate immutable scores

Create 90-day score documents keyed to candidate, prospect, prescan, scoring
version, computedAt, breakdown, and selection-rule version. Rescoring inserts;
it never updates. Add current-version and previous-version diff helpers.

**Verify**: store tests prove history, mixed-version isolation, and TTL.

### Step 4: Select the cohort deterministically

Filter qualified, unsuppressed, 3+-star, evidence-complete, worthy candidates;
rank top half by ability then top decile by brokenness with explicit rounding
and stable ID ties. Return a reason for every record.

**Verify**: empty/small/100-record/tie/mixed-version fixtures pass.

### Step 5: Add rescore and vendor aggregates

CLI `prospect score --rescore-all --dry-run --limit N` writes only approved
versions. Expose recurring booking-engine/failure counts as an operator signal,
not a new outreach campaign.

**Verify**: CLI idempotency, diff, bounds, and aggregate privacy tests pass.

## Test plan

Pure score/cohort tables, store history, CLI, and unchanged cost-gate regression.

## Done criteria

- [x] Scores are separate immutable documents with breakdown/version.
- [x] Below-3-star hotels cannot enter selection.
- [x] Approved selection implements top-half then top-decile deterministically.
- [x] Existing cost gates are unchanged; tests/check pass; plan 006 is `DONE`.

## STOP conditions

Stop without approved weights, required facts/evidence, or if scoring would
change cost gates/locked contracts/package boundaries.

## Maintenance notes

Never edit weights in place. The first 100 sends decide whether a score version
has predictive value.

## Verification note, 2026-08-28

Implemented as specified, with both operator decisions taken before any code was
written: the `hotel-outreach-v1` weights are approved, so the selector may write
a `selected` state rather than `calibration` only, and worthiness is a new
prescan-side predicate rather than a change to the shipped cost gates, which are
byte-for-byte untouched. Reasoning and the market-aggregate caveat are recorded
as trade-off 38.

Full suite green: 232 files, 1977 tests, `pnpm run check` exit 0.

The real local database was then scored, which contacts nobody. It holds exactly
one v2 prescan, so the scorable population is one - `lacoorniche.com`, brokenness
83, ability 50, worthy, evidence complete - and `score select` returns a
one-member cohort. That is the honest state of the funnel today, not a defect:
a real cohort needs a prescan batch, which is a separate authorized decision.

One finding worth carrying forward. That hotel scored 0 of the 30 available
`direct-booking` points on reason `booking-path-undetected`, and the stored v2
qualification agrees with the score (`reservationUrl: null`, `bookingVendors:
[]`), so the score is faithful to the facts. But the cheap no-browser pass
records `no-booking-path-detected` on a large share of the qualified population,
while the prescan does open a booking-role page and record
`bookingEvidenceKinds`. Ability's single heaviest component is therefore read
from the weaker of the two available sources. Broadening it to fall back on
prescan evidence would change what an approved weight means, so it is left for
an operator decision and a `hotel-outreach-v2` rather than edited in place.
