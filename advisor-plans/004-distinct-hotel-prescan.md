# Plan 004: Build a distinct three-page hotel prescan

> **Executor instructions**: Complete plan 003. Reuse scanner primitives, but
> do not call the full-audit `runAuditStage` or add a mode flag to it.
>
> **Drift check**: `git diff --stat f7ef7cf..HEAD -- packages/scanner/src packages/interface/src/queue packages/store/src/schemas/job.schema.ts packages/store/src/prospects.ts packages/cli/src/commands/prospect.ts`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plan 003
- **Category**: direction
- **Planned at**: `f7ef7cf`, 2026-08-27

## Why this matters

The supplied design explicitly requires a 60-to-90-second prescan distinct from
the paid audit. The first plan incorrectly reused `runAuditStage`, which would
persist paid-audit shapes and invite prescan drift back toward multi-minute
work.

## Current state

- `runProspectingJob` currently calls `runAuditStage` with three pages and
  Lighthouse disabled. Replace only the connected hotel path; retain legacy URL
  behavior until callers migrate.
- Scanner already owns browser launch, crawling, robots, axe, render diff, and
  transactional-flow primitives. Compose those behind a new deep
  `prescanSite(...)` interface rather than duplicating them.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Scanner tests | `pnpm exec vitest run packages/scanner/src/prescan` | all pass |
| Pipeline tests | `pnpm exec vitest run packages/interface/src/queue/pipeline/run-prospecting-job.test.ts` | all pass |
| Store tests | `pnpm exec vitest run packages/store/src/prescans.test.ts` | all pass |
| Validation | `pnpm run check` | exit 0 |

## Scope

**In scope**: `scanner/src/prescan/`; shared browser with one context per site;
homepage/booking/content selection; axe; direct LCP/CLS/transfer/request/
third-party/main-thread metrics; booking-engine fingerprint; immutable prescan
store; connected job/CLI with dry-run/limit/concurrency.

**Out of scope**: `runAuditStage`, paid audit records/reports, Lighthouse, more
than three pages, full-site normalization, LLM, evidence publication, or live
hotel scans without named-site approval.

## Git workflow

- Work directly on `main`; do not create another branch.
- Commit with `Build the distinct hotel prescan path` or equivalent.

## Steps

### Step 1: Define the prescan interface and immutable result

`prescanSite(input, dependencies)` accepts qualified prospect identity, start
URL, selected seeds, caps, and shared browser/locks. It returns one bounded
result containing page roles, axe facts, raw metrics, booking classification,
artifact references, duration, scanner version, and typed failures. It does not
return or persist `AuditManifest`/paid findings.

**Verify**: schema tests reject more than three pages and prove no paid report
or LLM fields exist.

### Step 2: Select exactly the useful page roles

Homepage is first. Deterministically prefer one same-site reservation/booking
path and one room/accommodation/content page using bilingual link tokens and
transactional signals. Stable normalized URL breaks ties. Record absent roles;
never fill the cap with a random page or audit an off-domain OTA page.

**Verify**: local fixtures cover FR/EN, ties, OTA, duplicates, missing roles,
and three-page cap.

### Step 3: Run one shared browser and direct measurements

Use one shared Chromium instance and isolated context per hotel. Respect robots,
the 1000ms baseline/effective crawl delay, and origin locks. Run axe and direct
PerformanceObserver/CDP measurement for LCP, CLS, transfer bytes, request and
third-party counts, and main-thread blocking. Never invoke Lighthouse.

**Verify**: local E2E tests assert metrics/provenance, context cleanup on error,
no Lighthouse call, and configurable concurrency without same-origin overlap.

### Step 4: Persist and connect the job

Create immutable 90-day `prescans` documents linked to prospect/candidate/job.
Add a connected hotel input mode to the existing prospecting queue or a
reconciled job shape without duplicating orchestration. Store helpers own
writes. Default skips non-expired successful prescans unless `--rescan`.

**Verify**: retry/failure/idempotency tests and legacy URL-mode regressions pass.

### Step 5: Add bounded operator controls

`prospect prescan --limit N --concurrency N --dry-run` lists qualified,
unsuppressed 3-star hotels and predicted work. Production execution requires
current permission for the named domains in the batch.

**Verify**: CLI tests prove dry-run zero browser/store writes and bounds.

## Test plan

Pure role tests, local browser fixtures, store integration, worker cleanup,
concurrency/politeness, and legacy regression tests.

## Done criteria

- [x] Hotel prescan does not call the full-audit pipeline.
- [x] At most homepage, booking, and content pages run; no Lighthouse.
- [x] Direct metrics and booking fingerprint are persisted immutably for 90 days.
- [x] Dry-run/limit/concurrency and named-site permission gates exist.
- [x] Tests/check pass (1859 tests, `pnpm run check` clean); plan 004 is
      `DONE`. Verified live against lacoorniche.com, twice, in 36 and 40
      seconds. See `docs/decisions/trade-offs.md` entry 35.

## STOP conditions

Stop if scanner primitives cannot be reused without a locked-contract/package
change, direct metrics prove unreliable, context isolation leaks, or live-site
permission is absent.

## Maintenance notes

Prescan is its own deep module. Share low-level scanner implementation, never
the paid-audit orchestration or output contract.
