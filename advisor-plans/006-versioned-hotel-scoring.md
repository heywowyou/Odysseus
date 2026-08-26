# Plan 006: Score hotel candidates with immutable versioned breakdowns

> **Executor instructions**: Complete plans 001 through 005. Do not change the
> shipped cost gates or enable selection before operator weight approval.
>
> **Drift check**: `git diff --stat f7ef7cf..HEAD -- packages/core/src/cost-gating packages/core/src/prospecting packages/store/src/prescans.ts packages/store/src/scores*`

## Status

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

- [ ] Scores are separate immutable documents with breakdown/version.
- [ ] Below-3-star hotels cannot enter selection.
- [ ] Approved selection implements top-half then top-decile deterministically.
- [ ] Existing cost gates are unchanged; tests/check pass; plan 006 is `DONE`.

## STOP conditions

Stop without approved weights, required facts/evidence, or if scoring would
change cost gates/locked contracts/package boundaries.

## Maintenance notes

Never edit weights in place. The first 100 sends decide whether a score version
has predictive value.
