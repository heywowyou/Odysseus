# Plan 078: Campaign results page

- **Execution status:** DONE 2026-10-10: deployed, backfilled, read against production and accepted by the operator (closure evidence at the end).
- **Priority:** P1
- **Effort:** L
- **Depends on:** issue #533 (campaign funnel and campaign version), issue #561 (daily funnel snapshot), Plan 047 (durable prospect hub), Plan 069 (v3 preview and its frozen `priorityCardCategories`).

## Outcome

The operator can answer, from the dashboard and without a terminal, the five questions the brief's kill criteria ask (`docs/product/odysseus-project-brief.md` section 12):

1. How many first emails are out, and what came back?
2. How many of them are **matured**, the unit every checkpoint is written in?
3. Why did the prospects who answered say no?
4. Do replies differ by kind of hotel?
5. When will the next checkpoint be reached at the current pace?

One new page, `Campagne` / `Campaign`, shows this as counts the operator can stand behind. It prepares nothing, sends nothing, ranks nothing and changes no prospect.

## Current repository seams

Read from the code at `69f9a9a9` (2026-10-09).

- `packages/store/src/outreach-funnel.ts` owns `aggregateOutreachFunnel()`: per campaign, `threads`, `firstTouchSent`, `replied`, `bounced`, `optedOut`, `won`, `repliesAfterTouch`, `outcomes`. Counts only, no identifier leaves the function.
- `GET /api/outreach/funnel` (`packages/interface/src/routes/prospect-hub.ts`) serves it. `packages/interface/src/dashboard/routes/a-traiter.tsx` renders five of those counts in the `Résultats de la campagne` card. `odysseus outreach-funnel` prints all of them.
- `outreach_funnel_snapshots` keeps one row per UTC day and campaign, with no TTL (issue #561). Threads and outcomes expire after 90 days.
- `OutreachThreadState` (`packages/core/src/prospecting/outreach-thread-state.ts`) has twelve values. `sequence-complete` is written by `completeOutreachSequence()` once `spacing.replyWindowDays` have passed since touch 3. Each thread carries its own `spacing` snapshot and `touches[].sentAt`.
- `campaignVersion` is stamped on a thread at open from `ODYSSEUS_OUTREACH_CAMPAIGN_VERSION`. A wording change is separated from the baseline by setting a new value. Nothing in this plan changes that.
- `OUTREACH_LOST_REASONS` (`packages/core/src/prospecting/outreach-outcome.ts`) is a closed list of six values with FR and EN labels already in `i18n/sections/labels.ts`. The `outreach_outcomes` schema has a `lostReason` field.
- Prospects carry `hotel.stars` and `hotel.groupStatus`. A thread carries `previewId`, and the preview row carries `publishedFacts.priorityCardCategories`.

### Defect found while reading: recorded outcomes never reach the funnel

`recordProspectOutcome()` (`packages/store/src/prospect-hub.ts`) changes the prospect status and writes an `outcome-recorded` prospect event. It writes no `outreach_outcomes` row and never sets `thread.currentOutcome`. No other production code does either: the only uses of `createOutreachOutcomeModel` outside tests are a read in the funnel, a count and a delete.

Consequences today:

- the funnel's `outcomes` map and `won` count stay at zero whatever the operator records;
- `lostReason` is never captured, although its schema field and labels exist;
- `prospect-work.ts` keeps a `record-outcome` row for a `replied` thread while `currentOutcome` is undefined. Slice 0 must check whether that row currently clears through the prospect status, and record the answer.

Slice 0 fixes this first. Every later slice depends on it.

## Binding decisions

### 1. One page, reached from two places, not a fourth primary destination

Route `/campagne`. It is not added to the sidebar: `docs/product/dashboard-ia.md` fixes three primary destinations. It is reached from a `Voir la campagne` / `View campaign` link in the À traiter campaign card and from the Results view of Prospects. The À traiter card stays, reduced to delivered, matured, replies and wins.

### 2. Maturity is a pure, exhaustive classification of thread state

One function in `core`, `classifyOutreachMaturity(thread, now)`, maps every thread to exactly one bucket. The mapping is total over `OutreachThreadState`; a new state fails compilation until it is mapped.

| Bucket | Thread states | Counts as delivered | Counts as matured |
| --- | --- | --- | --- |
| `prepared` | `open`, `e1-drafted` | no | no |
| `in-sequence` | `e1-sent`, `e2-drafted`, `e2-sent`, `e3-drafted` | yes | no |
| `reply-window` | `e3-sent` | yes | no |
| `matured-replied` | `replied`, `opted-out`, or any thread whose current outcome is a reply outcome | yes | yes |
| `matured-silent` | `sequence-complete` | yes | yes |
| `undelivered` | `bounced` | no | no |
| `merged` | `closed` with reason `operator-confirmed-send` | no | no |
| `closed-other` | `closed` with any other reason | yes | resolved in slice 1 |

Rules:

- **Delivered first touches** = threads with a touch 1 record, minus `undelivered` and `merged`. This is the denominator of every rate, as `outreach-strategy-recommendations.md` section 4 defines it.
- **Matured** = `matured-replied` + `matured-silent`. This is the brief's definition: replied, or the sequence closed without a reply.
- A reply recorded after `sequence-complete` moves the thread to `matured-replied` through its outcome. It was already matured, so the matured count does not change, only the split.
- `merged` threads are shown as a count in the page footnote. Their recipient is counted once, on the thread that carried the message.
- `closed-other`: slice 1 lists every `stateReason` that production code can write for `closed` and maps each one explicitly. An unmapped reason is displayed in its own row, never dropped and never guessed into another bucket.

### 3. Decline reasons reuse the closed vocabulary, extended by two values

`OUTREACH_LOST_REASONS` gains `misread-offer` and `wrong-recipient`. The field keeps its name `lostReason`. No free text.

| Value | FR label | EN label |
| --- | --- | --- |
| `existing-provider` | A déjà un prestataire | Already has a provider |
| `misread-offer` | A compris une autre offre | Misread the offer |
| `not-a-priority` | Pas une priorité | Not a priority |
| `budget` | Budget | Budget |
| `timing` | Pas le moment | Timing |
| `wrong-recipient` | Mauvais destinataire | Wrong recipient |
| `scope-mismatch` | Hors périmètre | Scope mismatch |
| `other` | Autre | Other |

The reason is **required** for `reply-negative` and `lost`, optional for `reply-not-now`, refused for every other outcome. One reason per outcome: when two apply, the operator picks the one that says most about the message (a hotel that declines an analytics service it believes it was offered is `misread-offer`, not `existing-provider`).

### 4. Segments are three stored facets, never an inference

- stars: `prospect.hotel.stars`, values 1 to 5 and `unknown`;
- group status: `prospect.hotel.groupStatus`, its four stored values;
- accessibility among the three preview cards: `yes`, `no`, `unknown`, from `publishedFacts.priorityCardCategories` of the thread's `previewId`.

A missing prospect, facet or preview row is `unknown`. No name, domain, keyword or model decides a segment.

### 5. No rate is shown on a small denominator

A percentage is printed only when its denominator is at least 20. Below that the cell shows the two counts (`1 / 12`). A reply rate over matured threads and a reply rate over delivered threads are different numbers; the page labels which one it prints and prints the matured one. A count that could not be loaded renders as the unavailable marker, never as zero (DESIGN.md, Evidence Desk).

### 6. The projection separates what is dated from what is estimated

- For threads already sent, the latest maturity date is known: touch 3 `sentAt` + `replyWindowDays` when touch 3 is sent, otherwise touch 1 `sentAt` + `touch3AfterDays` + `replyWindowDays` from the thread's own `spacing`. A checkpoint that these threads alone will reach shows a date labelled `au plus tôt` / `at the earliest`, because a late follow-up moves it.
- Beyond the threads already sent, the date extrapolates the pace: touch 1 sends over the last 14 calendar days divided by 14. It is labelled `estimation` and prints the pace beside it.
- With fewer than 7 days of sends, or a pace of zero, no estimate is shown.
- Checkpoints are the brief's: 100, 300 and 500 matured first touches, held as one constant in `core` beside the classification.

### 7. The page reports, it does not conclude

Each checkpoint row prints the brief's rule as written and the measured values beside it. No badge says the campaign works or fails. Changing targeting or wording stays an operator decision.

### 8. Counts only, at every boundary

The API response, the CLI output and the snapshot rows carry counts per campaign and per segment. No `prospectId`, `threadId`, domain, address or name. Snapshot rows keep having no TTL; the new fields are optional so rows written before this plan stay valid.

## Page design

Dashboard tokens and components only (`DESIGN.md`): `PageHeader`, `Kpi`, `Card`, `Table`, `Segmented`, `ProgressBar`, `Badge`, `InfoTip`, `EmptyState`, `Skeleton`. No chart library, no new colour, no shadow on resting surfaces, nothing above 20px. The only chromatic element is the existing accent as text or tint.

Top to bottom, in the 1024px column:

1. **Header.** Title `Campagne`. Description: the campaign version and the date of its first send. A `Segmented` control switches campaign when more than one exists; the choice lives in the URL (`?campagne=`).
2. **KPI row, four tiles.** `Premiers emails délivrés` · `Arrivés à maturité` · `Réponses` · `Ventes`. Each tile has one muted line under the value: bounces excluded, share of delivered, of which positive, revenue is not shown.
3. **Card `Où en sont les prospects`.** One horizontal strip in four segments drawn to scale, strongest ink for the strongest claim: replied, matured without reply, reply window, in sequence. The strip is decoration: a legend under it prints each label and count as text. One line below: the next maturity date and how many threads mature in the next 7 days.
4. **Card `Points de contrôle`.** Three rows, 100, 300, 500. Each row: a `ProgressBar`, `37 / 100`, the date (dated or estimated per decision 6), and the brief's rule for that checkpoint in muted text. A reached checkpoint replaces the date with the day it was reached and prints replies and positive replies at that day, read from the snapshot.
5. **Card `Réponses`.** Two small tables side by side from `lg`, stacked below: replies by the last touch sent before them (1, 2, 3), and decline reasons with counts, largest first. An outcome recorded without a reason before this plan counts under `Non renseigné`.
6. **Card `Par segment`.** A `Segmented` control picks the facet (stars, group status, accessibility in the preview). One table: segment, delivered, matured, replies, positive replies, reply rate over matured per decision 5. `unknown` is always the last row.
7. **Footnote.** The definitions of delivered and matured in one sentence each, the merged-thread count, and the retention note the À traiter card carries today.

States: skeleton tiles and rows on first load; the unavailable marker on a failed load with a retry; an `EmptyState` (`Aucun premier email envoyé`) when no campaign has a delivered touch. Under 768px the tables scroll horizontally inside their panel, as every other dashboard table does.

Accessibility target: WCAG 2.2 AA. Every bar has a text equivalent, tables use header cells with scope, the segmented controls are keyboard operable, and focus order follows the visual order.

## Implementation slices

### Slice 0: a recorded outcome reaches the thread

- `recordProspectOutcome()` inserts an `outreach_outcomes` row and sets `thread.currentOutcome` when the prospect has a thread, in the same operation that records the event. Idempotent on the existing `idempotencyKey`.
- One-off backfill script under `scripts/`, dry-run by default: for each thread without `currentOutcome`, take the prospect's latest `outcome-recorded` event still present and write the row. It prints counts only.
- Record whether the `record-outcome` À traiter row cleared before this fix, and add the regression test either way.

### Slice 1: maturity in `core`

- `packages/core/src/prospecting/outreach-maturity.ts`: `classifyOutreachMaturity`, `latestMaturityDate`, `OUTREACH_CHECKPOINTS`, `projectCheckpoints`. Pure, no I/O, `now` passed in.
- Enumerate the `closed` reasons and settle the `closed-other` row of decision 2.

### Slice 2: decline reason capture

- Extend `OUTREACH_LOST_REASONS` and its labels.
- `POST /api/prospects/:prospectId/outcome` accepts `lostReason` and enforces decision 3 with a 400 on a missing or forbidden reason.
- Results view and prospect page: choosing `reply-negative` or `lost` reveals a second select; the outcome is sent only once a reason is chosen. Same control in both places, one component.

### Slice 3: aggregate, snapshot, API, CLI

- `aggregateOutreachFunnel()` returns, per campaign, the existing fields plus maturity buckets, positive replies, decline reasons, the three segment tables and the projection inputs. A fixed number of collection reads whatever the thread count.
- The daily snapshot stores the new counts. `GET /api/outreach/funnel` returns them with a zod schema in `dashboard/lib/api-schemas.ts`. `odysseus outreach-funnel` prints them.

### Slice 4: the page

- `packages/interface/src/dashboard/routes/campaign.tsx` with a pure `campaign-model.ts` that turns the API payload into rows, rates per decision 5 and checkpoint rows per decisions 6 and 7.
- i18n section `campaign.ts`, FR first, EN translated from it.
- Route, the two entry links, and the reduced À traiter card.

### Slice 5: documents

- `docs/product/dashboard-ia.md`: the page, its two entry points, why it is not a primary destination.
- `docs/decisions/trade-offs.md`: one entry for decisions 2, 5 and 6.
- `DESIGN.md`: the maturity strip, if it becomes a reusable pattern.
- `plans/README.md`: status of this plan.

## Out of scope

- Any change to email wording, the preview, targeting or pacing.
- The reference-link request signal (`ODYSSEUS_REFERENCE_AUDIT_LINK_TRACKING` stays off).
- Open tracking of any kind.
- A verdict, score or recommendation computed from the counts.
- Revenue figures, re-audits, referrals and the agency channel.
- Per-prospect drill-down from a count. The Results view already lists prospects.

## Definition of done

1. Recording an outcome in the dashboard writes the outcome row and the thread pointer, and the funnel counts it.
2. Every thread state and every `closed` reason maps to exactly one maturity bucket.
3. A negative outcome cannot be recorded without a reason, and each reason is counted.
4. `/campagne` shows delivered, matured, replies, wins, the maturity strip, the three checkpoints, replies by touch, decline reasons and the three segment tables for the selected campaign.
5. No percentage appears on a denominator under 20, and no failed load appears as zero.
6. Checkpoint dates are labelled dated or estimated, and no estimate appears without 7 days of sends.
7. No response, CLI output or snapshot row carries an identifier.
8. The page passes the dashboard's automated accessibility test and a recorded keyboard walk.
9. The owning documents are updated.

## Executable closure contract

Closure requires a requirement-to-proof mapping with one row per binding requirement below. No row may be blank or closed by code review alone.

| Requirement | Owner seam | Proof |
| --- | --- | --- |
| Outcome reaches thread and funnel (DoD 1) | `recordProspectOutcome()` | store integration test: record `won`, then `aggregateOutreachFunnel()` returns `won: 1`; repeat with the same key writes one row |
| Backfill writes only missing pointers | backfill script | test on a fixture with one thread already pointed and one not; dry-run writes nothing |
| Maturity mapping is total (DoD 2) | `classifyOutreachMaturity` | table test over every `OutreachThreadState`; a type-level exhaustiveness check; one case per `closed` reason; an unknown reason lands in its own bucket |
| Delivered excludes bounced and merged | same | unit test with one thread of each kind |
| Late reply changes the split, not the matured count | same | unit test: `sequence-complete` thread with a reply outcome |
| Reason required, optional or refused per outcome (DoD 3) | outcome route | route test: 400 without reason on `reply-negative` and `lost`; 400 with a reason on `won`; 200 on `reply-not-now` with and without |
| Small-denominator rule (DoD 5) | `campaign-model.ts` | unit test at denominators 19 and 20 |
| Unavailable is not zero (DoD 5) | `campaign.tsx` | render test with a failed fetch: no `0` in any tile |
| Projection labels and floor (DoD 6) | `projectCheckpoints` | unit tests: checkpoint reachable by sent threads is dated; beyond them is estimated with pace; under 7 days of sends gives no estimate |
| Counts only (DoD 7) | funnel aggregate, snapshot schema | negative test: the serialized API payload and snapshot row contain none of `prospectId`, `threadId`, `domain`, `roleAddress`, `name` |
| Fixed read count | funnel aggregate | integration test with 5 and 500 threads asserts the same number of collection reads |
| Old snapshot rows stay readable | snapshot schema | test: a pre-plan row loads and renders with the new counts unavailable |
| Segments from stored facets only (decision 4) | funnel aggregate | integration test: missing prospect, missing stars and missing preview each count under `unknown` |
| Accessibility, WCAG 2.2 AA (DoD 8) | `campaign.tsx` | the route added to `dashboard/accessibility.test.ts`; a named manual record: keyboard walk, 200 percent zoom, 320px reflow, strip legend read by a screen reader |
| Page shows the required blocks (DoD 4) | `campaign.tsx` | render test on a fixture campaign asserting each block's heading and one value; manual read against the production campaign after deploy |

`pnpm run check` supports closure and is not the proof of any row.

## Operator decisions taken by default

Change any of these before execution starts; each is one line in the decision it belongs to.

1. The page is `/campagne`, outside the sidebar (decision 1). Alternative: make it the top of the Results view.
2. A reason is required on `reply-negative` and `lost` (decision 3). Alternative: optional everywhere.
3. Rates need a denominator of 20 (decision 5).
4. The pace window is 14 days (decision 6).

## Execution record (2026-10-10)

Commits on `main`: slice 0 `110f565c`, slice 1 `2b173309`, slice 2 `c992e093`, slice 3 `53b6a1d8`, slice 4 `566ddfd0`, slice 5 `65d74c62`, and `998635be` for what the full suite found (`/campagne` missing from the server's route prefixes, unused exports).

### Answers the slices owed

- **Slice 0, the `record-outcome` À traiter row.** Before the fix it cleared only when the prospect became `won`, `lost` or `opted-out`, the terminal statuses `deriveProspectWork` drops. A reply recorded as positive, not now, a call or a quote kept the row open for ever. It now clears as soon as an outcome is recorded (regression test in `packages/store/src/outreach-outcomes.test.ts`).
- **Slice 1, the `closed-other` row.** Production code closes a thread for three reasons, held in `OUTREACH_CLOSED_REASONS` and typed onto their writers. `operator-confirmed-send` is `merged` when the operator-confirmed touch is the first email, and `matured-silent` when only a follow-up went out elsewhere. `opted-out` and `prospect-deleted` are `matured-silent`. Any other reason stays `closed-other`: delivered, not matured, its own entry on the page. A thread with no first email is `prepared` whatever closed it.

### Departures from the text above, recorded in trade-off 129

1. `classifyOutreachMaturity(thread)` takes no `now`: the mapping reads state, reason, touches and outcome only.
2. Decision 6's formula counted touch 3 from touch 1. The follow-up scheduler counts it from touch 2, so the earliest maturity is the last touch sent plus the remaining spacing (29 days after a first email at the default spacing, not 25). The function is `earliestOutreachMaturityDate`.
3. Checkpoints are projected on the server (`reportOutreachCampaigns`) and sent as rows, because the dashboard reads no workspace package at runtime. `campaign-model.ts` turns them into display rows.
4. The page's `Réponses` is the `matured-replied` bucket (objections and `lost` included, split beside the count). The funnel's older `replied` is unchanged.
5. The maturity strip reuses the existing `CoverageBar`, so `DESIGN.md` gains no new pattern.
6. The outcome request carries a key made when the choice is made, scoped to the prospect in the store.

### Requirement-to-proof ledger

| Requirement | Proof (all passing 2026-10-10) |
| --- | --- |
| Outcome reaches thread and funnel | `packages/store/src/outreach-outcomes.test.ts`: records `won`, funnel returns `won: 1`; same key twice writes one row and one event |
| Backfill writes only missing pointers | same file: one thread already pointed, one not, one never recorded; dry run writes nothing; second run writes nothing |
| Maturity mapping is total | `packages/core/src/prospecting/outreach-maturity.test.ts`: every state, `Record` types that fail compilation on a new state or reason, one case per closing reason, unknown reason in `closed-other` |
| Delivered excludes bounced and merged | same file, and `packages/store/src/outreach-campaign-report.test.ts` (16 sent, 14 delivered) |
| Late reply changes the split, not the matured count | `outreach-maturity.test.ts` |
| Reason required, optional or refused | `packages/interface/src/routes/prospect-hub.test.ts`, "decline reason (plan 078)"; `prospect-hub-detail.test.tsx` for the control |
| Small-denominator rule | `packages/interface/src/dashboard/routes/campaign-model.test.ts` at 19 and 20 |
| Unavailable is not zero | `campaign-render.test.ts`, failed fetch: four tiles read `Indisponible` |
| Projection labels and floor | `outreach-maturity.test.ts` (`projectOutreachCheckpoints`); `campaign-render.test.ts` for the two wordings |
| Counts only | `outreach-campaign-report.test.ts`: API payload and stored snapshot carry no identifier key or value |
| Fixed read count | same file: the same four collection reads for 5 and 500 threads |
| Old snapshot rows stay readable | same file (row without `results` loads, checkpoint day comes from the first row that has them); `packages/cli/src/commands/outreach-funnel.test.ts` prints `n/a`, never zero |
| Segments from stored facets only | `outreach-campaign-report.test.ts`: missing prospect, facets and preview count under `unknown` |
| Accessibility, automated | `packages/interface/src/dashboard/accessibility.test.ts`, Campaign in FR and EN |
| Page shows the required blocks | `campaign-render.test.ts`, fixture typed against the store's report |

Browser check on the development build with the fixture campaign, 2026-10-10: no horizontal page scroll at 320 and 640 CSS pixels (the segment table scrolls inside its panel); the facet control takes focus by Tab, moves by arrow keys and selects by Space or Enter; the strip's four counts are written in its legend.

### Closure

Closure evidence: (2026-10-10) every row of the ledger above maps to a passing test; `pnpm run check` and the full unit suite (6,457 tests) passed before the push; production runs build `775c8406` and later.

- **Backfill.** `scripts/backfill-outreach-outcomes.mjs` on production: dry run found 79 threads without an outcome, 1 with a recorded outcome event; `--apply` wrote 1 row; a second dry run found 0 left.
- **Production read.** `/campagne` for `first-100-2026-09` after the backfill: 77 delivered, 1 matured, 1 reply (a refusal after the first follow-up, reason not given since it predates this plan), 0 sales, 71 in sequence, 5 in the reply window, 1 merged; checkpoints estimated for 13 November, 22 December and 31 January. The operator confirmed the numbers match the campaign.
- **Manual acceptance record, operator, 2026-10-10, production page:** the decline-reason control reveals the reason list and records nothing until a reason is chosen; nothing is cut off and the page does not scroll sideways at 200 percent zoom; a screen reader reads the strip legend and the tables correctly. Keyboard walk and 320 CSS pixel reflow: the browser check recorded above.
- **Touch 3 spacing, operator ruling:** the scheduler is right (touch 3 is due 11 days after touch 2). The brief, `docs/rules/outreach-rules.md` and two code comments were corrected; nothing sent changes.
- **Decision 1 revisited, operator decision:** the page is in the sidebar's Campagne group as `Résultats de campagne` / `Campaign results`, which is also its title. The two entry links stay. `docs/product/dashboard-ia.md` and trade-off 129 record it.
