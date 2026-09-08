# Plan 034: Port booking detection to prospecting and ship hotel-outreach-v2

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM (changes what a prescan measures and adds a scoring
  version; stored data must stay additive)
- **Depends on**: nothing hard; gates plan 014's Step 3 freeze (runbook
  gate E reopens until this plan's approval step passes)
- **Category**: 9c detection and scoring
- **Planned at**: commit `cdf58d7`, 2026-09-08, operator-directed in
  session: implement the better booking detection everywhere before
  anything real runs; there is no deadline; recording a deferral is a sure
  way to lose it. The dead staff-size weight should read Atout France
  size data, which the operator believed we already have.

## Why this matters

The `hotel-outreach-v1` score's heaviest ability weight, direct-booking
(30 points), reads `reservationUrl` from the cheap href probe in
`check-hotel-site.ts`, and `no-booking-path-detected` fires on 3,463 of
13,301 catalogue candidates (26 percent), a documented detection
weakness. The September audit-side fixes (`f15b1e0`, `b318308`, `f0fff69`,
issue #88) improved exactly this class of detection but never reached the
prospecting path. Separately, the effectif weight (20 points) is zero for
the entire population because the INSEE stock file was never supplied
(`data/sirene/` is empty), while the Atout France export carries size
columns at full coverage. Trade-off 38 pre-reserved both changes as the
`hotel-outreach-v2` trigger.

## Measured facts

- The prescan already calls the audit's `detectTransactionalFlow` on every
  rendered page (`prescan-site.ts:294`), so it is JS-aware. What it lacks:
  `detectUnresolvedBookingControls` (the href-less and `javascript:`
  control fix), redirect-following (`findDelegatedBookingRedirectChecks`),
  and it re-inlines a third copy of the booking vocabulary
  (`isBookingCallToAction`, `page-roles.ts:211`) instead of importing the
  shared `BOOKING_INTENT_TEXT_PATTERN`.
- Size coverage, measured 2026-09-08 over the local export snapshot
  (`data/atout-france/hebergements_classes.csv`, downloaded 2026-08-27;
  re-measure on a fresh export at implementation time): `NOMBRE DE
  CHAMBRES` and `CAPACITÉ D'ACCUEIL (PERSONNES)` are both populated for
  9,765 of 9,765 three-to-five-star `HÔTEL DE TOURISME` rows, 100
  percent. Row totals reconcile with the recorded measured facts (13,301
  hotel rows, 9,765 at three to five stars). Room-count distribution:
  under 15 rooms 1,312; 15-24 rooms 1,797; 25-34 rooms 1,575; 35-49
  rooms 1,841; 50 or more rooms 3,240.

## Binding decisions

1. The prescan bumps to **v4** (`CURRENT_PRESCAN_VERSION`, hand bump as
   `hotel-prescan.ts` mandates when what a prescan measures changes).
   Stored evidence stays kinds-only and additive; selectors and exact
   URLs reach no stored field and no operator view.
2. The prescan calls `detectUnresolvedBookingControls` on every rendered
   page and records its outcome as new `bookingEvidenceKinds` values.
3. Redirect-following is ported **conditionally and bounded**: only when a
   rendered page yields booking-intent links, at most 3 third-party
   navigations per prescan, a per-batch shared `RedirectHostCache`,
   identified user agent, per-host pacing, hard timeout. Same politeness
   rules as the paid audit's delegated-booking checks.
4. `isBookingCallToAction` imports the shared
   `BOOKING_INTENT_TEXT_PATTERN`; the third copy dies.
5. The cheap probe shares the pure booking-intent pattern only; the
   curated vendor-host lookup stays; no DOM parser or new dependency.
6. **`hotel-outreach-v2`** is a new entry in
   `HOTEL_OUTREACH_SCORE_CONFIGS`, insert-only alongside v1, never an
   edit of v1. direct-booking re-sources from prescan v4
   `bookingEvidenceKinds` with the site-facts `reservationUrl` as
   fallback. The effectif weight re-sources to Atout France room-count
   bands, reading `roomCount` (rooms, not persons; the capacity weight
   keeps `capacity ?? roomCount`): proposed tiers 50 or more rooms 20
   points, 25-49 rooms 12 points, else 0 with a typed reason. The INSEE
   `effectifBandCode` becomes an alternative earning path if the stock
   file ever arrives. All other weights unchanged.
7. **STOP**: the operator approves the final v2 weight table before the
   config is marked approved and before any cohort selection uses it.
8. Rescoring runs with `--qualification-version v2` until v3 rows exist
   (issue #69 mismatch), which is the only way `listCandidatesToScore`
   returns anyone. Scoring contacts nobody; the only live work in this
   plan is step 5's bounded prescan batch.

## Steps

1. Prescan v4 part 1: call `detectUnresolvedBookingControls` in
   `prescan-site.ts`, map outcomes to new kinds, bump the version, tests
   for kinds and absence of selectors.
2. Prescan v4 part 2: conditional bounded redirect checks with the shared
   cache, tests for the budget and the conditional trigger.
3. Replace `isBookingCallToAction` with the shared pattern; tests.
4. Cheap probe: share the pure pattern; tests.
5. Bounded prescan v4 batch over the wave-1 selection population
   (`--dry-run`, explicit `--limit`, checkpoint), the same bounded shape
   as the 120-hotel run of record.
6. `prospect score run --scoring-version hotel-outreach-v2
   --qualification-version v2`, then `prospect score diff` v1 to v2;
   the operator reads the diff and approves the table (STOP gate); then
   `prospect score select` under v2 for the wave-1 cohort.
7. Docs: trade-off 38 run-of-record note, plans index status, runbook
   gate E closes on the approval and diff evidence.

## Done criteria

- [ ] Prescans store `prescanVersion: 'v4'` with the new kinds and no
      selectors; old prescans unread and untouched.
- [ ] `hotel-outreach-v2` exists approved only after the operator's
      recorded approval; v1 rows and configs unchanged.
- [ ] The v1-to-v2 score diff is reviewed by the operator before
      selection.
- [ ] Focused suites, `pnpm run check`, and the store suite are green.
- [ ] Plans index and the rollout runbook record the outcome.

## STOP conditions

Any schema break to stored prescans or scores; any selector or exact URL
reaching stored kinds or operator views; shipping v2 as approved without
the operator's recorded approval; live probing beyond step 5's bounded
batch; working around the qualification-version mismatch silently.
