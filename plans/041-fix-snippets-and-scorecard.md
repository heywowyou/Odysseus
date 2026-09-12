# Plan 041: Deterministic fix snippets and a visual scorecard summary (Part A); the prospects table shows what the operator can act on (Part B)

> **Executor instructions**: Follow this plan slice by slice. Run every
> verification command and confirm the expected result before moving to the
> next slice. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When a slice lands, update this plan's status row
> in `plans/README.md`.

## Status

- **Priority**: P3 for Part A; P2 for Part B
- **Effort**: TBD, set at the end of Slice 1
- **Risk**: LOW at Slice 1 (research and a written proposal only, no code
  change); revisit once Slice 1 picks a shape
- **Depends on**: 039 (design tokens, if the scorecard renders inside the
  report or preview) and possibly 040 (dashboard IA, if it renders there
  instead); Slice 1 resolves which
- **Category**: report, findings, sales asset
- **Planned at**: commit `dafc5ba`, 2026-09-12
- **Issue**: none; operator-requested during a competitive-positioning
  conversation 2026-09-11/12
- **Part B added 2026-09-12**, operator-requested after a live walkthrough
  of `/prospects` on the VPS deployment: the table opens on the whole
  catalogue, its one prominent signal (the green "Qualified" badge) is a
  stage-2 outcome that reads as actionability, the selection of record is
  visible nowhere in the dashboard, and the runbook's wave-1 extension to 10
  domains is not enforced by the scan gate. Part B's slices (B1 through B3)
  are independent of Part A's slice 1 and may start without it, subject to
  their own gates below.

## Why this matters

Comparing Odysseus against the existing accessibility/SEO audit tooling
market surfaced two feature ideas the operator wants to pursue:

1. **Deterministic fix snippets.** Today the report gives remediation
   copy per rule ID (trade-off 71: every reachable rule carries reviewed
   FR/EN remediation prose). For structural findings whose fix is a fixed
   shape for a given rule ID (`missing lang attribute`, `missing canonical`,
   malformed JSON-LD, wrong heading order, and similar), a templated
   code snippet next to the prose would close a real gap against tools that
   already show a copy-paste fix, without violating non-negotiable rule 1:
   the snippet is derived from the rule ID and the finding's normalized
   evidence, never generated or invented by the model.
2. **A visual scorecard / letter-grade summary.** A single at-a-glance
   score presentation, for the sales motion and the top of the report,
   distinct from the existing detailed findings breakdown. Presentation
   work primarily; where it draws its underlying numbers from (existing
   severity counts, `computeBrokennessScore`, something else) is a Slice 1
   question, not a Slice 1 decision.

Neither idea has been designed yet. This plan exists to hold the intent so
it is not lost, and to make the first executor's job explicit: ask the open
questions and brainstorm the shape, in writing, before any binding decision
locks a schema, a rendering surface, or a locked-contract change.

## Slice 1: Questions and brainstorm (do this first, nothing else)

Produce a short written brainstorm document (`docs/product/fix-snippets-and-scorecard-brainstorm.md`)
covering both features. Do not write implementation code in this slice. At
minimum, work through:

**Fix snippets**
- Which reachable rule IDs (axe, Lighthouse, and the milestone 8 custom
  checks) actually have a fixed-shape fix versus one that depends on the
  page's own content and cannot be templated safely? Produce the split,
  not a guess.
- Where does a snippet live: as a new field on the existing remediation-copy
  source, a parallel table keyed by rule ID, or something else? Note this
  touches reviewed FR/EN content per rule ID (trade-off 71's mechanism), not
  a locked contract, but confirm that before proposing a shape.
- Does a snippet ever need the finding's own evidence (a selector, an
  attribute value) interpolated in, or is it always generic per rule ID? If
  evidence is interpolated, how is that done deterministically and safely
  (never through the LLM, per non-negotiable rule 1 and rule 4 - the model
  never receives or produces this).
- Where does it render: the PDF report, the dashboard, both?

**Scorecard**
- What does the score aggregate: existing severity-ordered finding counts,
  `computeBrokennessScore` (trade-off 23, not currently wired into the
  pipeline), or a new deterministic computation? Note `computeBrokennessScore`
  and the cost-gate scores are documented as not to be changed in place
  (trade-off 38) - reusing a number is fine, redefining one is not.
