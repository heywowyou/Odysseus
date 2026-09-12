# Plan 042: Make the prospect hub the one workspace, with tabbed stages and the audit inside it

> **Executor instructions**: Follow this plan slice by slice. Run every
> verification command and confirm the expected result before moving to the
> next slice. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When a slice lands, update this plan's status row
> in `plans/README.md`.

## Status

- **Priority**: P2
- **Effort**: L overall; S for slice 1, M for slices 2 and 3, S for slice 4
- **Risk**: MEDIUM. No locked contract, no schema change, no legal copy. The
  real risk is behavioural: the one-time preview token lives only in page
  memory, and a careless tab implementation that remounts the page would void
  it and break the publish-then-draft flow the IA calls a hard constraint.
- **Depends on**: 040 (the hub, the audit-page stepper, the vocabulary pass),
  041 Part B (the selection verdict the hub already renders)
- **Category**: dashboard, information architecture
- **Planned at**: commit `f87f7b0`, 2026-09-12
- **Issue**: none; operator-requested 2026-09-12 after using the deployed
  dashboard

## Why this matters

Plan 040 built the hotel hub and cleaned the audit page separately. The result
is two good pages that each send you to the other: the hub's Audit section
links out to `/audits/:auditId`, and the audit page links back with "Aperçu
géré depuis la fiche". The operator, using it for real, asked the obvious
question: why are there two pages at all, and why does the audit page open with
a five-step production chain that has nothing to do with prospecting?

Two separate problems sit underneath that.

**The audit page shows the paid production line to everyone.**
`audit-detail.tsx` renders `AuditReportStepper` unconditionally. The five steps
(prepare, write, choose the version, produce the PDFs, approve for delivery)
are how a EUR 1,600 deliverable is built and locked, per trade-off 44. They are
meaningless on a prospecting audit, which exists only to feed the free preview
scorecard. Every prospecting audit therefore opens on a print shop for a book
nobody ordered. That is the single biggest source of the "full complex page"
feeling the operator reported.

**The hub is one long page.** Six stacked sections with a jump-scroll strip.
The operator likes the strip's stage-by-stage reading ("Fiche done, Contrôle
rapide done, Audit done, Aperçu in progress") and wants it to swap content
rather than scroll, especially once the audit's findings move in.

## Binding decisions

All six were taken by the operator on 2026-09-12 through the interactive
question mechanism, after the constraints below were put to them.

1. **`/audits/:auditId` is kept, the hub becomes primary.** The hub is where
   the operator works. The audit page stays a real page rendering the same
   components, because two audits can never reach a hub: an audit started from
   `/scans/new` carries no `outreach.candidateId`, and a paying client who was
   never a prospect has no hub at all. Deep links and bookmarks keep working.
2. **The Audit tab opens on the latest audit and offers a picker.** A hotel
   accumulates audits over its life (quick check, prospecting audit, paid
   audit after the sale, later re-runs). `getOutreachAuditStatus`
   (`packages/store/src/outreach-scans.ts:216`) returns only the newest one
   today; it gains a list.
3. **Tabs share one URL.** `/prospects/:candidateId` stays a single URL and
   the active tab is component state. Rejected: a URL per tab, which would be
   bookmarkable but risks remounting the page and voiding the preview token.
4. **The paid report chain becomes its own tab, hidden until sold.**
5. **"Sold" is derived from the recorded outcome `won`, plus a manual
   reveal.** `won` already exists in `OUTREACH_OUTCOMES`
   (`packages/core/src/prospecting/outreach-outcome.ts`). No new stored state
   and no new concept: the tab appears once the outcome is recorded, and a
   small "produire un rapport quand même" link reveals it early for a direct
   client or a demo. The reveal is view state only; it stores nothing.
6. **Seven tabs, one per pipeline stage, in pipeline order.** Fiche, Contrôle
   rapide, Audit, Rapport client, Aperçu, Emails, Résultat. In practice six
   are visible, because Rapport client is hidden during prospecting.

### Two interpretations the executor must not re-open silently

