# Report design system

Authoritative spec for the client-facing PDF produced by `packages/report`.
Read this before touching anything under `packages/report/src/template` or
`packages/report/src/styles`.

The visual design is not open for reinterpretation. It exists as source, not as
a screenshot to approximate:

| Artifact | Path | Status |
| --- | --- | --- |
| Design system CSS | `packages/report/src/styles/nocturne.css` | locked, do not edit |
| Paged media layer | `packages/report/src/styles/paged.css` | edit only per this doc |
| Reference template | `packages/report/src/template/report.reference.html` | structural source of truth |

If output does not match the reference, the template binding is wrong. Do not
fix it by changing colours, sizes, spacing or inline styles.

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

## 2. Pagination

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
- `margin: 0` in the pdf options. All page padding is `.sheet { padding: 18mm }`.
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
- The technical appendix is the final section in the PDF, and its rows flow
  continuously after its opening page: findings do not each start a page, and
  no group-level `break-inside: avoid` is added (trade-off 17). Stable DOM
  section IDs do not encode reading order.
- A section heading and introduction stay with the first bounded content item.
  This protects a heading inside its own page; it never merges two numbered
  sections onto one page.
- There is no page-count failure range. A report above 60 pages renders
  successfully and returns a warning to the CLI and dashboard; no page count
  fails the render. Blank interior pages and duplicated fragments remain hard
  failures.

## 3. Per section data contract

The design's own information architecture is binding. Where it aggregates, the
report aggregates.

The canonical reading order equals the approved executive reading order:
minimal cover; metadata and severity-scale sheet; table of contents; situation,
complication, question opening; executive summary; audit scale and ranked
priorities; printable checklist and remaining work; detailed evidence sections;
action synthesis and re-audit recommendation; full legal reference;
methodology and glossary; technical appendix, always last. The cover is
minimal: commercial identity, the generic decision question, the concise
report type (accessibility, performance, SEO, GEO), the audit date, and the
Odysseus signature. Site metadata, the legal name, and the severity scale live
on sheet two. The `#` column below shows the reading-order position; display
numbers are computed live from whichever sections are included, and stable DOM
section IDs do not encode reading order.

| # | Section | Rule | Cap |
| --- | --- | --- | --- |
| cover | Couverture | minimal: commercial identity, generic decision question, report type, audit date, Odysseus signature | 1 sheet |
| metadata | Fiche méta et sévérité | site audited, audit date, pages visited, report language, audited standard and scope, legal name when present, severity scale with basis note | 1 sheet |
| toc | Sommaire | one row per section, grouped under six narrative groups: executive context, decisions and actions, detailed evidence, legal reference, method and vocabulary, technical appendix | 16 rows |
| 01 | Ouverture (situation, complication, question) | generic opening and reading guide, no client-specific claim | fixed |
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
| 15 | Glossaire | 9 entries | 1 sheet |
| 16 | Annexe technique finale | all finding, URL, selector, occurrence, and provenance detail | flows |

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

## 6. Working rule

Do not iterate on this design by comparing PDF screenshots. If output diverges
from `report.reference.html`, diff the DOM, not the pixels.
