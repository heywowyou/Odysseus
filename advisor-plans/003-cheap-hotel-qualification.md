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
- **Status**: DONE, 2026-08-27. Implemented, tested, and validated by a full
  live run over all 13,301 candidates; measured facts in
  `advisor-plans/README.md`, "Measured source facts". Binding decision 3 is
  triggered (5,720 qualified against the 8,000 floor) and resolved: the
  operator declined Overpass on the measurement. Nothing was ingested.
- **Planned at**: `f7ef7cf`, 2026-08-27
- **Amended at**: 2026-08-27, before execution, by operator decision. See
  "Execution decisions" below. The steps are otherwise unchanged.

## Execution decisions

Four forks the plan as first written left open or answered wrongly. Recorded
here so a later reader sees the decision rather than a discrepancy between this
file and the code.

1. **Inline CLI, not a queue job.** `prospect hotel-qualify` runs in process,
   like `hotel-resolve`, owning its own `OriginLock` and bounded lane
   concurrency. The rule in `packages/cli/src/commands/prospect.ts` that sends
   site-fetching work to the queue exists for the concurrency ceiling and the
   politeness budget; this command carries both itself, and staying inline keeps
   a one-off national measurement runnable without `odysseus serve`.
2. **A separate insert-only `hotel_qualifications` collection**, not an emission
   into `prospects`. The `prospects` schema requires a `scanJobId` that does not
   exist before a scan and hard-enums an AFNIC-only `dataOrigin`; bending both
   to fit would make the collection mean two things. A `prospects` event is
   emitted in plan 004, when a scan job genuinely exists. Binding decision 6 is
   satisfied either way: `prospects` stays an append-only event log rather than
   becoming a mutable registry.
3. **The reservation path is recorded, not gated on.** Real hotel booking
   engines are frequently JS widgets or iframes, invisible to a no-browser
   fetch, so making a detected path a hard campaign condition would park
   thousands of hotels on a detection weakness rather than on a fact. The fact
   and its evidence are stored, a `no-booking-path-detected` note is counted
   separately in the coverage report, and step 4's measurement is what decides
   whether the gate should later become hard.
4. **Live-site authorization is standing.** The per-named-site permission
   requirement was withdrawn on 2026-08-27; see CLAUDE.md, "Testing", and
   binding decision 18. Politeness and boundedness are unchanged.

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
at least 3 stars, own domain, DNS/TLS/HTTP viability, and a non-parked page. A
discoverable direct reservation path is recorded as a non-blocking note rather
than required; see execution decision 3. Unknown star rating is `parked`, not
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

Write one insert-only `hotel_qualifications` document per evaluation, carrying
versioned facts, reasons, notes, and hotel candidate/source provenance under a
90-day TTL, and update a small current-state `qualification` pointer on the
candidate so prescan selection can query it directly. Do not turn either
collection into the other. Parked/rejected candidates stay queryable but never
enter prescan selection. No `prospects` event is emitted here; see execution
decision 2.

**Verify**: store tests prove one document per evaluation, that a re-run at the
same qualification version neither duplicates nor mutates history, and that the
candidate pointer updates while `review` and `sourceRefs` stay untouched.

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
Dry-run performs fixture/local checks or planning counts without persistence
and without third-party requests. Real batches run under standing authorization,
bounded by `--limit` and resumable from a checkpoint.

**Verify**: CLI bounds, dry-run zero writes, resume, and reason counts pass.

## Test plan

Pure decision tables, local protocol fixtures, store integration, and CLI
tests. No live hotel scan is authorized by this plan.

## Done criteria

- [x] Below-3-star and unknown-rating hotels are parked and retained.
      Measured: `below-three-stars` 3,536, `awaiting-review` 187.
- [x] Dead/parked/broken/aggregator/no-booking sites have typed reasons.
      Every one of the 13,301 candidates carries exactly one outcome and the
      totals reconcile.
- [x] Every evaluation writes one append-only `hotel_qualifications` document
      and updates the candidate's current-state pointer. No `prospects` event is
      emitted at this stage; see execution decision 2.
- [x] Coverage decides whether an Overpass plan is needed. It returned
      `propose` at 5,720 qualified; the run ingested nothing, which is the
      specified behaviour. The operator declined Overpass on 2026-08-27 with
      that number in hand. See `advisor-plans/README.md`, "Explicitly
      deferred".
- [x] Tests/check pass; plan 003 is `DONE`.

## STOP conditions

Stop for an unclear star source, an unverified park/OTA rule, coverage below
target requiring Overpass, dependency or package changes, or any legal
conclusion inferred from size. Live-domain permission is no longer a stop
condition; see execution decision 4.

## Maintenance notes

Version qualification rules and retain reason distributions. A later campaign
may revisit parked lower-rated hotels without re-ingesting the source catalogue.
