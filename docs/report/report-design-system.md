# Report design system

Authoritative spec for the client-facing PDF produced by `packages/report`.
Read this before touching anything under `packages/report/src/template` or
`packages/report/src/styles`.

The visual design is not open for reinterpretation. It exists as source, not as
a screenshot to approximate. The current baseline is the 2026-09-02 plan 023
refinement (operator-picked direction "Refine Nocturne": keep the dark
executive world and Inter; recompose the front matter, document the checklist's
print mode, and restore spacing rhythm). A future revision re-runs plan 023's
gate; it does not happen inline:

| Artifact | Path | Status |
| --- | --- | --- |
| Design system CSS | `packages/report/src/styles/nocturne.css` | token source of truth; revise only per this document, plan 023 baseline |
| Paged media layer | `packages/report/src/styles/paged.css` | edit only per this doc |
| Reference template | `packages/report/src/template/report.reference.html` | structural source of truth |

If output does not match the reference, the template binding is wrong. Do not
fix it by changing colours, sizes, spacing or inline styles.

## Direction contract (plan 023, recorded 2026-09-02)

- **Thesis**: the report keeps the Nocturne identity; the refinement changes
  completion, not character: composed front matter, one documented print-first
  page, and real spacing rhythm.
- **Own-world**: a dark, quiet executive dossier: `#161826` ground, panel and
  hairline dividers, violet accent, muted severity pastels, Inter self-hosted
  (400/500/600/700 plus the kept 400 italic). The one deliberate exception
  stays: section 05's print inversion to `#f7f7f5`.
- **Story**: a client opens a calm dark cover whose lower half ends
  deliberately instead of trailing into void, reads a metadata sheet that
  fills its page with intent, works through evenly spaced sections, and can
  pull out the checklist to print or capture alone, the only light page, on
  purpose.
- **First viewport (cover)**: the radial glow and the mid-page title block
  stay; the closing composition (accent rule, report type, date, Odysseus
  signature) sits at roughly two-thirds page height, followed by quiet ground,
  so the sheet ends by design. No new world elements.
- **Form**: A4 paged PDF via Paged.js; one numbered section start per page;
  dark everywhere except the documented print-inverted checklist; footers and
  counters unchanged; no section-order or structure change.

Recorded at the plan 023 direction pick, while the since-removed Impeccable
skill supplied detector input: Inter stays as the print face and the dark
ground stays, both consciously kept against that skill's bans (its
`overused-font` findings on Inter declarations and its dark-ground penalties
were known noise for report HTML). The `monotonous-spacing` finding was not
kept: the rhythm rules in section 2 are its fix.

## 1. Why the previous approach failed

The design was authored in Claude Design against a mock dataset of 14 findings,
2 render-diff pages and 5 aggregated performance rows. It was delivered as a
flattened HTML export whose layout depended on a `<doc-page>` web component that
does not exist in this repo, and whose page numbers were literal strings
(`Page 10 / 16`) written into the markup.

Reproducing that export from a screenshot is impossible in principle, because
the export encodes no rule for what happens when a list is longer than the mock.
A real audit produces 100 findings and 20 performance rows. Every attempt to
match the render visually fixed one page and broke another.

Two things fix it permanently, and both are below: a real paged media engine,
and an explicit per section data contract.

## 2. Pagination and page composition

Paged.js, run in the Playwright page before printing. Not Chromium print CSS
alone: Chromium ignores `@page` margin boxes, which is where the footer and the
page counter live.

```
render HTML -> load in Playwright -> await document.fonts.ready
            -> run Paged.js -> await pagedjs polyfill completion
            -> page.pdf({ printBackground: true, margin: 0 })
```

Rules:

- No page number may appear in markup. `counter(page)` and `counter(pages)` in
  the `@top-right` margin box only.
