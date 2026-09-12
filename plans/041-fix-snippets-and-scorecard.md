# Plan 041: Deterministic fix snippets and a visual scorecard summary (Part A); the prospects table shows what the operator can act on (Part B)

> **Executor instructions**: Follow this plan slice by slice. Run every
> verification command and confirm the expected result before moving to the
> next slice. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When a slice lands, update this plan's status row
> in `plans/README.md`.

## Status

- **Priority**: P3 for Part A; P2 for Part B
- **Effort**: M for Part A Slice 2 (combined fix snippets + scorecard, one
  slice per the operator's build-order pick 2026-09-12)
- **Risk**: LOW at Slice 1 (done, research only). MEDIUM at Slice 2: touches
  the report's design system (trade-off 9) and the outreach preview's
  narrow contract (trade-off 42), though the operator's picks below keep
  the preview change additive rather than a widen.
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

**Done 2026-09-12 by Claude Code.**
`docs/product/fix-snippets-and-scorecard-brainstorm.md` written; operator
direction pick recorded there and carried into Slice 2 below.

## Slice 2: fix snippets and the scorecard (combined)

**Landed 2026-09-12 by Claude Code.** All checklist items below are done.
The own-counts grade band question (originally framed as "calibrate
against real scan data, which this machine does not have") was resolved
differently, per the operator's direction mid-implementation ("can't we
just use the score system we already have?"): instead of inventing and
empirically calibrating a new normalized severity index, `grade.ts`'s
`computeSeverityGrade` anchors its A/B/D/F cutoffs directly on the exact
numbers the two already-reviewed cost gates use
(`isAuditFallbackEligible`/`isProspectingWorthy`,
`packages/core/src/cost-gating/brokenness.ts`, trade-off 23/38). This
needed no real-scan data at all: those thresholds were already approved
policy before this grade existed. See "Design direction" and the
Verification section below for the reasoning and the regression-guard
tests that keep the two from drifting apart. The comparative grade
(`computeComparativeGrade`, report-only, benchmark-percentile path) still
has un-anchored band cutoffs - lower stakes, since it only fires once
milestone 10's benchmark cohort exists, which it does not yet.

Operator picks, 2026-09-12, via the interactive question mechanism (asked
twice: once on the two features generally, once specifically on the
outreach preview's stricter no-statistics rule once that tension surfaced
mid-design):

1. Content-dependent rules get a fill-in-the-blank snippet (the correct
   markup shape with a blank for the client's own wording); fixed-shape
   rules keep a ready-to-paste snippet, ancestry: the brainstorm's fix
   snippet questions (a) to (d).
2. The scorecard shows a letter grade, always paired with a fixed,
   non-removable disclaimer sentence ("mesure les constats des scanners,
   pas la conformite legale" / "measures scanner findings, not legal
   compliance"). Never rendered without that sentence. This is the
   operator's call against the brainstorm's "never a letter grade"
   recommendation; the disclaimer is the agreed mitigation for
   non-negotiable rule 6.
3. It renders on both the report cover/metadata sheet and the outreach
   preview, not staged.
4. **The report's grade may use the benchmark percentile comparison; the
   outreach preview's grade may not.** Surfaced mid-design: the percentile
   ("scores worse than X% of comparable sites") is a comparative
   statistic, and trade-off 42/16 forbid the outreach preview from
   carrying statistics or comparisons to other sites. The operator picked
   "own counts only, no comparison" for the preview specifically, which
   stays inside the existing rule with no amendment. The report is not
   bound by that rule, so its grade uses the percentile when one exists.
   Two grade sources therefore exist by design, not by oversight:
   - **Report**: percentile-based grade when `hasBenchmarkPercentile` is
     true (packages/core/src/benchmark/percentile.ts); the own-counts
     fallback below when the cohort is too small.
   - **Outreach preview**: always the own-counts fallback, never the
     percentile, regardless of cohort size.

### Design direction

**Fix snippets**

- Add an optional `snippet` alongside each rule ID's existing FR/EN
  remediation prose in `packages/report/src/template/remediation/`
  (`index.ts`, `en.ts`, `fr.ts`) rather than a parallel table, per the
  brainstorm's recommendation (b): one file, one per-rule-ID key, reuses
  trade-off 71's existing coverage-enforcement mechanism.
- `snippet` shape: `{ kind: 'fixed' | 'fill-in-blank' | 'not-applicable'; template: string }`.
  `fixed` templates may reference `${selector}`/`${resourceUrl}` etc.,
  substituted by one new pure interpolation helper reading only
  `FindingElement`'s existing fields (`packages/core/src/types/findings.ts`,
  read-only, no contract change), HTML-escaped before substitution.
  `fill-in-blank` templates render the correct shape with a literal blank
  marker (e.g. `<votre description ici>` / `<your description here>`) and
  are never interpolated with the finding's own captured content (the
  brainstorm's reasoning: substituting an already-bad value into a
  "write better copy" template adds noise, not help). `not-applicable`
  covers rules whose fix is site-wide/structural and cannot localize to
  one element (crawl budget, redirect chains, third-party inventory).
- Extend the existing source-derived coverage test
  (`remediation.test.ts`) so every reachable rule ID has an explicit
  `snippet.kind`, not just prose. This is the open question (3)
  recommendation from the brainstorm, adopted: enforce the marker, not a
  populated snippet body for every rule.
- Render at the two existing sites only (`rendered-priorities.ts`,
  `remaining-work.ts`), report only. Not the dashboard, not the preview
  (the brainstorm's (d) recommendation, not contradicted by any operator
  pick).
- Classifying each of the ~172 reachable rule IDs into fixed/fill-in-
  blank/not-applicable, and writing the FR/EN template text, is the bulk
  of this slice's content work, not its engineering work.

**Scorecard**

- New pure function in `packages/report` (next to `statistics.ts`, same
  package that already owns both the PDF report template and the
  outreach preview renderer, so no new package boundary is crossed):
  `computeSeverityGrade(severityCounts): { grade, reason }` as the
  own-counts fallback, and
  `computeComparativeGrade(percentileResult): { grade, percentile }` for
  the report's percentile path. Both are presentation-layer mappings over
  numbers already computed elsewhere (`computeStatistics`,
  `computeSiteBenchmarkPercentile`); neither calls a cost gate at runtime
  (trade-off 38 stays untouched - a grading formula has no business
  depending on functions whose contract is "should the LLM be called").
- Own-counts fallback formula (revised mid-implementation, per the
  operator's direction - see the Slice 2 landing note above): rather than
  an invented severity index normalized by page count, requiring
  empirical calibration this machine had no data for,
  `computeSeverityGrade` bands directly on the exact cutoff numbers the
  two already-reviewed cost gates use: 0 critical/0 serious/moderate
  under 5 is `isAuditFallbackEligible`'s own definition of "clean enough"
  (grade A); critical at least 1, or serious at least 2, is
  `isProspectingWorthy`'s own definition of "clearly broken" (grade D,
  the floor of the scale). The two bands in between (a lone serious
  finding graded C; a clean site at or above the moderate-volume cutoff
  graded B) are exhaustively derived from the same two gates' thresholds,
  not separately invented. **The scale is A/B/C/D, not A-F**: revised
  2026-09-12, after the operator raised that telling an uninvited
  outreach recipient their site "failed" reads as an insult rather than
  an opportunity. The underlying severity cutoffs are unchanged; only the
  worst grade's letter moved from F to D. No per-page normalization,
  matching the fact that neither existing gate normalizes by page count
  either. `grade.test.ts` cross-checks both gates directly (calling the
  real `isAuditFallbackEligible`/`isProspectingWorthy` functions against
  synthetic findings) so future drift between the grade and the gates
  fails a test, not silently.
- Percentile-based grade (report only): a direct banding of
  `BenchmarkPercentileResult`'s percentile into the same A/B/C/D scale
  (top band "A" beaten by fewer than 20 percent of the cohort, down to
  "D" for everything beaten by 80 percent or more) - lower-stakes to fix
  now since a percentile is already a 0-100 comparative scale, unlike the
  own-counts bands.
- Render sites: report cover/metadata sheet (beside the existing
  low/medium/high risk badge, visually and conceptually separated from
  it per the brainstorm's rule-1 finding: the grade is deterministic, the
  risk badge is `overallRisk`, LLM-generated - never merge or restyle
  them to look like one signal) and the outreach preview v2 template
  (`packages/report/src/outreach-preview/render-html-v2.ts`), replacing
  or supplementing the four flat severity-total tiles with the own-counts
  grade plus its disclaimer sentence. The preview's Zod contract
  (`packages/core/src/types/outreach-preview.ts`) is unchanged: the grade
  is computed at render time from `severityTotals`, already in the
  contract, not a new field on it - the operator's pick keeps this
  additive rather than a trade-off 42 widen.
- The disclaimer sentence is not optional copy: bake it into the same
  render function that draws the grade, so there is no code path that
  renders one without the other.

### Implementation checklist

- [x] Classified all 195 remediation-table rule IDs (the 172 reachable axe/
      Lighthouse/custom rules plus 23 legacy/renamed ones already in the
      table): 59 fixed, 45 fill-in-blank, 91 not-applicable. Wrote FR/EN
      snippet templates for the 104 with one
      (`packages/report/src/template/remediation/fr.ts`/`en.ts`).
- [x] `snippet` field added to the remediation copy source
      (`RemediationEntry` in the new `snippet.ts`, restructuring
      `REMEDIATION_FR`/`REMEDIATION_EN` from `Record<string, string>` to
      `Record<string, RemediationEntry>`); coverage enforced by the type
      system (`snippet` is non-optional) plus `remediation.test.ts`
      runtime checks (recognized kind, non-empty template, FR/EN kind
      agreement).
- [x] Interpolation helper (`interpolateSnippet` in
      `remediation/index.ts`), plain substitution only (escaping happens
      once at the render site, avoiding double-encoding), unit tested via
      `rendered-priorities.test.ts`'s new fix-snippet describe block.
- [x] Rendered at `rendered-priorities.ts`/`sections/themes.ts` and
      `sections/remaining-work.ts`, through one shared
      `render-fix-snippet.ts` so the two markup/escaping paths cannot
      drift.
- [x] `computeSeverityGrade` and `computeComparativeGrade` in
      `packages/report/src/template/grade.ts`, unit tested
      (`grade.test.ts`, 9 tests including two cross-checks against the
      real `isAuditFallbackEligible`/`isProspectingWorthy` gate
      functions). `computeSeverityGrade`'s bands are anchored on those
      gates' own reviewed thresholds (see Design direction above); no
      real-scan calibration was needed.
- [x] Report cover/metadata sheet renders the grade
      (`sections/metadata-sheet.ts`'s `renderScorecard`), its own field
      beside `renderRiskBadge`, always with the disclaimer sentence
      (`render-scorecard.ts`'s `renderScorecardGrade` makes a bare grade
      unrepresentable).
- [x] Outreach preview v2 renders the own-counts grade
      (`render-html-v2.ts`'s `renderTotals`) with the same mandatory
      disclaimer sentence; `OutreachPreviewSummary`'s Zod schema
      unchanged, computed at render time from the existing
      `severityTotals` field.
- [x] FR/EN together throughout (`strings/fr.ts`/`en.ts` for the report,
      `strings-v2.ts` for the preview); existing parity tests
      (`strings-v2-parity.test.ts`, `remediation.test.ts`'s key-set
      check) cover the new fields structurally.
- [x] Narrowest suites (802 report tests, all green) then full `pnpm run
      check` (docs, format, lint, typecheck, `audit:code`) and `pnpm run
      test` (3986 passed, 3 pre-existing failures unrelated to this slice
      - see Verification below).

### Verification

- `pnpm exec vitest run packages/report`: 808 tests, all passing (76
  files). Includes `grade.test.ts` (9 tests: 5 direct grade/reason
  cases plus 2 comparative-grade cases plus 2 cross-checks against the
  real cost gates), `remediation.test.ts`'s new snippet describe block
  (3), `rendered-priorities.test.ts`'s new fix-snippet describe block
  (3), `remaining-work.test.ts` +2, `render-html-v2.test.ts` +2 (one
  rewritten to expect grade F on the base fixture, which has a critical
  finding - it graded A under the original page-normalized formula this
  slice replaced).
- `pnpm --filter @odysseus/report run typecheck`: clean.
- `pnpm run check` (docs, prettier, eslint, typecheck both projects,
  `audit:code`): fully clean.
- `pnpm run test` (full repo): pre-existing failures only
  (`app-routes.test.ts`, `findings-provenance.test.ts`,
  `fixture-freshness.test.ts`), verified via `git stash` against the
  pre-slice `c0f7d8d` HEAD (identical failures, identical values,
  present before this slice touched anything).
- One mechanical, out-of-scope fix bundled in to keep `audit:code` green:
  `packages/store/src/outreach-scans.ts`'s
  `OutreachFullScanAuthorizationFacts` was an unused export left by Part
  B's commit (`c0f7d8d`), traced with `fallow dead-code --trace` (used
  only within its own file) and un-exported. No behavior change.

### Slice 2 STOP conditions

- Any attempt to make the outreach preview's grade use the benchmark
  percentile, or otherwise import a comparison to other sites into that
  document. That is a trade-off 42/16 widen the operator explicitly
  declined; if a future need arises, it returns to the operator as its
  own decision, not an implementation shortcut here.
- Any attempt to blend the deterministic grade with `overallRisk` into
  one badge, or to derive the grade from `overallRisk` at all.
- Any attempt to have `computeSeverityGrade` call
  `isAuditFallbackEligible`/`isProspectingWorthy` at runtime rather than
  only sharing their reviewed cutoff numbers. Trade-off 38 forbids
  reusing the shipped cost gates outside their own decision; the grade
  formula anchors on their numbers as a documented, tested coincidence,
  not a dependency.
- `computeComparativeGrade`'s percentile bands used against a real
  client's report before at least a sanity check once milestone 10's
  benchmark cohort exists - those bands remain un-anchored on anything
  (no existing reviewed threshold covers a 0-100 comparative scale).
  Lower stakes than the own-counts bands, which this slice resolved.
- Locked contracts (`findings.ts`, `severity.ts`, `llm-output.ts`,
  `outreach-preview.ts`'s Zod schema) touched. Stop and ask.

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