- **One control, not two.** Decision 6's option said the tab bar "mirrors the
  pipeline strip"; the adjacent option said the strip simply becomes the tab
  bar. Rendering both a strip and a tab bar would put two near-identical
  controls three centimetres apart, which is the duplication plan 040 spent a
  slice removing. This plan reads the two as one intent: **the existing
  pipeline strip becomes the tab bar**, keeping its per-stage state and date,
  and gaining tab semantics. If the operator meant a second, distinct control,
  say so before slice 1 lands.
- **Rapport client sits in the pipeline strip even though it is not a
  campaign stage.** It is a seventh tab in position four, between Audit and
  Aperçu, because that is where it falls in time once a hotel buys. It shows
  no state dot while hidden.

## What this plan does not do

- No change to `packages/core` contracts, the findings model, severity
  mapping, or the LLM schema.
- No change to what an audit measures, what a report contains, or any legal or
  client-facing copy.
- No new dashboard page and no new package. Route count is unchanged.
- No removal of `/audits` or `/audits/:auditId`, per binding decision 1.
- No server behaviour change beyond two additive read fields (slices 2 and 4).

## Slice 1: The pipeline strip becomes a tab bar

**Goal**: the hub renders one stage at a time, switched by the strip, with no
content change to any section and no page remount.

### Steps

1. Add `hubTabs` to `routes/hub-model.ts`: a pure function over the existing
   `pipelineSteps` output plus the sold signal, returning the ordered visible
   tabs. Keep it pure and unit-tested, the same split the file already uses.
2. Build the tab bar in `prospect-detail.tsx` by extending the existing
   `PipelineStrip` into a real tab widget: `role="tablist"` on the container,
   `role="tab"` with `aria-selected` and `aria-controls` on each button,
   `role="tabpanel"` with `aria-labelledby` on the rendered section, and
   left/right/Home/End arrow-key roving focus.
   **Do not add a tab dependency.** `@radix-ui/react-tabs` is not in
   `packages/interface/package.json` and the charter's scope discipline says
   to prefer existing dependencies and to ask before adding one. The hand-
   rolled widget is roughly forty lines. If the executor believes a dependency
   is genuinely needed, stop and ask; do not add it.
3. Render only the active tab's section. Keep `HUB_STEP_ANCHORS` as the DOM
   ids of the panels so nothing else that references them breaks.
4. Replace every `scrollToAnchor(...)` call in the primary-action handlers
   with a tab switch to the same stage. The primary action must still land the
   operator on the section that does the work.
5. Hold the active tab in state **inside `ProspectDetailPage`**, above the
   section components, next to `publishedLink`. The page component must not
   remount on a tab change.

### Verification

- `pnpm --filter @odysseus/interface test` green, including
  `accessibility.test.ts` (axe must stay at zero violations on the hub).
- New unit test in `hub-model.test.ts`: `hubTabs` hides Rapport client when no
  `won` outcome is recorded and shows it when one is.
- New render test in `prospect-detail.test.ts`: publish a preview, switch to
  another tab, switch back, and assert the one-time link is still shown. This
  is the regression test for the hard constraint; it must exist before slice 1
  is called done.
- `pnpm run format` then `pnpm run check`.

### STOP conditions

- The preview-token test cannot be made to pass without remounting. Stop and
  report: the tab design is wrong, not the test.
- axe reports any violation on the hub.

## Slice 2: The Audit tab shows the audit, not a link to it

**Goal**: the findings and the audit's own state render inside the hub, with a
picker when the hotel has more than one audit.

### Steps

1. Server, additive only. `getOutreachAuditStatus` gains a sibling that
   returns every audit for the candidate (auditId, startedAt, job type),
   newest first, and `GET /api/prospects/:candidateId` exposes it as
   `outreachAudits`. Keep the existing singular `outreachAudit` field so
   nothing that reads it breaks.
2. `hub-audit-section.tsx` renders, for the selected audit: the existing
   severity badges and stage line, then `PublisherIdentificationAlert`,
   `FailureCard`, and `FindingsCard` from `audit-findings-section.tsx` and
   `audit-reports-section.tsx`. **Import those components; do not
   reimplement them.** They are already extracted, which is why this slice is
   small.
3. Add the picker: a `SegmentedControl` (already in
   `components/ui/segmented.tsx`) or a select when there are more than three,
   labelled by date and audit kind. Default to the newest. Selection is
   component state.