- The footer text comes from `.footer-source` via `string-set`, once.
- `margin: 0` in the pdf options. Horizontal page padding is
  `.sheet { padding: 0 18mm }`; the vertical 18mm lives on `@page` margins
  (the cover's `@page cover` carries a bottom margin only, so its gradient
  bleeds to the top edge).
- `printBackground: true` and `print-color-adjust: exact`, or the dark ground
  does not print.
- Inter is self-hosted in `packages/report/src/fonts` with `font-display: block`.
  No CDN, no `swap`. A swap during pagination changes measured heights and
  produces different page breaks on every run.
- Every numbered section's `.sheet` starts on a fresh physical page: exactly
  one numbered section start per page. The standalone sheets are the cover, the
  metadata and severity-scale sheet, the contents, the printable checklist, and
  the technical appendix opening; they never share a sheet with another
  numbered section.
- Sparse numbered pages are an accepted executive-reading choice, not a
  defect. The former 80-percent-empty and three-sections-per-page invariants
  are retired (2026-08-30 executive review).
- The glossary is the final section in the PDF and the technical appendix is
  second to last, the appendix's rows flowing continuously after its opening
  page: findings do not each start a page, and no group-level
  `break-inside: avoid` is added (trade-off 17). This reverses the 2026-08-30
  appendix-last call, on the operator's 2026-09-01 decision that a glossary
  is a reference the reader reaches for last, after the technical detail
  (trade-off 44 as amended; plan 024). Stable DOM section IDs do not encode
  reading order.
- A section heading and introduction stay with the first bounded content item.
  This protects a heading inside its own page; it never merges two numbered
  sections onto one page.
- There is no page-count failure range. A report above 60 pages renders
  successfully and returns a warning to the CLI and dashboard; no page count
  fails the render. Blank interior pages and duplicated fragments remain hard
  failures.

Front matter is composed, not packed (plan 023). Both sheets read as
two-act pages: the content act, then a deliberately placed closing act,
then quiet ground. A front-matter sheet that ends when its last field runs
out is a defect, not minimalism:

- **Cover**: the radial glow and the centered kicker/title/question block
  own the upper half (hero block `flex:1.4`); the closing group (centered
  symmetric-fade accent rule, report type line, date and Odysseus
  signature) sits at roughly two-thirds page height; a `flex:1` quiet
  spacer closes the sheet. The closing group is never pinned to the sheet
  bottom, and the accent rule is centered above the centered text, never
  left-anchored. The cover stays minimal by contract: no fields return
  from the metadata sheet.
- **Metadata sheet**: the fact grid carries the audit identity fields;
  the risk scale is the sheet's closing band, full width below a fading
  hairline, pulled down by `margin-top:auto` in a flex column with a
  fixed quiet spacer after it, so it lands around two-thirds page height
  regardless of how tall the grid wrapped.
- The sparse-pages rule below covers numbered sections only. Front matter
  is governed by this composition rule instead.

Vertical rhythm is a role ladder, not one dominant value (the plan 023 fix
for the detector's monotonous-spacing finding; values in
`report-design-tokens.md`):

- **Tight** (`--space-1`/`--space-2` and the 4px/6px micro literals):
  inside a related group - badge paddings, card-internal gaps, table cell
  tiers.
- **Medium** (`--space-3`/`--space-4`): between siblings of one component
  - field label to value, tile-to-tile gaps, TOC rows.
- **Generous** (`--space-6`/`--space-8`): between sibling components -
  card-to-card, tile-block separations, TOC group labels.
- **Sheet-level** (`--space-12`): between major blocks on one sheet -
  the section-head cushion above a section start, appendix category
  blocks, the cover's rule-to-type gap.
- The section-head h2 carries a **per-section** gap, not a uniform one:
  tight (`--space-2`) over table-led sections (priorités, check-list,
  preuves, performance, déclaration, annexe) so the heading binds to its
  table, `--space-3` for conformité, medium (`--space-4`) over prose-led
  sections (résumé, reste à traiter, exposition légale, méthodologie),
  generous (`--space-6`) over the airy sections (ouverture, chiffres,
  observations, prochaines étapes, glossaire). The values come from the
  flat design source per section.

