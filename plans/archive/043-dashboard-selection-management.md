# Plan 043: the dashboard manages the wave roster, and shows the cohort's record

> **Executor instructions**: Follow this plan slice by slice. Run every
> verification command and confirm the expected result before moving to the
> next slice. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When a slice lands, update this plan's status row
> in `plans/README.md`.

## Status

- **Priority**: P2
- **Effort**: M overall; S for slice 1, M for slices 2 and 3
- **Risk**: LOW-MEDIUM. No gate semantics change, no new authorization
  concept, no locked contract. The risks are provenance honesty (the roster
  records *who* decided, and the dashboard has no identity) and route
  collision (`GET /api/selection` must not be shadowed by
  `/api/prospects/:candidateId`).
- **Depends on**: 041 Part B (the roster store helpers, the gate's second
  authorization source, the selection projection the dashboard already
  renders), 042 (the tabbed hub)
- **Category**: dashboard, prospecting
- **Planned at**: commit `0ba5dc8`, 2026-09-12
- **Issue**: none; operator-requested 2026-09-12 after the plan 042 deploy,
  on learning the wave roster is CLI-only ("ok so still can't do all of
  this from the dashboard?")

## Why this matters

Plan 041 Part B gave the dashboard a read-only projection of the selection:
the wave column, the selection filter, the count line, and the hub's
factual verdict beside a scan refusal. The operator can *see* who is in and
why, but cannot *act*: adding a hotel to the wave roster, or taking one
out, is a CLI errand (`prospect wave add/remove`). The operator asked for
the dashboard to carry the mutations.

One operator pick was corrected mid-decision, and the correction is
load-bearing: cohort "approval" is not an operator action on a cohort. It
is a reviewed `approved` flag on the scoring configuration itself
(`HOTEL_OUTREACH_SCORE_CONFIGS`, packages/core, weights versioned and never
edited in place; both v1 and v2 are approved). A cohort document is
insert-only and its `approved` field is immutable post-creation. The
operator chose, with those facts in hand, the scoped option: the dashboard
gets the real mutations (wave roster add/remove) and a read-only view of
the cohort's record; it does not get an approval button, which would invent
a second approval mechanism the reviewed-configuration discipline forbids.

## Binding decisions

1. **Scope: roster UI plus cohort view.** The dashboard gains wave roster
   add/remove on the hub and on the prospects list, plus a read-only
   selection overview (the cohort facts and the roster entries). No cohort
   approval control, no new stored approval concept. Operator pick
   2026-09-12 through the interactive question mechanism, asked twice: the
   first answer ("full selection management") was taken under a wrong
   premise about cohort approval and was re-asked with the corrected facts.
2. **The dashboard writes through the same store helpers the CLI uses.**
   `addWaveRosterEntry` / `revokeWaveRosterEntry` are the only write path;
   no parallel mutation helper, no schema change. Their typed refusals
   (`candidate-unknown`, `domain-unknown`, `no-own-domain`, `no-cohort`,
   `already-on-roster`) surface as operator sentences, not raw codes.
3. **The actor recorded on dashboard-made roster decisions is
   `'dashboard'`**, the exact precedent of `REVIEW_ACTOR` on the review
   route: the console is a single-operator private page with one shared
   password, so the record names the surface, and `prospect wave add
   --actor` remains the CLI path for attributed decisions. The entries
   remain revocable, never deleted, and the roster never rewrites the
   cohort's record.
4. **The scoring run stays CLI.** `score run` / `score select` are batch
   operations over the whole population; the dashboard reads their output,
   it does not trigger them.
5. **Suppression and every other gate check keep winning.** A roster entry
   authorizes nothing the gate would still refuse; the hub's primary scan
   flow and `planOutreachFullScan` are untouched.

## What this plan does not do

- No change to `planOutreachFullScan`, the gate's refusal set, or any
  authorization semantics.
- No cohort approval, no mutation of `hotel_score_cohorts` (insert-only
  stays insert-only), no scoring-run trigger from the dashboard.
- No new dashboard page and no new package; the overview renders inside
  the prospects list page.
- No removal or renaming of a server route; the two wave mutations and the
  selection overview are additive routes.
- No change to packages/core contracts.

## Slice 1: server routes

**Landed 2026-09-12 by ZCode.** `listRecentScoreCohorts` (scores.ts, capped
lean projection, exported through the barrel), `POST
/api/prospects/:candidateId/wave`, `POST
/api/prospects/:candidateId/wave/remove` (both validating the wave name the
same way, actor `dashboard`, typed refusals as 200 bodies), and `GET
/api/selection` composing cohorts and the active roster. One deviation
discovered while typing the route: `AddWaveRosterEntryInput` requires
`scoringVersion`, so the route passes `CURRENT_SCORING_VERSION` exactly as
the CLI does - the decision is recorded against the current configuration,
not left implicit. Route tests cover add/remove/refusals/validation and
the overview composition (57 in the suite).

**Goal**: the dashboard can read the selection record and write the roster
through additive routes that behave exactly like the CLI.

### Steps

1. Store, read side: `listRecentScoreCohorts(connection, limit)` in
   `packages/store/src/scores.ts` - the newest cohort per run, newest
   first, the same lean projection fields the selection projection already
   selects (cohortId, scoringVersion, approved, computedAt, populationSize,
   selectedCount, abilityCutoff, brokennessCutoff), capped (default 5).
   Exported through the store barrel.
2. Routes in `packages/interface/src/routes/prospects.ts`, following the
   `/review` route's established pattern (`isPlausibleCandidateId`,
   `readJsonBodyOrRespond`, typed refusal as 200 body, `sendError` 400 on
   malformed bodies, store helpers only):
   - `POST /api/prospects/:candidateId/wave` body `{ wave: string }`:
     validates the wave name (non-empty, bounded length, no control
     characters), calls `addWaveRosterEntry` with `actor: 'dashboard'`
     (module constant with the `REVIEW_ACTOR` comment style), no rank.
     Answers `{ added: true, wave, candidateId, domain }` or
     `{ added: false, refusal }`.
   - `POST /api/prospects/:candidateId/wave/remove` body `{ wave: string }`:
     `revokeWaveRosterEntry`, same actor rule. Answers
     `{ revoked: true, wave, candidateId }` or `{ revoked: false, refusal }`.
   - `GET /api/selection`: `{ cohorts: [...], roster: [...] }` - cohorts
     from `listRecentScoreCohorts`, roster from the existing
     `listWaveRoster` (active only), each roster row carrying wave, domain,
     candidateId, decidedAt, actor, rank when stored. Registered BEFORE the
     `/api/prospects/:candidateId` param route can shadow it (a separate
     path prefix, so no collision by construction).
