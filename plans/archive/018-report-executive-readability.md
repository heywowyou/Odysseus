# Plan 018: Make the paid report readable as an executive decision document

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update this plan's status row in
> `plans/README.md`, unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 24f032a..HEAD -- docs/report docs/decisions/trade-offs.md packages/report/src packages/interface/src/pipeline/report-stage.ts packages/interface/src/routes/audits.ts packages/interface/src/dashboard/routes/audit-detail.tsx packages/interface/src/dashboard/routes/audit-detail-types.ts packages/store/src/schemas/report.schema.ts plans/README.md`
> If an in-scope file changed, compare the "Current state" facts below with
> live code. A mismatch in section order, pagination, report provenance, or
> cover identity is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `24f032a`, 2026-08-31

## Why this matters

The paid PDF is accurate but makes a director work through technical and legal
material before reaching the decision and action story. The 46-page French
report reviewed in `docs/report/feedback/` exposed the problem clearly: the
reader can verify the findings, but cannot quickly answer what matters, what was
observed, who should act, and what happens next. This plan changes only the
report's information architecture and presentation. It does not change any
finding, severity, legal assessment, or model contract.

This is the first of three slices. It must ship independently with safe generic
copy. Plan 019 adds operator preparation, personalization, regenerated writing,
and evidence-bound journeys. Plan 020 adds the narrowly eligible financial
opportunity and the approved general sanction fact.

## Binding outcome

The resulting report has this reading order. Stable DOM IDs remain unchanged;
only their display order and live ordinal change.

1. Minimal cover
2. Audit metadata and severity-scale sheet
3. Table of contents
4. Situation, complication, question opening, generic in this plan
5. Executive summary
6. Audit scale and ranked priorities
7. Printable action checklist and remaining work
8. Detailed evidence sections
9. Action synthesis and re-audit recommendation
10. Full legal reference
11. Methodology and glossary
12. Technical appendix, always last

Every numbered section starts on a new physical page. There is no hard maximum
page count. A report above 60 pages is generated successfully but returns a
warning to the CLI and dashboard. Blank interior pages, duplicated fragments,
horizontal overflow, missing footers, accessibility failures, and Paged.js
layout failures remain hard failures. Findings inside the technical appendix
flow continuously; they do not each start a page.

## Current state

- `packages/report/src/template/section-registry.ts:8-30` orders the legal
  section third and places glossary, next steps, then appendix at the end.
  `computeSectionNumbers()` already derives live ordinals from stable IDs. Do
  not rename `section-00` through `section-14`.
- `packages/report/src/template/render-html.ts:165-271` duplicates that order in
  its render calls. The registry and render order must always agree.
- `packages/report/src/styles/paged.css:143-167` deliberately implements compact
  flow. `paged-invariants.e2e.test.ts:234-312` asserts up to three numbered sections
  per page and rejects pages more than 80 percent empty. These tests and
  `docs/report/report-design-system.md` conflict with the operator's newly
  approved one-section-per-page rule and must change together.
- `packages/report/src/template/sections/cover.ts:93-150` correctly uses
  `nomCommercial` as the headline and `raisonSociale` as a secondary legal name,
  but keeps six metadata fields and the risk scale on the cover.
- `packages/report/src/template/sections/report-intro.ts:28-99` is a reading
  guide, not a situation, complication, question opening. It lists audiences,
  measures, consequences, and three actions.
- `packages/report/src/template/sections/executive-summary.ts:208-257` renders
  deterministic counts before the model's qualitative prose.
- `packages/report/src/template/sections/themes.ts:321-472` renders an unlabelled
  business-impact paragraph, then legal and citation blocks, then actions. It
  has no concrete "what we observed" block. The report already owns a
  `RenderedPriority` view in `rendered-priorities.ts`; extend that view rather
  than recomputing priority evidence in a template.
- `packages/report/src/template/rule-translations.ts` owns reviewed French rule
  labels. Extract a shared display-label function from this table so priority
  evidence and the appendix cannot disagree.
- `packages/report/src/template/sections/next-steps.ts:62-92` ends with three
  equal cards. The re-audit constants already exist and remain the only price
  source.
- `packages/report/src/pdf.ts:81-149` already computes the real Paged.js page
  count inside `analyzePagedjsPages()`, but `renderPdfFromHtml()` returns only a
  `Buffer`. `packages/interface/src/pipeline/report-stage.ts` persists report
  provenance but not page count.
- `packages/report/package.json` has no `test` script. Never use
  `pnpm --filter @odysseus/report test`; it is a successful no-op. Focused tests
  run through root Vitest with `pnpm exec vitest run <paths>`.

## Canonical constraints to preserve

- The technical appendix remains the final section and stays inside each French
  and English deliverable. This preserves trade-off 44's single-artifact
  identity.
- `packages/report/src/styles/nocturne.css` is locked. Do not edit it. Reuse its
  tokens and classes. Change structure in the canonical flat/reference sources
  first, then bind templates to that structure.
- Never add group-level `break-inside: avoid` to the appendix. Trade-off 17
  prohibits an unbounded group from becoming atomic.
- `packages/core/src/types/findings.ts`,
  `packages/core/src/normalize/severity.ts`, and
  `packages/core/src/types/llm-output.ts` are locked and out of scope.
- French and English strings change together. French guillemets use U+00A0,
  never U+202F. Generated product copy and comments use no em dash or en dash.
- The report remains an automated diagnostic, not an audit RGAA. Keep the
  deterministic limitation statement required by
  `docs/rules/offer-positioning.md`.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused report tests | `pnpm exec vitest run packages/report/src/template packages/report/src/pdf.test.ts` | all selected tests pass |
| Cross-package report tests | `pnpm exec vitest run packages/interface/src/pipeline/report-stage.test.ts packages/interface/src/routes/audits.test.ts packages/store/src/reports.test.ts` | all selected tests pass |
| Documentation | `pnpm run docs:check` | exit 0 |
| Project validation | `pnpm run check` | docs, formatting, lint, and types pass |
| Full suite | `pnpm run test` | all tests pass |

No normalization file changes in this plan, so `pnpm fixtures:refresh` is not
required. Confirm with `git diff --name-only | rg '^packages/core/src/normalize/'`;
the command must print nothing.

## Scope

**In scope**:

- `docs/report/report-design-system.md`
- `docs/report/report-design-tokens.md` only where its recorded cover structure
  becomes stale; do not change visual tokens
- `docs/report/design/report-mockup-standalone.flat.html`
- `packages/report/src/template/report.reference.html`
- `packages/report/src/template/section-registry.ts`
- `packages/report/src/template/render-html.ts`
- `packages/report/src/template/sections/cover.ts`
- a new metadata-sheet renderer beside `cover.ts`
- `report-intro.ts`, `executive-summary.ts`, `themes.ts`, `next-steps.ts`
- `rendered-priorities.ts`, `rule-translations.ts`, report strings and tests
- `packages/report/src/styles/paged.css`, never `nocturne.css`
- `packages/report/src/pdf.ts`, `index.ts`, `types.ts`, and focused tests
- report persistence, report-stage result, route response, and dashboard warning
  fields needed to carry page count
- `docs/decisions/trade-offs.md` entry 44
- `plans/README.md`

**Out of scope**:

- operator situation/trigger fields, stakeholder names, custom questions,
  preparation previews, journey confirmation, and analysis regeneration
  (Plan 019)
- turnover input, revenue estimates, sanction rendering, or other legal-policy
  changes (Plan 020)
- any LLM prompt change
- any new dependency or package
- a new live browser scan

## Git workflow

- Work directly on `main`, matching the repository's current milestone
  workflow.
- Commit one coherent vertical slice at a time: canonical design and pagination;
  cover and order; executive cards and conclusion; page-count warning and final
  verification.
- Do not push or open a pull request unless the operator asks.

## Steps

### Step 1: Amend the canonical report contract before changing the renderer

Update `docs/report/report-design-system.md`, the standalone flat design source,
and `packages/report/src/template/report.reference.html` together.

The design-system document must state:

- one numbered `.sheet` starts on a fresh physical page;
- cover, metadata, contents, checklist, and appendix opening are standalone;
- appendix rows flow continuously after its opening page;
- sparse numbered pages are an accepted executive-reading choice, not a defect;
- the former 80-percent-empty and three-sections-per-page invariants are
  retired;
- no blank interior pages or duplicated fragments are allowed;
- there is no page-count failure range; above 60 pages is a warning;
- the technical appendix is final;
- the new section order in "Binding outcome" is canonical;
- the cover is minimal and the metadata/risk scale live on sheet two.

Do not modify color, typography, radius, or spacing tokens. The flat source and
reference template need structural markup for the new cover and metadata sheet,
not a visual redesign.

Amend trade-off 44 in the same slice. Preserve the one-artifact and bilingual
approval reasoning. Record that the operator deliberately replaced compact
flow with new-page section starts after the 2026-08-30 executive review, while
keeping the appendix final and internally continuous.

**Verify**: `pnpm run docs:check` exits 0. A text review finds no remaining
canonical statement that compatible numbered sections share pages, the
glossary follows the appendix, or the stress fixture must remain within 18 to
32 pages.

### Step 2: Make pagination tests express the new contract

Change `paged.css` so every numbered `.sheet` starts a page. Preserve the cover
named-page behavior, footer margin boxes, checklist print inversion, heading
orphan protection, row-level atomicity, and appendix fragmentation rules.

Update `paged-invariants.e2e.test.ts` before changing templates:

- replace the three-sections-per-page assertion with exactly one numbered
  section start per physical page;
- remove the generic 80-percent-empty failure;
- remove the 18-to-32 hard range;
- retain blank-page, duplicate-atomic-block, horizontal-overflow, footer,
  counter, axe-core, tagged-PDF, and outline checks;
- assert the appendix starts on a fresh page but may continue across pages;
- assert every included numbered section is represented exactly once in order.

Do not force every appendix finding to a page. Do not add `break-inside: avoid`
to an appendix group.

**Verify**: `pnpm exec vitest run packages/report/src/template/paged-invariants.e2e.test.ts`
passes with the revised assertions.

### Step 3: Reorder sections while preserving stable IDs

Reorder `SECTION_IDS` and the calls in `renderBody()` identically:

```text
section-00, section-01, section-03, section-04, section-05, section-05b,
section-06, section-07, section-08, section-09, section-10, section-14,
section-02, section-11, section-13, section-12
```

Conditional sections remain conditional and display numbers remain contiguous.
Do not rename an ID. Add one ordering test that extracts body section IDs and
compares them with the included registry order. Add a second assertion that
`section-12` is final and `section-13` immediately precedes it.

Rewrite table-of-contents grouping and FR/EN section eyebrows as a narrative:
executive context, decisions and actions, detailed evidence, legal reference,
method and vocabulary, technical appendix. All cross-references must resolve
through `sectionTitle()` and live display numbers. Remove hardcoded references
to "section 02".

**Verify**: `pnpm exec vitest run packages/report/src/template/section-registry.test.ts packages/report/src/template/sections/toc.test.ts packages/report/src/template/render-html.test.ts`
passes.

### Step 4: Split the minimal cover from the metadata sheet

Keep `nomCommercial` as the primary cover identity. Fall back to the hostname or
existing report title when absent. Put `raisonSociale` on the metadata sheet as
the legal identity, never above the recognizable trading name.

The cover contains only:

- Odysseus kicker;
- commercial name;
- a safe generic bilingual decision question, used until Plan 019 resolves a
  personalized/custom question;
- the concise report type: accessibility, performance, SEO, and GEO, omitting
  performance only when it was not measured;
- audit date and Odysseus signature.

Create a focused metadata-sheet renderer for site URL, audit date, pages
visited, report language, audited standard/scope, legal name when present, and
the existing severity scale plus basis note. It is the second physical page,
before the table of contents. Reuse existing tokens and classes. Do not edit
`nocturne.css`.

Update the flat/reference sources first, then template code. Add FR/EN and
manual-field tests for commercial-name precedence, legal-name placement,
missing fields, performance-not-measured copy, and metadata-sheet order.

**Verify**: `pnpm exec vitest run packages/report/src/template/sections/cover-manual-fields.test.ts packages/report/src/template/sections/cover-performance-referential.test.ts packages/report/src/template/render-html.axe.e2e.test.ts`
passes.

### Step 5: Turn the opening into a safe generic SCQ narrative

Reshape `report-intro.ts` into Situation, Complication, Question without adding
manual input yet.

- Situation uses only facts already known at render time and the diagnostic's
  purpose. It must not claim that bookings increasingly pass through AI, that
  clients abandon, or that any law applies to this business.
- Complication states deterministic pages/findings/priority facts and includes a
  short legal reminder linking to the later legal section. It reports criteria
  and verified inputs, never a client-specific conclusion.
- Question repeats the same generic question as the cover through one shared
  resolver, so the bytes cannot drift.
- Keep a compact "who uses this" table using role labels only: management,
  technical provider or IT, communications, and legal. Names arrive in Plan
  019.
- Keep the top-three action list, remove effort from its sentence, and use
  "Complexity" only on the detailed card.

The shared generic-question module is report-owned and pure. Plan 019 will
extend its input, not replace the seam.

**Verify**: focused report-intro and cover tests prove the question is identical
in both locations, every fallback renders in both languages, and prohibited
unsupported phrases are absent.

### Step 6: Put outcomes first and concrete evidence inside each priority card

In `executive-summary.ts`, render the model's qualitative summary before the
deterministic counts. Keep the digit guard unchanged; numbers remain template
owned.

Deepen `RenderedPriority` so it owns a deterministic evidence summary consumed
by every priority surface. Do not make each template understand rule selection.
For each priority:

- select a representative finding deterministically by severity, then
  `findingId`;
- resolve its display label through the same helper the appendix uses: reviewed
  French rule label, scanner title in English;
- select one representative affected page deterministically;
- carry exact unique-page and occurrence counts.

Render each card in this order:

1. rank, category, quick-win marker, outcome-oriented stored title;
2. "Why it matters", using `theme.businessImpact`;
3. "What we observed", using the deterministic defect label, representative
   page, page count, and occurrence count;
4. "What you can do", using existing recommended and reviewed remediation;
5. legal/citation context;
6. footer metadata with Complexity, commercial impact, affected pages,
   conformity, and finding references.

Do not describe counts alone as the observation. Do not modify the locked Theme
shape. Existing audits retain their stored technical titles in this plan; Plan
019 changes writing only for newly generated or explicitly regenerated
analyses.

**Verify**: `pnpm exec vitest run packages/report/src/template/rendered-priorities.test.ts packages/report/src/template/sections/themes.test.ts packages/report/src/template/sections/executive-summary.test.ts`
passes, including tie selection, zero-page evidence, long URLs, FR/EN labels,
and HTML escaping.

### Step 7: Replace the three-card ending with a synthesis

Change `next-steps.ts` into one compact synthesis before the later legal
reference:

- recap the stake without inventing a financial amount;
- recap priority count, serious/critical coverage, and quick wins from
  deterministic inputs;
- name the next responsible roles;
- recommend a re-audit after priority corrections, normally within three to
  six months;
- state the existing re-audit price and lead time through
  `ODYSSEUS_REAUDIT_PRICE_EUR_HT` and
  `ODYSSEUS_REAUDIT_LEAD_TIME_DAYS`;
- keep one compact contact block and existing authorship, liability, report ID,
  renderer, and template provenance.

Do not end on three sales cards. Do not promise conversion measurement;
re-audit comparisons are scanner-computable findings by severity, failed WCAG
criteria, and CrUX field data when available. A client's own conversion rate
may be named only as their separate measurement.

**Verify**: `pnpm exec vitest run packages/report/src/template/sections/next-steps.test.ts`
passes with tests for absent CrUX, fixed price source, and no invented
conversion claim.

### Step 8: Return and persist page-count warnings without blocking output

Make the report renderer's deep interface return the PDF and measured page
count. Prefer a new result-returning function with a compatibility wrapper if
that keeps existing callers small. The Paged.js implementation already knows
the count; do not parse the final PDF to rediscover it.

Thread `pageCount` through `runReportStage`, the report sidecar, and the optional
field on the insert-only report document. Reports at 60 pages or fewer have no
length warning. Reports above 60 pages:

- still persist and remain previewable;
- return a typed warning from report-stage;
- print a clear CLI warning;
- show a non-blocking warning on the audit detail report row.

Legacy report documents without page count remain valid and show no inferred
value. The warning is not a freshness or approval failure.

**Verify**: report PDF, report-stage, store schema, route, and dashboard model
tests cover 60, 61, and legacy-undefined cases. Run:
`pnpm exec vitest run packages/report/src/pdf.test.ts packages/interface/src/pipeline/report-stage.test.ts packages/interface/src/dashboard/routes/audit-detail-model.test.ts packages/store/src/reports.test.ts`.

### Step 9: Validate the complete bilingual document

Run focused tests, then the project checks and full suite. Generate French and
English PDFs from a current stored analysis, without a new scan. Review at
least the de-identified stress fixture and the stored La Coorniche audit that
produced the feedback.

The human review checks:

- cover identity and metadata separation;
- contents and body order agree;
- each numbered section starts a page;
- appendix is final and internally continuous;
- no blank pages or duplicated fragments;
- model prose precedes counts;
- each priority contains a concrete observation;
- full legal detail appears only later;
- conclusion reads as synthesis, not a price list;
- French and English PDFs preserve meaning and layout.

No live site browser scan is authorized by this plan.

**Verify**: `pnpm run check` and `pnpm run test` both exit 0. Record both PDF
paths, page counts, warnings, and human-review result in the session log.

## Test plan

- Update `paged-invariants.e2e.test.ts` to the new canonical contract.
- Add registry/render-order assertions using the real rendered DOM.
- Extend cover tests for commercial identity and the metadata sheet.
- Extend report-intro tests for SCQ structure and shared question bytes.
- Extend `rendered-priorities.test.ts` and `themes.test.ts` for concrete evidence.
- Extend `next-steps.test.ts` for synthesis and re-audit wording.
- Extend `pdf.test.ts`, report-stage, store, route, and dashboard-model tests for
  page-count warnings.
- Keep `spacing-tokens.test.ts`, `guillemet-spacing.test.ts`,
  `letter-spacing.test.ts`, `render-html.axe.e2e.test.ts`, and the tagged-PDF outline
  assertion green.

## Done criteria

- [ ] Canonical design documents and flat/reference sources describe the new
      structure before implementation code relies on it.
- [ ] Every numbered section starts on a new page.
- [ ] Appendix remains final and its findings flow continuously.
- [ ] No hard page maximum exists; page counts above 60 create a non-blocking
      CLI/dashboard warning.
- [ ] Cover uses the commercial name first and metadata/risk appears on page 2.
- [ ] Legal detail appears after evidence and synthesis, before methodology and
      supporting material.
- [ ] Executive prose leads counts and every priority shows a concrete defect,
      representative page, and exact scale.
- [ ] Conclusion is a synthesis with a discreet code-owned re-audit offer.
- [ ] `nocturne.css` and all three locked contracts are unchanged.
- [ ] Focused tests, `pnpm run check`, and `pnpm run test` pass.
- [ ] French and English PDFs receive a recorded end-to-end human review.
- [ ] `plans/README.md` marks Plan 018 DONE only after that review.

## STOP conditions

Stop and report if:

- changing the layout appears to require editing locked `nocturne.css` tokens;
- stable section IDs must be renamed rather than reordered;
- a new package or dependency appears necessary;
- Paged.js creates a blank, duplicated, truncated, or horizontally overflowing
  document after two focused fixes;
- the technical appendix cannot remain last;
- a proposed opening sentence asserts client behavior, legal scope, or business
  growth not present in deterministic input;
- a locked core contract would need modification;
- the La Coorniche stored artifacts are unavailable for final review. The
  de-identified fixture may prove automation, but cannot replace the recorded
  client-output acceptance gate.

## Maintenance notes

- Plan 019 must extend the generic question and opening through their existing
  resolver interfaces. It must not fork cover and introduction copy.
- Plan 020 must consume one central financial-opportunity view and insert its
  amount once in the executive summary. It must not restore per-theme euro
  notes.
- Any future section-order change updates `SECTION_IDS`, `renderBody`, canonical
  design sources, order tests, and live cross-references in one slice.
- Reviewers should scrutinize Paged.js fragmentation, commercial-name
  precedence, deterministic evidence selection, and any new sentence that
  sounds like a measured client outcome.

## Status notes

- Rewritten 2026-08-31 after the operator completed and confirmed a 50-decision
  review of the original draft. Status `TODO`.
- **DONE 2026-09-01.** All nine implementation steps landed in six commits and
  the automated suite plus de-identified and La Coorniche rendered-output
  reviews passed. The remaining French-output gate was subsequently satisfied
  during plan 019's operator review after the severity-vocabulary retry defect
  was fixed. The minor appendix-orphan and cover-wrap observations remain
  non-gating follow-up evidence rather than incomplete plan work.