The printable checklist is a deliberate dual-mode page, not drift. On
screen and in the document's own dark ground, section 05 renders like
every other sheet. Under print media, `paged.css` inverts that one
physical page to a `#f7f7f5` ground with `#161826` ink: the page labels
itself as one meant to be printed or captured alone, and a dark page
would either consume a full page of toner or fall to invisible
white-on-white under a printer driver that strips backgrounds. The
inversion has no basis in the flat mockup (whose checklist is dark) and
claims none: it is a print-medium decision. `print-inversion.e2e.test.ts`
(item 36) and `checklist-visual-regression.e2e.test.ts` (item 0.1 pixel
baseline) guard it; the print-safe severity-level color pairings live in
the `@media print` block and are re-derived against `#f7f7f5` at 4.5:1+
if the palette ever moves.

## 3. Per section data contract

The design's own information architecture is binding. Where it aggregates, the
report aggregates.

The canonical reading order equals the approved executive reading order:
minimal cover; metadata and severity-scale sheet; table of contents; situation,
complication, question opening; executive summary; audit scale and ranked
priorities; printable checklist and remaining work; detailed evidence sections;
action synthesis and re-audit recommendation; full legal reference;
methodology; technical appendix; glossary, always last (plan 024's 2026-09-01
reversal of the original appendix-last call). The cover is
minimal: commercial identity, the generic decision question, the concise
report type (accessibility, performance, SEO, GEO), the audit date, and the
Odysseus signature. Site metadata, the legal name, and the severity scale live
on sheet two. The `#` column below shows the reading-order position; display
numbers are computed live from whichever sections are included, and stable DOM
section IDs do not encode reading order.

| # | Section | Rule | Cap |
| --- | --- | --- | --- |
| cover | Couverture | minimal: commercial identity, decision question (resolved preparation question; safe generic fallback when no preparation exists), report type, audit date, Odysseus signature | 1 sheet |
| metadata | Fiche méta et sévérité | site audited, audit date, pages visited, report language, audited standard and scope, legal name when present, severity scale with basis note | 1 sheet |
| toc | Sommaire | one row per section, grouped under seven narrative groups: executive context, decisions and actions, detailed evidence, legal reference, method and vocabulary, technical appendix, glossary | 16 rows |
| 01 | Ouverture (situation, complication, question) | opening and reading guide; the question is the resolved preparation question or the safe generic fallback, no client-specific claim beyond what preparation explicitly provides | fixed |
| 02 | Résumé exécutif | prose + jump links | 3 links |
| 03 | L'audit en chiffres | 4 tiles + severity split + category split | fixed |
| 04 | Priorités classées | one card per theme | 6 themes, may flow to 2 sheets |
| 05 | Check-list | one row per theme, same 6 | 1 sheet |
| 06 | Reste à traiter | findings outside the ranked priorities, grouped by domain and rule, linked to appendix ids | flows |
| 07 | Observations | 2 prose blocks | fixed |
| 08 | Conformité | one row per failing WCAG criterion | flows |
| 09 | Preuves de rendu | **bars only, no screenshots** | 3 worst pages by `missingPct` |
| 10 | Mesures de performance | **5 aggregated medians, no per page table** | 1 sheet |
| 11 | Déclaration | one row per failing criterion | flows |
| 12 | Prochaines étapes | action synthesis, responsible roles, and re-audit recommendation | 1 sheet |
| 13 | Exposition légale | 2 cards + paragraph, from `assessObligations()` only | fixed |
| 14 | Méthodologie | fixed prose | 1 sheet |
| 15 | Annexe technique | all finding, URL, selector, occurrence, and provenance detail | flows |
| 16 | Glossaire, section finale | 9 entries | 1 sheet |

Plan 020 adds two bounded blocks without changing this order or the visual
tokens:

