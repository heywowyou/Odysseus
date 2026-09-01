# Plan 020: Add defensible financial evidence and the general legal reference

- **Status:** DONE (2026-09-02) with the financial-opportunity feature
  (steps 3, 4, and 6) explicitly deferred, not implemented. See "Resolution:
  financial-opportunity scope deferred" below and trade-off 63's amendment.
- **Archived:** 2026-09-02 after focused and repository-wide verification
  (`pnpm run check` and the full `core`/`store`/`interface`/`report` Vitest
  suite) passed.
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Depends on:** Plan 019
- **Planned against:** `24f032a`
- **Approved:** 2026-08-31

## Resolution: financial-opportunity scope deferred (2026-09-02)

Step 3 requires the reference-stat catalogue to carry an explicit sector,
measured metric, and unit for any statistic opted into client-estimate
eligibility, and forbids reconstructing that mapping from prose. The
Deloitte study (`deloitte-speed-conversion-retail-2020`,
`deloitte-speed-conversion-travel-2020`) reports a conversion lift per
0.1-second improvement in "mobile site speed," a term its own methodology
does not decompose into one of this tool's five measured Core Web Vital
metrics (LCP, TBT, FCP, Speed Index, CLS; see
`packages/core/src/normalize/cwv-thresholds.ts`). Choosing any one of them
as a stand-in would be an interpretive judgment the primary source does not
make, which is exactly the stop condition this plan lists before "opting in
a financial reference whose sector, metric, unit, or primary-source
interpretation is not explicit in structured data."

Presented with this gate, the operator chose to defer the financial-opportunity
feature entirely rather than approve a specific metric substitution. Steps 3
(estimate eligibility), 4 (opportunity resolver), and 6 (rendering the
opportunity in the executive summary) are not implemented. No code exists for
them: `RevenueOpportunity`, an eligibility catalogue extension, and the
executive-summary rendering block are all unbuilt. The `{{#if
revenueOpportunity}}` placeholders added to the design mockup and report
reference template under step 1 document the intended future shape but are
inert; nothing ever sets that value, so the block never renders.

Steps 1 (canonical policy), 2 (typed turnover), 5 (turnover persistence and
UI), and 7 (the general EAA legal reference) are implemented, tested, and
verified below. Turnover input therefore currently has no client-facing
financial consumer; it remains in the preparation workflow as approved
groundwork; a future plan may revisit the opportunity feature only with a new
primary source (or a new operator-approved trade-off amending this decision)
that supplies an explicit metric mapping.

## Outcome

Show at most one defensible, clearly qualified improvement opportunity in the
executive summary when the client's sector, measured problem, and primary study
strictly match. Make turnover input simple and traceable. Add the already
primary-sourced general EUR 7,500 EAA reference once in the detailed legal
section, without turning it into a conclusion about the client.

This plan deliberately separates commercial evidence from legal exposure. It
never calls the financial amount a loss, a cost of the status quo, or a return
on the audit price. It never calculates, predicts, or implies a client-specific
sanction.

## Drift check before implementation

Re-read these paths and stop to update this plan if their relevant contracts
have changed since `24f032a`:

- `CLAUDE.md`
- `docs/decisions/trade-offs.md`
- `docs/rules/obligation-basis.md`
- `docs/rules/operator-obligations.md`
- `docs/rules/offer-positioning.md`
- `docs/rules/llm-layer-rules.md`
- `docs/report/report-design-system.md`
- `docs/report/design/`
- `packages/core/src/reference-stats.ts`
- `packages/core/src/revenue-impact.ts`
- `packages/core/src/legal/`
- `packages/core/src/report-preparation/`
- `packages/store/src/models/`
- `packages/report/src/render-html.ts`
- `packages/interface/src/server/`

Confirm Plans 018 and 019 are implemented and verified. This plan extends their
executive-summary placement and their single preparation workflow.

## Current state and problem

- Reference-stat scalability describes reuse in broad terms, but it does not
  prove that a statistic can support a client-specific annual monetary amount.
- `estimateRevenueImpact(...)` multiplies revenue by a ratio without enforcing
  sector, metric, measurement-success, or finding-category eligibility.
- Some scalable references concern abandonment, checkout behaviour, search
  clicks, or accessibility. They are valuable context but do not justify a
  general annual revenue estimate for an arbitrary finding.
- Financial notes can appear near themes. Repeating money beside several themes
  makes one study look like several independent impacts.