4. Keep "Ouvrir l'audit" as a secondary link to `/audits/:auditId`, now
   described as the standalone view rather than the place the work happens.

### Verification

- The hub renders the same findings the audit page does for the same audit;
  compare against `audit-detail-render.test.ts`'s expectations.
- Server test: a candidate with two audits returns both, newest first; a
  candidate with none returns an empty list, not null.
- axe clean on the hub with findings rendered and a finding expanded.
- `pnpm run format` then `pnpm run check`.

### STOP conditions

- The findings list makes the hub unusably slow on a real audit (a full audit
  can carry hundreds of findings). If so, stop and report rather than
  inventing a truncation rule: what to show and what to defer is an operator
  decision, not an implementation detail.

## Slice 3: The Rapport client tab

**Goal**: the five-step chain moves out of the prospecting path and appears
only when it means something.

### Steps

1. Expose the sold signal to the hub. `GET /api/prospects/:candidateId`
   already composes `outcomes`; derive `isSold` in the client from an outcome
   of `won` rather than adding a server field. Put the derivation in
   `hub-model.ts` as a pure function so it is unit-tested.
2. New `hub-report-section.tsx` rendering `AuditReportStepper` for the audit
   selected in the Audit tab, with the same `onBusy` and `refresh` wiring the
   audit page uses.
3. When not sold, the tab is absent and a one-line link under the Audit tab
   reveals it ("produire un rapport quand même"). The reveal sets view state
   only and resets on reload.
4. **`/audits/:auditId` is unchanged**: the stepper stays always visible
   there. A standalone audit has no outcome to read, so hiding it would make
   the paid chain unreachable for a direct client. Add a comment saying why,
   so a later reader does not "fix" the inconsistency.
5. Add the FR and EN strings; `strings-parity.test.ts` enforces both.

### Verification

- Unit test: the sold predicate is true for `won` only, false for `quoted`,
  `reply-positive`, and an empty outcome list.
- Render test: the tab is absent with no `won` outcome, present after one, and
  present after the manual reveal.
- axe clean with the Rapport client tab active.
- `pnpm run format` then `pnpm run check`.

### STOP conditions

- Moving the stepper changes any report-preparation request, response, or
  ordering. It must be a pure relocation of an existing component.

## Slice 4: The audits list points at the hotel

**Goal**: close the gap the approved IA already named and never landed.

`docs/product/dashboard-ia.md`'s page destiny table says `/audits` becomes
"Audits list; hotel name shown for hotel audits". It was not implemented:
`routes/audits.tsx` shows no business name and links only to the audit.
`ScanSummary` carries no name field.

### Steps

1. `GET /api/scans` adds the business name for jobs carrying an outreach
   candidate. Additive field, joined the same way
   `audits.outreach-preview` already resolves a candidate's row.
2. The audits list shows the name next to the site, linking to
   `/prospects/:candidateId`. The row itself keeps opening the audit.
3. Update the IA doc's destiny table row to say it landed, with the date.

### Verification

- Server test: a job with a candidate carries the name; one without carries
  none and the row still renders.
- axe clean on `/audits`.
- `pnpm run format` then `pnpm run check`.

## STOP conditions (whole plan)

Stop and report if any of these occur:

1. A change appears necessary to a locked contract
   (`packages/core/src/types/findings.ts`,
   `packages/core/src/normalize/severity.ts`,
   `packages/core/src/types/llm-output.ts`).
2. A tab implementation cannot preserve the one-time preview token across a
   tab switch.
3. Any slice requires a new npm dependency.
4. Any slice requires removing or renaming a server route, rather than adding
   a field.
5. The sold signal turns out to need a new stored field after all, contrary to
   binding decision 5.

## Verification for the whole plan

- `pnpm run check` clean.
- `pnpm --filter @odysseus/interface test` green.
- Manual operator pass on the deployed dashboard, in both languages: open a
  hotel with a finished prospecting audit, move through all six visible tabs,
  publish a preview, switch tabs, come back, and create the first email. The
  draft must be accepted. This is the acceptance gate; the automated test in
  slice 1 covers the mechanism, but the operator reads the flow.