- Section 02 may contain one conditional **indicative improvement
  opportunity** after the decision prose and before the priority links. The
  block contains one conservative amount and its adjacent citation. It is
  absent, with no placeholder, when strict eligibility is not met. No priority
  card contains a euro estimate.
- Section 13 may contain one conditional **general legal reference** after the
  client facts and criteria. It reproduces the existing deterministic EUR
  7,500 EAA sentence only when the EAA context is present and keeps it visually
  separate from client facts, finding counts, commercial opportunity, and
  prices. It is absent in LCEN-only and otherwise non-applicable contexts.

Four decisions worth stating explicitly, because the previous output diverged on
each of them:

**09 carries no screenshots.** The design replaced the before and after rasters
with two proportional bars and a one line caption. That is deliberate: 20 pages
of paired full width screenshots is what produced the blank slabs and the
orphaned `Vue brute / Vue affichée` captions. Screenshots stay in the technical
export. When more than 3 pages fail, set `renderOverflowText`, for example
`5 autres pages présentent le même écart, détail dans l'export technique.`

**10 is aggregated.** Median LCP, TBT, FCP, Speed Index and CLS across the whole
scan, with threshold and status. The 20 row per page table with full URLs is
removed from the PDF. It is the correct place for it to be removed: full URLs in
a 130px column are what broke words mid-token.

**16 enumerates what matters and groups the rest.** Every finding of severity
`critical`, `serious` or `moderate` appears by id, with pages, occurrences and
selector. `minor` findings are grouped by `ruleId` with counts. The phrase
"disponible sur demande dans l'export technique" is removed: it reads as
withholding. The design's own wording is used instead.

**Severity labels are Critique / Sérieux / Modéré / Mineur.** `serious` renders
as `Sérieux`, not `Majeur`. This is a label map change only. The enum in
`packages/core/severity.ts` is untouched, and this also closes the terminology
drift between executive prose and canonical labels.

Canonical maps, taken from the design source:

```ts
const SEVERITY = {
  critical: { label: 'Critique', color: '#d97b82', bg: '#34232a' },
  serious:  { label: 'Sérieux',  color: '#dba36c', bg: '#362a1c' },
  moderate: { label: 'Modéré',   color: '#d6c96e', bg: '#35331c' },
  minor:    { label: 'Mineur',   color: '#b2b6ca', bg: '#292b31' },
};

const CATEGORY = {
  accessibility: { label: 'Accessibilité', color: '#9184d9', bg: '#2b2741' },
  performance:   { label: 'Performance',   color: '#7fa8d9', bg: '#1f2a38' },
  seo:           { label: 'SEO / légal',   color: '#6cbfae', bg: '#1c332e' },
  rendering:     { label: 'Rendu / JS',    color: '#9397ab', bg: '#292b31' },
};

const EFFORT = { low: 'Faible', medium: 'Moyen', high: 'Élevé' };
const IMPACT = { low: 'Faible', medium: 'Moyen', high: 'Élevé' };
const CATEGORY_ORDER = ['accessibility', 'seo', 'rendering', 'performance'];
```

## 4. Invariants, assertable in a test

Page count is deterministic once Paged.js runs, so these are checks, not
opinions. `packages/report` should assert them against the stress fixture.
Sparse numbered pages are expected under the one-section-per-page rule and are
not a failure; the retired 80-percent-empty and three-sections-per-page checks
must not come back.

1. No `<img>` renders taller than 90mm.
2. Every numbered section starts on a fresh physical page: exactly one
   numbered section start per page.
3. The standalone sheets (cover, metadata sheet, contents, printable
   checklist, appendix opening) never share a sheet with another numbered
   section.
4. No blank interior pages and no duplicated fragments.
5. Every non-cover sheet has the footer string and a `Page n / N` counter.
6. `N` in the counter equals the real page count.
7. No text node overflows its container horizontally.
8. There is no page-count failure range. A stress-fixture or client report
   above 60 pages renders successfully and returns a warning; it never fails.