- The core already contains `eaaSanctionFigureSentence(...)`, based on an
  approved primary source. Current canonical policy intentionally prevents a
  client-specific sanction figure, and report tests prevent the number from
  rendering at all. The approved change is narrower: one general reference in
  the detailed legal section, still never a conclusion about this client.

## Locked decisions

### Turnover input

- Turnover remains optional.
- In the existing **Prepare report** card, show the detected official value,
  year, and source when available.
- The official value is the default. Replacing it requires an explicit action,
  not merely typing into a prefilled field.
- An operator replacement is either an exact amount or a range and always has a
  year and source.
- For a range, calculations use the lower bound.
- Preview the effective value, calculation basis, year, and source before report
  generation.
- Missing turnover does not block preparation and does not produce a client
  report warning or empty financial block.

### Financial eligibility and language

- Render an amount only when sector and measured problem strictly match a
  primary study explicitly approved for client estimation.
- At implementation start, the only eligible evidence family is the existing
  sector-matched Deloitte conversion-uplift-per-0.1-second reference, and only
  when a successful deterministic measurement proves the applicable performance
  problem on a covered page.
- Baymard abandonment/checkout, Pew click-through, generic visibility, average
  order value, accessibility, and broadly `scales-down` statistics are not
  eligible for an annual client amount.
- If eligibility fails, omit the amount from the client report. In the operator
  preview, explain the typed reason: missing turnover, unsupported sector,
  unmatched metric, missing successful measurement, no qualifying problem, or
  no eligible reference.
- Show the amount once, in the executive summary, labelled **indicative
  improvement opportunity** in the report language with the study citation
  adjacent.
- Never label it loss, lost revenue, cost, exposure, guaranteed gain, ROI, or
  cost of the status quo.
- Never compare it with the audit or re-audit price.

### Legal reference

- Amend canonical policy first to permit one general EAA reference in the
  detailed legal section.
- Reuse the existing primary-sourced `eaaSanctionFigureSentence(...)` verbatim
  as the deterministic source of the approved French and English wording. Do
  not create a second copy or ask the LLM to paraphrase it.
- Do not add DGCCRF powers, notice procedure, enforcement sequence, fine
  multiplication, or any other unsupported procedural claim.
- Do not render the amount on the cover, metadata, opening, executive summary,
  priorities, journeys, conclusion, or LCEN material.
- Do not place it beside client finding counts or use possessive/client-specific
  language that implies this audit establishes an offence or sanction.

## Scope

Expected implementation areas:

- `CLAUDE.md`
- `docs/rules/obligation-basis.md`
- `docs/rules/offer-positioning.md`
- `docs/decisions/trade-offs.md`
- `docs/report/report-design-system.md`
- `docs/report/design/`
- `packages/core/src/report-preparation/`
- `packages/core/src/reference-stats.ts`
- `packages/core/src/revenue-impact.ts`
- `packages/core/src/legal/`
- `packages/core/src/__tests__/`
- `packages/store/src/models/`
- `packages/store/src/services/`
- `packages/interface/src/server/`
- `packages/interface/src/__tests__/`
- `packages/report/src/`
- `packages/report/src/__tests__/`

Do not add legal research, a new source, a dependency, a package boundary, or a
model-authored legal/financial calculation.

## Implementation

### 1. Amend canonical policy before code

Update the charter, obligation basis, offer positioning, report design sources,
and trade-off log together. Preserve the existing rule against client-specific
legal conclusions while documenting this narrow exception:

- deterministic general reference only;
- applicable EAA legal context only;
- detailed legal section only;
- exact existing primary-sourced helper;
- no arithmetic, finding-count adjacency, procedure claims, or client exposure.

Document the financial rule separately: an amount is an indicative improvement
opportunity, appears at most once, requires strict typed eligibility, and is
omitted rather than generalized when evidence does not match.

Do not implement code if the canonical sources cannot express both boundaries
without contradiction.

### 2. Extend the preparation aggregate with typed turnover

Extend Plan 019's module rather than creating a second form or storage object.
Use discriminated types equivalent to:

```ts
type ManualTurnover =
  | { kind: "exact"; amountEur: number; year: number; source: TurnoverSource }
  | {
      kind: "range";
      lowerEur: number;
      upperEur: number;
      year: number;
      source: TurnoverSource;
    };

interface TurnoverChoice {
  detected?: DetectedOfficialTurnover;
  replacement?: ManualTurnover;
  useReplacement: boolean;
}
```

