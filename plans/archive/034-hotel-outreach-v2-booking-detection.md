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

## Implementation status

Steps 1 through 4 are implemented as of 2026-09-08. Prescan v4 records only
fixed booking-kind labels for the new unresolved-control and redirect outcomes;
the transient scanner observations carrying selectors, hrefs, destination URLs,
and details are discarded before persistence. The redirect budget is shared
across a prescan's pages and limits new third-party navigations to three.

`hotel-outreach-v2` is present but intentionally unapproved. It reads direct
booking only from v4 kinds that prove an on-site or single-property booking
flow, with `reservationUrl` as fallback; unresolved and marketplace outcomes
do not earn the direct-booking weight. Its effectif component reads room-count
bands, with the existing Sirene effectif code retained as an alternative path.

Steps 5 through 7 remain pending: no live batch, rescore, score diff, cohort
selection, or approval was run during implementation.

**Incident, 2026-09-08.** Step 5's bounded batch (job `dfcc1deb-...`, 120
approved sites) was reported complete but had scanned 229 distinct
candidates, 110 of them never approved, via a job restart that does not
preserve the original scope. Full write-up and root cause:
`docs/decisions/trade-offs.md#75`; residual defect tracked as issue #114.
Operator decision: the 119 approved-and-scanned domains are the batch of
record (true counts: 110 evidence-complete, 9 evidence-incomplete, 1 true
failure - `hotel-victoria.fr`, no record); the 110 unapproved prescans stay
stored but are excluded from any `hotel-outreach-v2` scoring, diff, or
cohort work. Step 5 is not repeated without further explicit authorization.

**Step 6, 2026-09-08.** The operator excluded `hotel-victoria.fr` (no v4
evidence, no retry) and approved the `hotel-outreach-v2` weight table as
shown, against the table itself rather than the diff, per the operator's
own explicit sequencing. `hotel-outreach-v2` is now `approved: true`;
`CURRENT_SCORING_VERSION` stays `hotel-outreach-v1` until the operator
says otherwise. `prospect score run` was then invoked once per domain
(never a bulk `--limit` run) for exactly the 119 approved domains, so the
110 unapproved-scan candidates were never scored under v2 and cannot
reach `prospect score select`, which reads scores by version. The v1-to-v2
diff is generated (120 v1 rows against 119 v2 rows, `onlyInFrom: 1` is
`hotel-victoria.fr` as expected) and was reviewed by the operator, who
approved proceeding. `prospect score select --scoring-version
hotel-outreach-v2 --qualification-version v3` recorded cohort
`3b5c6b0c-6d93-4c51-bdf8-3b78449d9baa`: 6 hotels selected from a
110-candidate eligible population (119 scored minus 9 evidence-incomplete),
cutoffs ability >= 72 and brokenness >= 92 (`lescorderies.com`,
`hotelplatdetain.com`, `hotel-espace-champerret.com`,
`belleval-hotel-paris.com`, `hotel-maitagaria.com`, `hotelmontsegur.com`).
Step 5 (cohort selection) is done. No contact discovery or outreach
drafting has been run; both remain separately gated.

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

- [x] Prescans store `prescanVersion: 'v4'` with the new kinds and no
      selectors; old prescans unread and untouched.
- [x] `hotel-outreach-v2` exists approved only after the operator's
      recorded approval; v1 rows and configs unchanged.
- [x] The v1-to-v2 score diff is reviewed by the operator before
      selection.
- [x] Focused suites, `pnpm run check`, and the store suite are green
      (2026-09-08: `docs:check`, `lint`, `typecheck` clean; the one
      `format:check` warning is a pre-existing, gitignored Next.js-generated
      file, not this plan's work; focused `hotel-outreach-score.test.ts`
      24/24 and the full store suite 27 files / 245 tests, both green).
- [x] Plans index and the rollout runbook record the outcome.

## STOP conditions

Any schema break to stored prescans or scores; any selector or exact URL
reaching stored kinds or operator views; shipping v2 as approved without
the operator's recorded approval; live probing beyond step 5's bounded
batch; working around the qualification-version mismatch silently.