9. The generated PDF passes axe-core and carries a bookmark outline.

## 5. Deterministic render-QA contract

The PDF renderer is the sole delivery authority. After the final Paged.js
preview and any bounded appendix-header repair, it runs this checklist before
Chromium emits PDF bytes. These are structural checks, not a visual-quality
score:

- **Delivery blockers:** Paged.js's `Layout repeated` bailout, a blank
  non-cover physical page, a duplicated declared atomic block, or a declared
  bounded `data-render-atomic` unit spanning physical pages.
- **Regression fixtures only:** synthetic Paged.js boundary-pressure fixtures
  and the stable checklist print pixel baseline. A human visually reviews any
  intentional baseline replacement before it is committed.
- **Operator observation only:** sparse pages, page count, visual taste, and
  copy density. None is a delivery failure.

Only components whose maximum content is bounded by their template may opt in
with `data-render-atomic`, and every opt-in receives a physical-page pressure
fixture. `data-render-atomic="start-here"` protects the three-row executive
summary jump panel that previously split at a page boundary in the Villas Foch
report. Appendix groups, themes, and any other potentially page-tall content
remain splittable.

A generic painted-content overflow gate remains deliberately uninstalled. The
plan 033 evaluation found a normal PDF text-integrity fixture whose ordinary
Paged.js fragment exceeded a broad `<div>` geometry selector. That is a false
positive and triggers the plan's stop rule: no overflow blocker returns unless
a selector and box rule are demonstrated against both that fixture and the
appendix continuation cases.

## 5. Stress fixture

Layout is never iterated against a real client scan. `packages/report/fixtures/stress.findings.json`
must contain, at minimum:

- 120 findings, of which at least 95 `minor`
- 8 themes, so the 6 cap is actually exercised
- 12 render-diff failures, so the 3 cap is exercised
- one finding whose selector is 180 characters with no break opportunity
- one page URL of 140 characters
- one theme title of 120 characters
- one audit with zero failing WCAG criteria, to check the empty branch of 07 and 10
- one audit with zero findings

If the stress fixture renders correctly, haaitza and hotel-palais-gallien render
correctly. The reverse has never been true.

## 6. Report preparation and personalization (plan 019)

One preparation aggregate (`packages/core/src/report-preparation/`) and one
operator workflow, the dashboard's **Prepare report** card, own everything
personalized in this report. Rendering consumes a bounded, render-ready
preview; it never queries storage or derives preparation policy.

- **Typed vocabularies, not free text.** Situation, trigger, stakeholder
  role, hook family, journey, and journey-step state are closed vocabularies
  with French and English copy tables. Stored operator text is trimmed,
  length-bounded data, escaped at render time, and never becomes a model or
  system instruction.
- **Bilingual fallbacks are independent per language.** A missing custom
  question, `other` note, or any other localized value falls back to the safe
  generic copy for that language only; nothing is machine translated and
  nothing is copied from the other language. Without preparation data the
  report renders exactly as before (the byte-identical generic question).
- **The opening question** on the cover and in section 01 is the resolved
  preparation question: typed context plus safe copy, replaced per language
  by an operator override where one exists.
- **Journeys are evidence-bound and tri-state.** Every rendered journey step
  reads exactly one of **issue observed**, **no issue detected**, or **not
  evaluated**; `no-issue-detected` requires positive evidence the relevant
  deterministic check ran. Only confirmed journeys render; unsupported or
  removed journeys do not.
- **Writing versions are candidate-first.** A paid report renders the
  selected French/English analysis pair resolved by the store selector;
  regeneration produces a previewable candidate and selection changes only on
  explicit approval. Existing stored titles are unchanged until that explicit
  regeneration.

The full trade-off record, including rejected alternatives, is
`docs/decisions/trade-offs.md` entry 62.

## 7. Working rule

Do not iterate on this design by comparing PDF screenshots. If output diverges
from `report.reference.html`, diff the DOM, not the pixels.