3. Route tests in `prospects.test.ts` (mock store): add success, each
   refusal shape, remove, wave-name validation 400s, overview shape; and
   in `scans.test.ts`-style new file or the same suite, the
   `GET /api/selection` composition.

### Verification

- Narrowest suites green: prospects route tests, new overview tests.
- `pnpm run format`, `pnpm run lint`, typecheck clean.

### STOP conditions

- Any need to touch `planOutreachFullScan`, the schema, or the cohort
  write path. Stop and report.

## Slice 2: the hub's wave control

**Landed 2026-09-12 by ZCode.** Shared `WaveDialog`
(dashboard/routes/wave-dialog.tsx) with the wave-name input prefilled
wave-1, `mutateWaveRoster` and `waveRefusalSentence` helpers so the hub and
the list share one request path and one refusal copy table. The hub shows
"Ajouter a une vague" beside a `not-selected` or `cohort-not-approved`
refusal and nothing for the uncurable refusals, and shows the roster line
(wave, date, actor) with "Retirer de la vague" for a wave-roster-sourced
hotel. To carry the line's facts, the selection projection and verdict now
include the roster entry's wave/decidedAt/actor (additive fields on
SelectionMember/SelectionVerdict; store operator-view suites 58/58 green
with the test Mongo up). Hub render tests cover offer/refuse/remove.

**Goal**: a hotel that is out of the selection can be added to a wave from
its hub; a hotel whose membership is a roster entry can be removed.

### Steps

1. Shared `WaveDialog` component (new file, e.g.
   `dashboard/routes/wave-dialog.tsx`): a small dialog with a wave-name
   input prefilled `wave-1`, a confirm and a cancel, built on the existing
   `Dialog` primitives. Both the hub and the list use it, so the two
   surfaces cannot drift.