Use the project's actual money representation and validation rules. Do not use
floating-point euros if the codebase uses integer minor units. Constrain sources
to a small typed catalogue such as official annual accounts, client-stated, and
other documented source. If `other` needs a note, keep it bounded and operator-
facing; it must not become report prose.

Add one pure `resolveEffectiveTurnover(...)` policy. It prefers the detected
official value unless the explicit replacement action is true, validates ranges
and years, uses the range lower bound for calculation, and returns typed absence
or rejection reasons. Persist provenance and show it in preview.

### 3. Replace broad scalability with explicit estimate eligibility

Do not infer client-estimate permission from the existing `scalability` field.
Add an explicit typed eligibility policy to the reference-stat catalogue or a
co-located selector table. Every reference defaults to ineligible unless the
catalogue opts it in with:

- eligible sector identifiers;
- measured metric and unit;
- required successful measurement evidence;
- required finding category/condition;
- conversion formula and safe bounds;
- required citation/source ID.

Initially opt in only the existing Deloitte conversion-uplift-per-0.1-second
rows where all these facts already exist in primary-sourced structured data.
Write negative catalogue tests for every other current statistic so a future
`scales-down` edit cannot silently enable money.

If the current Deloitte representation lacks the exact sector or unit metadata
needed for a strict match, stop instead of reconstructing it from prose.

### 4. Build one centralized opportunity view

Replace theme-level monetary rendering with a pure resolver that returns either
a single bounded `RevenueOpportunity` or a typed omission reason. The positive
view must include:

- effective turnover and year;
- turnover provenance;
- matched sector;
- measured problem and successful evidence reference;
- eligible stat ID and citation ID;
- bounded calculation inputs;
- conservative amount;
- deterministic French and English label/disclaimer.

Select at most one opportunity deterministically. Do not sum references,
findings, pages, or theme impacts. If multiple measurements match the same
eligible policy, use the catalogue's documented conservative selector rather
than presenting a range of optimistic scenarios.

The report package receives this resolved view. It does not query references or
recalculate money. Add the opportunity's citation ID to the normal citation
collection so it renders once and cannot create an uncited amount.

### 5. Add turnover and eligibility preview to Prepare report

Extend the existing card with a compact turnover section:

- detected official amount, source, and year;
- **Use a different value** action;
- exact/range choice with year and source;
- effective lower-bound basis when a range is selected;
- live eligible amount or plain omission reason.

The controls remain optional and do not enter Plan 019's missing-context warning
digest. Require normal authentication, CSRF, Zod validation, bounded amounts,
credible years, and `lower <= upper`. The interface must label manual
replacement clearly so the official and replacement values cannot be confused.

### 6. Render the opportunity once

Remove or disable every per-theme euro-impact note. In the executive summary,
render the opportunity after the decision prose and before priorities, using
the deterministic wording **indicative improvement opportunity** and its
French equivalent. Keep the study citation adjacent in the same block.

If the resolver returns an omission reason, render nothing in the client report.
Do not show zero, unavailable, missing turnover, or an invitation to provide
revenue. Those reasons belong only in the operator preview.

Add regression guards that search the complete bilingual HTML for duplicated
currency amounts, loss/cost/ROI language, and comparisons with current offer or
re-audit prices.

### 7. Render the approved general legal sentence once

For reports whose deterministic applicability resolver includes the EAA,
render `eaaSanctionFigureSentence(locale)` in Plan 018's detailed legal section.
Place it under a clearly general legal-reference heading, separated from the
client-specific verified facts and criteria.

Do not interpolate the client's name, number of findings, or an arithmetic
result into or adjacent to the sentence. Do not render it for an LCEN-only
context. Preserve all existing applicability disclaimers and the ban on legal
conclusions.

Use absolute placement tests over the whole document, not only snapshots of the
legal component.

### 8. Verify the vertical slice

Add focused policy, persistence, interface, and full-report tests before running
the wider repository validation.

## Required tests

### Turnover

- Detected official value is the default.
- Typing a replacement without the explicit action cannot activate it.
- Exact and range values round-trip with source and year.
- Range calculation uses the lower bound.
- Invalid, negative, implausibly large, reversed, fractional where forbidden,
  or stale/future-year values are rejected according to documented bounds.
- Missing turnover returns a typed omission and never blocks report preparation.

### Financial eligibility

- Strict sector, metric, successful-measurement, and qualifying-problem matches
  are all required.