- Where does it render: report cover, outreach preview, dashboard, the
  public site as a sales asset, some combination? Each surface has its own
  locked contract or contract-adjacent rules (trade-off 42 for the preview,
  trade-off 62 for report preparation) that a placement choice must respect.
- Is a letter grade ever shown to the client, or only used internally for
  triage/sales framing? This interacts with non-negotiable rule 6 (never
  overstate legal exposure) only if the grade is ever presented as implying
  compliance status rather than a technical/business-impact summary - flag
  this explicitly rather than assuming either answer.

List every open question found beyond these, with a recommendation and the
main tradeoff for each, and stop. Bring the document to the operator for a
direction pick before Slice 2 is written. Slice 2 onward, including binding
decisions, effort/risk sizing, and STOP conditions, are written after that
pick, not before.

## Part B: the prospects table shows what the operator can act on

> Added 2026-09-12, operator-requested after walking `/prospects` on the VPS
> deployment. Part B is independent of Part A: it may start without waiting
> for Part A's slice 1, subject to its own gates below.

### Why this matters (recorded from the live walkthrough)

- The list opens on the whole catalogue. The runbook's decision log counts
  9,765 eligible rows at ingest; at 25 rows per page that is hundreds of
  pages, and nearly every row is a hotel no action can touch in this wave.
- The one prominent signal per row, the green "Qualified" badge, is the
  qualification pass outcome (funnel stage 2 of 7). It reads as "good to
  go", so green rows that refuse scans read like a defect.
- The refusal names a thing the dashboard never shows. No page lists the
  selection of record; it exists only in the `hotel_score_cohorts`
  document, the CLI (`prospect score select --dry-run`), and
  `docs/product/first-100-rollout-runbook.md`. The operator cannot answer
  "which hotels can I work" or "why not this one" from the UI.
- The decision of record and the enforcement of record have drifted. The
  runbook records the operator extending wave 1 to 10 named domains with
  scan permission granted 2026-09-08, but ranks 7 to 10 hold no cohort
  membership (the cohort document stores selected and calibration rows
  only, not every ranked row), so `planOutreachFullScan` refuses them with
  the same `not-selected` reason as rank 11 and beyond, and nothing in the
  UI distinguishes the two cases.

### Design direction

Three rules, in dependency order:

1. **Project the gate, never restate it.** The scan gate stays the single
   authorization (`planOutreachFullScan`, fail-closed, typed refusals). The
   lists get a read-only projection of what the gate already reads:
   membership in the approved cohorts' selected sets, plus the explanatory
   facts the cohort document already stores (rank for members, ability and
   brokenness cutoffs for everyone scored). The projection must match the
   gate's per-candidate semantics exactly.

   **Corrected 2026-09-12 against the implementation.** The gate does not
   read "the union of selected members across approved cohorts": it reads,
   per candidate, the *newest* cohort that names that candidate `selected`
   (any scoring version), and authorizes only if that one cohort is
   approved - a candidate selected in an approved older cohort and also
   selected in a newer unapproved one is refused, not authorized, because
   the newer cohort is the one that answers for it. The projection
   (`getSelectionProjection` in
   `packages/store/src/operator-views/selection-projection.ts`) walks
   cohorts newest-first and applies this same first-cohort-wins rule per
   candidate, so it can never show a hotel as "in selection" that the gate
   would refuse. Slice B2's wave roster (landed first, see below) is then
   consulted as a second, purely additive source: it authorizes a
   candidate no cohort authorizes, and never overrides a cohort that does.
2. **The list opens on the actionable set.** The dashboard's default
   request for `/prospects` asks for the selection filter; the full
   catalogue stays one click away. The API default is unchanged: `GET
   /api/prospects` with no params keeps returning the whole catalogue, so
   no consumer's behavior changes; the default is a dashboard query
   concern only.
3. **A wave is a record, not prose.** Either the runbook's extension to
   ranks 7 to 10 becomes a stored, provenance-carrying roster the gate
   reads, or the runbook decision is amended to say those four stay outside
   wave-1 enforcement. That choice is the operator's (slice B2 gate).

### Slice B1: read-only selection projection (no authorization change)