2. Hub wiring in `prospect-detail.tsx`:
   - When the scan refusal is `not-selected` or `cohort-not-approved`
     (the two refusals a roster entry can cure), the refusal note gains an
     "Ajouter a la vague" button opening the dialog; on success, toast +
     `refresh()` (the gate's plan recomputes and the primary action
     becomes the scan start).
   - When `data.selectionVerdict?.source === 'wave-roster'`, the Fiche
     section gains a wave line ("Entre via la vague wave-1, decidee le
     ...") with a "Retirer de la vague" button; on success, toast +
     `refresh()`.
   - Typed refusals from the store map to FR/EN sentences in the toast;
     unknown refusals fall back to a generic action-error sentence.
3. FR/EN strings under `hub.wave` and `prospects.selectionOverview`
   (slice 3), structural parity via `DashboardStrings`.

### Verification

- Render tests: the add control appears for `not-selected` and
  `cohort-not-approved` and not for `suppressed`; the dialog calls the API
  with the entered wave name; success refreshes; the remove control
  appears only for a `wave-roster` source; a typed refusal shows its
  sentence.
- axe clean on the hub with the dialog open and closed.
- `pnpm run format` then `pnpm run check`.

### STOP conditions

- Any temptation to render an add control for refusals a roster entry
  cannot cure (`suppressed`, `no-own-domain`, `not-qualified`,
  `qualification-not-current`, `already-in-flight`, `candidate-unknown`):
  the button must never promise something the gate will still refuse.

## Slice 3: the list's roster control and the selection overview

**Landed 2026-09-12 by ZCode.** The wave column gains a "+ Vague" button on
out-of-selection rows only (stopPropagation, shared dialog, success toasts
and refreshes the poll), and the "Voir la selection" disclosure renders the
two record tables read-only. Writing the populated-list axe coverage
exposed a pre-existing defect the empty-state axe tests could never see:
the list's actions column header was an empty table header. It now carries
screen-reader text (`columns.actions`), and the overview's section titles
are h2 to keep the page's heading order. List tests cover the row button,
the posted wave, the overview render, and its read-only-ness; axe runs
clean on the list with the overview open.

**Goal**: the operator can add a row from the list without opening each
hotel, and can read the whole selection record in one place.

### Steps

1. Row control in the wave column cell of `prospects.tsx`: when
   `!row.inSelection`, a small "+ Vague" button (stopPropagation, like the
   name link) opening the shared `WaveDialog` for that row; success toasts
   and refreshes the list. Rows already in selection grow no control.
2. Selection overview: a disclosure above the table, beside the count
   line, labelled "Selection" - fetches `GET /api/selection` when first
   opened. Shows, read-only: the recent cohorts (scoring version,
   selected vs calibration, computed date, population, selected count,
   cutoffs) and the active roster entries (wave, hotel domain, actor,
   decision date, rank when stored). Nothing on this panel mutates.
3. FR/EN strings; parity structural.

### Verification

- Render tests: the row control appears only for out-of-selection rows and
  calls the API with the row's candidate id; the overview disclosure
  renders cohort facts and roster entries from a stubbed response and is
  empty-state safe when both are empty.
- axe clean on the list with the overview open and a dialog open.
- Full: `pnpm exec vitest run packages/interface`, `pnpm run check`.

### STOP conditions

- The overview growing any write affordance. It is the formula's record
  and the roster's ledger, not a control panel.

## Whole-plan landing state (2026-09-12)

- Committed on main; no operator push/deploy order for this plan yet.
- No STOP condition occurred: `planOutreachFullScan` untouched, no cohort
  mutation, no new approval concept, roster entries still revocable-only.
- `pnpm run check` fully clean; full unit suite 4019 passed with the same
  three pre-existing failures documented before this session; interface
  suite 1313 passed plus the pre-existing red; store operator-view suites
  58/58 with Mongo up.
- The manual operator pass (add from hub, add from list, remove, read the
  overview on the deployed dashboard) is the acceptance gate, after the
  operator orders a deploy.

## Whole-plan verification

- `pnpm run check` clean; `pnpm exec vitest run packages/interface` green
  except the pre-existing `app-routes.test.ts` red.
- Store suite unaffected (no store mutation added; the read helper's tests
  ride the Mongo suite if the container is up, else skip cleanly).
- Manual operator pass on the deployed dashboard: add a hotel from its
  hub, see the scan button appear; add one from the list; remove one; read
  the overview. This is the acceptance gate.

## Whole-plan STOP conditions

1. Any change to a locked contract or to `planOutreachFullScan`.
2. Any new stored approval concept or mutation of `hotel_score_cohorts`.
3. Any route removal or renaming.
4. The roster's revocable-not-deletable discipline broken (a delete).