- A failed or missing performance measurement is ineligible.
- An unrelated performance finding is ineligible.
- Every Baymard, Pew, accessibility, AOV, visibility, and other non-opted-in
  current statistic is explicitly ineligible.
- `scales-down` alone never enables an estimate.
- The selector returns at most one conservative opportunity.
- Every opportunity carries its exact stat and citation IDs.

### Interface and store

- Authentication, CSRF, Zod, and provenance validation cover turnover writes.
- The operator sees official and replacement values distinctly.
- Preview shows the lower-bound basis and a typed omission reason.
- Turnover changes do not invalidate the required-context acknowledgement.
- Persistence never drops the official value when a replacement is selected.

### Report financial block

- Eligible data renders one amount once in the executive summary with the
  approved qualified label and adjacent citation.
- Ineligible or missing data renders no client-facing placeholder.
- No theme renders a separate euro-impact note.
- Bilingual full-document tests prohibit loss, lost revenue, cost of status quo,
  guaranteed gain, ROI, audit-price comparison, and duplicate amounts.

### Legal block

- Applicable EAA context renders the existing EUR 7,500 sentence exactly once
  in the detailed legal section in each language.
- The amount is absent from cover, metadata, opening, executive summary,
  priorities, journeys, conclusion, methodology, and LCEN-only content.
- No finding count, multiplication, client name, possessive exposure wording,
  EUR 50,000 amount, DGCCRF procedure, notice procedure, or enforcement sequence
  appears beside it or elsewhere as a new claim.
- Reports outside deterministic EAA applicability omit the sentence.
- Existing legal criteria/facts separation and disclaimer tests continue to
  pass.

## Validation commands

```bash
pnpm exec vitest run packages/core/src packages/store/src packages/interface/src packages/report/src
pnpm run typecheck
pnpm run format
pnpm run check
```

Manually review French and English previews/reports for:

1. an eligible exact official turnover;
2. an eligible manual range;
3. missing turnover;
4. wrong sector;
5. failed performance measurement;
6. applicable EAA legal context;
7. LCEN-only or otherwise non-applicable context.

Confirm the amount reads as a cautious opportunity, appears only once, and is
not visually connected to the audit price or legal amount. Do not run a live
third-party scan or conduct new legal research for this verification.

## Done when

- The operator can keep an official turnover or explicitly replace it with a
  traceable exact/range value in the existing preparation workflow. **Met.**
- A client amount is possible only through explicit catalogue eligibility and a
  strict sector/metric/successful-measurement/problem match. **Deferred**: no
  eligibility catalogue extension or opportunity resolver exists. See
  "Resolution: financial-opportunity scope deferred" above.
- The report shows at most one cited indicative improvement opportunity in the
  executive summary and no per-theme monetary notes. **Deferred** for the same
  reason; the executive summary never renders a financial block because
  nothing produces `revenueOpportunity`.
- Ineligible reports omit financial prose while the operator gets a clear
  reason. **Vacuously true**: every report is currently "ineligible" because
  the feature does not exist, so no financial prose ever renders.
- Canonical policy permits and bounds the general EAA reference without
  permitting a client-specific sanction conclusion. **Met.**
- The existing EUR 7,500 helper renders once in detailed legal content only,
  with regression guards against unsupported claims and placements. **Met.**
- Focused tests, typecheck, formatting, and `pnpm run check` pass. **Met**
  for every implemented area (turnover, persistence, dashboard UI, legal
  reference); no financial-opportunity code exists to test.

## Stop conditions

Stop and ask before:

- changing the text or source basis of `eaaSanctionFigureSentence(...)`;
- adding legal claims or sources, including DGCCRF/procedure material;
- treating the general legal amount as client exposure;
- opting in a financial reference whose sector, metric, unit, or primary-source
  interpretation is not explicit in structured data;
- using LLM output for eligibility, arithmetic, legal wording, or turnover;
- comparing opportunity, legal amount, audit price, or re-audit price;
- adding a dependency, package boundary, or locked-contract change.

## Maintenance notes

- New client-estimate references are denied by default. Each needs explicit
  structured eligibility, a primary-source review, negative tests, and a
  canonical trade-off update.
- Keep broad editorial scalability distinct from monetary estimate eligibility.
- Financial and legal amounts must remain separate view models and separate
  report sections.
- Extend Plan 019's preparation aggregate and UI; do not create a second
  turnover workflow.