**Landed 2026-09-12 by Claude Code**, after slice B2 (see the corrected
design-direction note above and B2's own landed note). Store:
`getSelectionProjection`/`getSelectionVerdict` in
`packages/store/src/operator-views/selection-projection.ts`.
`listOperatorProspects` gained `inSelection`/`selectionSource`/
`selectionRank` per row, a page-level `selection` (the newest approved
cohort's facts) and `selectedCount`, and a page-level `catalogueTotal` (the
whole catalogue's size at this resolution generation, independent of every
filter - added beyond the original spec so the count line's "M au
catalogue" figure is not silently equal to the filtered `total` once the
selection filter is applied) plus an `inSelection` list option. `GET
/api/prospects/:candidateId` gained `selectionVerdict`. The dashboard list
(`prospects.tsx`) defaults to the selection filter (`createEmptyFilters`),
adds the wave column and the "Sélection"/"Tout le catalogue" toggle, and
shows the count line. The hub (`prospect-detail.tsx` via
`selectionVerdictSentence` in `hub-model.ts`) shows the factual cutoff
comparison or the not-scored fact beside a `not-selected` refusal. FR/EN
strings added under `prospects.selectionFilter`/`selectionValues`/
`selectionCountLine` and `hub.selectionVerdict`; parity is structural
(`DashboardStrings`). No URL-param persistence was added for this or any
other list filter: the page has none today, and adding one only for
selection would be inconsistent with every other filter on it - the "keeps
bookmarks working" mitigation in Part B shortcomings therefore does not
apply yet.

- Store: one read helper over `hotel_score_cohorts` returning the union of
  selected members across approved cohorts for the current scoring version
  (candidateId and rank) plus the newest cohort's cohortId, computedAt,
  populationSize, abilityCutoff, brokennessCutoff. One indexed query per
  request; the members array is already in the document, and the page's 25
  candidate ids need only a set intersection in memory. A selection filter
  reuses the same set: the catalogue query becomes `candidateId $in set`,
  which the unique candidate index serves.
- API, additive only: `GET /api/prospects` rows gain `inSelection` (a pure
  set fact, so suppression never flips it) and the page gains `selection`
  (cohortId, computedAt, selectedCount, cutoffs, null when no approved
  cohort exists). `GET /api/prospects/:id` gains a `selectionVerdict`
  sibling of `outreachScan`: membership, rank when one is stored, and the
  hotel's score totals against the cutoffs.
- List UI: a wave column with two states, "Dans la sélection" with the
  rank, "Hors sélection"; a "Sélection" filter; the dashboard's default
  query selects it, with a visible count line ("6 dans la sélection, N
  scorés, M au catalogue") so the catalogue's size is stated, not
  discovered by paging.
- Hub UI: the scan refusal card and the Contrôle rapide section carry the
  verdict with its why: rank for members; for scored non-members the
  factual cutoff comparison ("score 58.4, seuil de sélection 64.1, cohorte
  du 2026-09-08"); for unscored hotels the funnel-stage fact ("pas encore
  scoré").
- i18n FR and EN from the start; axe WCAG 2.2 AA on the changed surfaces;
  FR/EN parity tests; the narrowest suites then `pnpm run check`.
- Effort M. The gate's semantics do not move in this slice.

### Slice B2: the wave roster decision (operator gate, then implement)

**Landed 2026-09-12 by Claude Code.** Operator picked option 1 (record the
roster) through the interactive question mechanism, asked twice: the first,
technical phrasing could not be decided from and was replaced with a plain
analogy ("a guest list of 6, you approved 10, the 4 extra names were never
written on the card"). Implemented before slice B1, deliberately: B1's
projection reads the gate's final semantics rather than being rebuilt once
this landed. `packages/store/src/schemas/wave-roster.schema.ts` and
`wave-roster.ts` add the `hotel_wave_roster` collection (one active entry per
hotel per wave, revoked not deleted, no TTL). `outreach-scans.ts`'s
`planOutreachFullScan` now checks cohort membership first, then the roster,
and returns `authorizedBy: 'cohort' | 'wave-roster'` on a successful plan;
the persisted provenance (`AuditOutreachContext.authorizedBy` in
`@odysseus/core`, `JobOptionsSnapshot.outreachAuthorizedBy`) records which
source authorized, as specified. `prospect wave add/list/remove` is the CLI
surface. `planOutreachFullScan`'s typed refusal set is unchanged
(`not-selected` still covers "on neither list").

- Present the options through the interactive question mechanism before any
  code:
  1. **Record the roster (recommended).** A small operator-authored
     document (candidateId or domain, the runbook's rank, decision date,
     scope wave 1) written through the CLI (`prospect wave add/list/remove`),
     read by the scan gate as a second authorization source beside cohort
     membership. Suppression always wins; entries are revocable and
     wave-scoped; the dashboard shows roster and cohort side by side.
     `planOutreachFullScan`'s typed refusal stays `not-selected`; the
     persisted plan provenance records which source authorized.
  2. **Amend the runbook.** Record that ranks 7 to 10 stay outside wave-1
     enforcement until a future selection includes them. No schema, no gate
     change; B1's copy already tells the truth.
  3. **Defer** until after the first sends.
- Recommendation for option 1: the operator's approval of the 10 domains is
  a recorded, dated decision with granted scan permission, and leaving it
  unenforced is exactly the drift that produced this issue. The roster
  models what actually happens: the formula proposes, the operator
  disposes.
- Implementation follows only the recorded pick. Option 1 touches
  `planOutreachFullScan` and adds one store schema and one CLI command
  group; option 2 touches only the runbook.
- Effort: S for option 2, M for option 1.

### Slice B3: the qualification badge says stage, not permission

**Dropped 2026-09-12 by Claude Code**, per this slice's own coordination
rule: plan 040 slice 7 (the vocabulary pass) landed 2026-09-12, before this
slice started, so the badge wording change belongs there and was not
duplicated here.

- The green badge is the strongest color on the table and reads as
  actionability. Reword it to a stage phrase. Final wording belongs to plan
  040 slice 7's vocabulary pass (the IA's jargon table already maps
  "cohorte contactable" to "hôtels sélectionnés"), so the coordination
  rule: if 040 slice 7 has landed, this slice is dropped and the change
  happens there; if not, this slice changes only the badge labels and
  leaves the rest of slice 7's vocabulary alone. Check `plans/README.md`
  before starting.
- Effort S.

### Part B shortcomings (accepted or mitigated, recorded)

- `inSelection` is membership, not authorization. A member can still be
  refused at scan time (qualification not current, suppressed, scan in
  flight). Labels must say membership ("Dans la sélection"), never "can be
  scanned now"; the hub keeps the full typed verdict.
- Two authorization sources (roster and cohort) can drift as future cohorts
  select different hotels. Mitigations: wave-scoped, revocable entries; the
  dashboard shows both; the cohort document remains the formula's record
  and the roster never rewrites it.
- A default-filtered list changes what a returning operator sees first.
  Mitigated by explicit URL params winning over the default, so bookmarks
  and shared views keep working, and by the count line naming the
  catalogue's size.
- The cutoff comparison can be read as "raise the score to get in". The
  wording stays factual (criteria and recorded numbers), per the charter's
  no-client-specific-conclusion discipline.
- B3 edits i18n keys plan 040 slice 7 also owns; the coordination rule
  above exists so the same strings are never edited twice under two plans.

### Part B STOP conditions

- `planOutreachFullScan`'s authorization semantics change only behind
  slice B2's recorded operator pick.
- Locked contracts (`findings.ts`, `severity.ts`, `llm-output.ts`)
  untouched; no new dependencies; FR and EN together on every string.
- `packages/report` and `packages/site` are out of scope.
- Plan 040 in-flight slices: check `plans/README.md` before touching any
  i18n key or hub surface slice 7 may also touch.

## Part A STOP conditions

- Slice 1 proposes touching a locked contract
  (`packages/core/src/types/findings.ts`, `severity.ts`, or
  `llm-output.ts`) to carry a snippet or score. Stop and ask; do not modify
  these files under this plan without explicit operator sign-off per
  CLAUDE.md's locked-contracts section.
- Slice 1 finds the scorecard would need a new commercial tier or pricing
  surface. Stop; trade-off 12 (single-tier commercial model) is a business
  decision, not an engineering one.
