# Plan 003: Qualify hotel websites cheaply before any browser scan

> **Executor instructions**: Complete plan 002. This stage performs bounded
> HTTP/DNS/TLS checks only. It never launches Chromium or contacts a recipient.
>
> **Drift check**: `git diff --stat f7ef7cf..HEAD -- packages/core/src/prospecting packages/interface/src/prospecting packages/scanner/src/robots.ts packages/store/src/hotel* packages/store/src/prospects.ts docs/prospect-qualification.md`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plan 002
- **Category**: direction
- **Planned at**: `f7ef7cf`, 2026-08-27

## Why this matters

Chromium time should be spent only on viable independent hotels. This missing
stage records why dead, parked, aggregator-only, lower-rated, already-engaged,
or non-transactional candidates did not proceed, so later conversion data can
audit the filter.

## Current state

- Existing 9a fetches mentions legales for AFNIC candidates but has no complete
  hotel viability state machine.
- Operator decision: 3 stars is a hard campaign threshold. Hotels below 3
  stars remain in the catalogue as `parked: below-three-stars`, not deleted.
- Atout France is the catalogue; Sirene enriches. A further source is
  considered only after this stage measures usable own-domain coverage below
  8,000, the lower bound of the 8,000 to 15,000 target. This stage's
  unusable-website rate is also what would reopen the rejected DATAtourisme
  alternate-website path; see `advisor-plans/README.md`, "Measured source
  facts".

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Qualification tests | `pnpm exec vitest run packages/core/src/prospecting/qualify-hotel.test.ts packages/interface/src/prospecting/check-hotel-site.test.ts` | all pass |
| Store tests | `pnpm exec vitest run packages/store/src/hotel-candidates.test.ts packages/store/src/prospects.test.ts` | all pass |
| Validation | `pnpm run check` | exit 0 |

## Scope

**In scope**: pure typed qualification; DNS/TLS/redirect/HTTP checks; parked and
holding-page detection; same-domain reservation-path discovery; accessibility
statement detection; 3-star hard filter; size deprioritization; recorded
reasons; qualified prospect-event emission; coverage report; conditional
Overpass decision record.

**Out of scope**: Chromium, axe, render diff, Lighthouse, fuzzy joining,
contacts from named individuals, automatic Overpass ingest, or legal scope
conclusions.

## Git workflow

- Work directly on `main`; do not create another branch.
- Commit with an imperative message such as `Qualify viable three-star hotels`.

## Steps

### Step 1: Define exhaustive qualification outcomes

Create a pure `qualifyHotelCandidate(facts)` returning `qualified | parked |
rejected | already-engaged | group-routed`, all with typed reasons. Required
hard campaign conditions: resolved independent establishment, verified rating
at least 3 stars, own domain, DNS/TLS/HTTP viability, non-parked page, and a
discoverable direct reservation path. Unknown star rating is `parked`, not
assumed eligible. Group/chain and existing accessibility declaration route to
their own queues.

Hotels with effectif 0-9 and capacity under 20 are parked/deprioritized with
the microenterprise test explicitly unresolved; never state legal scope.

**Verify**: table tests cover every reason, combinations, unknown facts, and
3-star boundary (2 parked, 3 eligible).

### Step 2: Implement polite no-browser website checks

Reuse origin locks, user agent, robots, pacing, timeout, and safe HTTP helpers.
Resolve DNS; validate TLS; follow bounded redirects; require final 2xx HTML;
identify registrar/parking signatures; extract internal links/footer/contact
and reservation tokens without JS. Off-domain OTA links prove neither an own
site nor a direct first-party booking path, but may be recorded as vendor facts.

**Verify**: local HTTP fixtures cover dead DNS abstraction, expired TLS result,
redirect loops/offsite landings, non-2xx, non-HTML, parked pages, brochure-only,
booking links, declarations, robots denial, and timeout. No real network.

### Step 3: Persist qualification snapshots and prospect events

Store versioned qualification facts/reasons on the hotel catalogue through
helpers. When qualified, emit an insert-only existing `prospects` event with
hotel candidate/source provenance and 90-day TTL. Do not turn the prospect
collection into the catalogue. Parked/rejected candidates stay queryable but
never enter prescan selection.

**Verify**: store tests prove one event per evaluation, no mutation of event
history, and no event for parked/rejected/group candidates.

### Step 4: Measure coverage and decide Overpass

Report source rows, resolved hotels, own domains, 3-star candidates, qualified,
and each loss reason. If qualified usable own-domain yield is within 8,000 to
15,000, keep Overpass deferred. If below 8,000, stop and present the measured
shortfall, proposed Overpass fields/licence/rate limits, and a new adapter plan
for approval; do not silently ingest it.

**Verify**: totals reconcile and the Overpass recommendation is deterministic
at the 8,000 boundary.

### Step 5: Add bounded operator commands

Add `prospect hotel-qualify --dry-run --limit N` plus parked/rejection reports.
Dry-run performs fixture/local checks or planning counts without persistence;
real third-party checks require named-domain authorization for the batch.

**Verify**: CLI bounds, dry-run zero writes, resume, and reason counts pass.

## Test plan

Pure decision tables, local protocol fixtures, store integration, and CLI
tests. No live hotel scan is authorized by this plan.

## Done criteria

- [ ] Below-3-star and unknown-rating hotels are parked and retained.
- [ ] Dead/parked/broken/aggregator/no-booking sites have typed reasons.
- [ ] Only qualified hotels emit append-only prospect events.
- [ ] Coverage decides whether an Overpass plan is needed.
- [ ] Tests/check pass; plan 003 is `DONE`.

## STOP conditions

Stop for live-domain permission, unclear star source, unverified park/OTA rule,
coverage below target requiring Overpass, dependency/package changes, or any
legal conclusion inferred from size.

## Maintenance notes

Version qualification rules and retain reason distributions. A later campaign
may revisit parked lower-rated hotels without re-ingesting the source catalogue.
