# Report design system

Authoritative spec for the client-facing PDF produced by `packages/report`.
Read this before touching anything under `packages/report/src/template` or
`packages/report/src/styles`.

The visual design is not open for reinterpretation. It exists as source, not as
a screenshot to approximate. The current baseline is the 2026-09-11 plan 039
direction pick (operator-picked direction "carry the public site's design
language": the site's dark near-navy scheme, sky accent, and Avenir Next
replace the plan 023 Nocturne identity - ground `#161826`, violet accent,
Inter - while plan 023's composition contracts are preserved unchanged). A
future revision re-runs the same gate; it does not happen inline:

| Artifact | Path | Status |
| --- | --- | --- |
| Design system CSS | `packages/report/src/styles/nocturne.css` | token source of truth; revise only per this document, plan 039 baseline |
| Paged media layer | `packages/report/src/styles/paged.css` | edit only per this doc |
| Reference template | `packages/report/src/template/report.reference.html` | structural source of truth |

**Plan 071 reference showcase seam.** The permanent `/exemple-audit` PDF uses
this exact paid-report view model, template, CSS and paged renderer. Its adapter
may supply only a detached synthetic bundle and the short disclosure printed on
the cover; it does not fork layout or findings semantics. The disclosure is:
"Exemple de rapport. Les éléments permettant d'identifier l'établissement, son
site et ses données administratives ont été remplacés. La structure, le niveau
de détail et le type de constats correspondent au livrable." Source screenshots
and other image evidence are refused before rendering. The public artifact is
therefore a report-shaped showcase, not an unaltered client report.

If output does not match the reference, the template binding is wrong. Do not
fix it by changing colours, sizes, spacing or inline styles.

## Direction contract (plan 039, recorded 2026-09-11)

- **Thesis**: the report and the current v3 outreach preview join the public
  site's identity, the evidence desk's dark register. Identity changes,
  structure does not: same sections, same composition contracts, same
  pagination meaning, now wearing the site's near-navy world, ink ladder,
  sky accent, typeface, and dossier card motif. Plan 023's composition
  refinement (two-act front matter, per-section heading rhythm, the
  `--space-12` sheet-level step) is preserved unchanged.
- **Own-world**: dark near-navy from the site's dark scheme: ground
  `#0e141c`, raised surfaces `#16202c`, ink `#e9eef5` / `#b6c1ce` /
  `#909cab`, hairline dividers at 13 percent ink, sky accent `#38bdf8`
  (the site's own dark-mode accent, Tailwind sky-400), Avenir Next
  self-hosted (400/500/600/700 plus a real 400 italic for `.cross`;
  operator-licensed for PDF and bucket-served web embedding, confirmed at
  the plan 039 direction pick). The dossier marks (finding red `#dc2626`,
  evidence = the accent, signal green `#43aa8b`) appear only as the
  finding cards' row dashes and the preview proof-card mark: decoration,
  never text, never severity (DESIGN.md, "The Dossier Rule Set"). The one
  deliberate exception stays: section 05's print inversion to `#f7f7f5`.
- **Story**: the same reading path as under plan 023, opening on a
  sky-navy glow instead of violet, finding cards reading as the site's
  dossier cards, the printable checklist still handing over as the one
  light page, on purpose.
- **First viewport (cover)**: the radial glow is recomposed in the
  sky/navy family (a deep sky-navy bloom on the near-navy ground); the
  mid-page title block and the two-thirds closing composition (accent
  rule, report type, date, Odysseus signature) are unchanged in
  structure. No new world elements.
- **Form**: A4 paged PDF via Paged.js; one numbered section start per
  page; dark everywhere except the documented print-inverted checklist;
  footers and counters unchanged; the outreach preview renders fixed dark
  matching the PDF (no `prefers-color-scheme` switch; its PDF export
  prints through the same `#f7f7f5` block); no section-order or structure
  change.

Recorded at the plan 039 direction pick, from the read-only evidence pack
of 2026-09-11 (`.impeccable/critique/2026-09-11T14-30-00Z__packages-report/`).
The Impeccable skill's detector input, per trade-offs.md#79: the dark
ground stays, consciously kept against the skill's dark-ground penalties.
The former Inter keep is dissolved: Avenir Next replaces it, so the
`overused-font` ignore for `packages/report/**` in
`.impeccable/config.json` is dead and is removed by this plan (binding
decision 9). The `kicker-above-heading` ban is consciously not applied to
the report's numbered h6 eyebrow (`NN · SECTION NAME`, or `NN` alone
above the canonical title when a section has a single title, issue #336):
it is the section-header navigation device and its text is locked content; the
preview's hero label string also stays, but its treatment is de-kickered
(sentence case, body size, muted). The `skipped-heading` convention (h6
eyebrow markup) is out of scope for visual revisions. The
`monotonous-spacing` finding remains not kept: the rhythm rules in
section 2 are its fix.

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
- Avenir Next is self-hosted in `packages/report/src/fonts` (copied from the
  operator's licensed kit, never imported from `packages/site`) with
  `font-display: block`.
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
- Exception (issue #311): a numbered section or annex category that the
  first layout shows fits whole in the room under its predecessor follows it
  (`sheet-flow` / `appendix-category-flow`, marked by `pdf.ts`) as one
  unbreakable block, so a single paragraph or a one-row category no longer
  takes a page of its own. Standalone sheets never flow or receive one.
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

- **Cover**: the radial glow and centered kicker/title/question block own the
  upper half. The kicker sits in a faint bordered tint, the client identity is
  the dominant tightly set title, and the question follows at a quieter
  measure. The report-type line sits at roughly two-thirds page height between
  two short hairlines, with the date and Odysseus signature beneath it and
  quiet ground closing the sheet. This accepted 2026-09-13 Impeccable polish
  supersedes the former detached symmetric-fade rule; the rule now belongs to
  the report-type line, so their alignment cannot drift. The cover stays
  minimal by contract: no fields return from the metadata sheet.
- **Metadata sheet**: the page opens, under its heading, with a centered
  vertical signal: the deterministic letter grade first, inside two
  concentric severity-colour strokes, its mandatory disclaimer directly
  below, then the three-point qualitative scale and its basis notes in a
  restrained hairline band. The fact grid with the audit identity fields
  follows as the reference block. The circles are strokes attached to the
  badge itself, never independently positioned decoration. A flexible quiet
  spacer after the grid keeps the composition stable in the PDF.
- **Outreach preview**: its cover calls the paid report's canonical cover
  renderer, with the preview's recipient and scan date bound into the same
  slots. Current v3 deliberately drops the historical v2 preview-only
  grade/risk hero so the public document cannot tell a second top-level risk
  story beside the paid report. It opens instead on measured results and then
  three visibly ranked priority cards selected through the report's exact
  priority view model. The four severity totals retain the full report's dot,
  label, count, and plain-language meaning anatomy. Historical v2 HTML keeps
  its old scorecard unchanged. This is a source-level reuse contract, not a
  screenshot match.
- **Outreach preview sections** (accepted Impeccable direction, 2026-09-16):
  the post-cover sections carry the report's current section system, not
  bordered section cards. Each section sits on the page ground under the
  report's section head (heading over a hairline with a 72px accent
  segment, no numbered eyebrow: the preview has no section numbering to
  navigate by). Raised surface tiles and cards appear only where a figure or
  an item needs holding: the three coverage counts, the totals pair led by
  the accent-tinted findings tile, the severity grid (four across on
  desktop, two on phones), and the three ranked priority cards (meta row first, then
  the dossier mark and title). The legal block raises the regime criterion
  as a reference card, keeps the registry sentence as body text, and sets
  the counsel caveat as fine print. The offer closes with the reply button
  and the offer link side by side.
- **Outreach preview scroll cue**: on screen only, a ringed chevron link
  between the decision question and the report-type line tells a reader
  landing on the full-height cover that the document continues, and jumps
  to measured results. It drops three times after load and never moves under
  reduced motion; print hides it. The paid report's cover never renders it.
  At phone widths the report-type line drops its side hairlines and binds
  each separator dot to the preceding category so no line opens with one.
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

The PDF is generated under print media, so every reader sees that page
light, usually on screen between two dark pages. Issue #317 (2026-09-16)
decided to keep the inversion and mark the page as a deliberate insert
rather than align it with the dark theme: an outlined "Encart à imprimer" /
"Printable insert" tag sits at the right of the eyebrow row (adding no
height, since the page must stay on one sheet), and the intro states that
the light background is for printing.

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
| metadata | Fiche méta et sévérité | site audited, audit date, pages visited, audited standard and scope, legal name when present; centered letter grade with disclaimer, followed by severity scale with basis note | 1 sheet |
| toc | Sommaire | one row per section, grouped in document order (issue #336): Vue d'ensemble, Actions prioritaires, Résultats détaillés, then the self-named Cadre réglementaire and Prochaines étapes rows standing without a repeated group label (issue #333), then Annexes | 17 rows |
| 01 | Présentation du diagnostic (situation, complication, question) | opening and reading guide; the question is the resolved preparation question or the safe generic fallback, no client-specific claim beyond what preparation explicitly provides | fixed |
| 02 | Synthèse | prose + jump links | 3 links |
| 03 | Résultats du diagnostic | editorial scoreboard with total findings as the lead measure, 3 supporting number tiles, disclosure notes, severity split, and category split | fixed |
| 04 | Priorités de correction | one card per theme; every theme admitted to this existing six-card section carries the deterministic action-level tag Priorité, using the existing tag treatment | 6 themes, may flow to 2 sheets |
| 05 | Plan d'action | one row per theme, same 6 | 1 sheet |
| 06 | Autres constats | findings outside the ranked priorities, grouped by domain and rule, linked to appendix ids; deterministic action level is Important for critical/serious rule groups and Amélioration for moderate/minor groups, alongside the existing severity label | flows |
| 07 | Observations complémentaires | 2 prose blocks | fixed |
| 08 | Conformité WCAG 2.2 AA | one row per failing WCAG criterion | flows |
| 09 | Rendu sans JavaScript | **bars only, no screenshots** | 3 worst pages by `missingPct` |
| 10 | Performance | **5 aggregated medians, no per page table** | 1 sheet |
| 11 | Projet de déclaration d'accessibilité | one row per failing criterion | flows |
| 12 | Cadre réglementaire | 2 cards + paragraph, from `assessObligations()` only | fixed |
| 13 | Prochaines étapes | action synthesis, responsible roles, and re-audit recommendation; closes the narrative after the legal reference (issue #333) | 1 sheet |
| 14 | Méthodologie et limites | fixed prose | 1 sheet |
| 15 | Annexe technique — constats détaillés | all finding, URL, selector, occurrence, and provenance detail | flows |
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
  critical: { label: 'Critique', color: '#d97b82', bg: '#262028' },
  serious:  { label: 'Sérieux',  color: '#dba36c', bg: '#272526' },
  moderate: { label: 'Modéré',   color: '#d6c96e', bg: '#262a26' },
  minor:    { label: 'Mineur',   color: '#b2b6ca', bg: '#222731' },
};

const CATEGORY = {
  accessibility: { label: 'Accessibilité', color: '#7dd3fc', bg: '#1b2b37' },
  performance:   { label: 'Performance',   color: '#7fa8d9', bg: '#1c2633' },
  seo:           { label: 'SEO / légal',   color: '#6cbfae', bg: '#19292e' },
  rendering:     { label: 'Rendu / JS',    color: '#909cab', bg: '#1a2530' },
};

const EFFORT = { low: 'Faible', medium: 'Moyen', high: 'Élevé' };
const IMPACT = { low: 'Faible', medium: 'Moyen', high: 'Élevé' };
const CATEGORY_ORDER = ['accessibility', 'seo', 'rendering', 'performance'];
```

Severity and category tile fills are the documented 0.12-alpha tint of each
pair's text colour over the ground `#0e141c`; the text colours are the
plan 023 severity hues re-verified against the new tints (worst pair
5.38:1, critical). The four severity text hexes deliberately do not match
the dashboard's severity shades; that divergence predates this baseline
and is recorded in the trade-off entry. The print block's severity-level
pairs (checklist) are unchanged: they are derived against `#f7f7f5`,
which this baseline does not move.

The finding cards (section 04 priority/theme cards) carry the site's
dossier card treatment: raised surface, hairline row separation, and a
short round-capped dash (18px by 3px) before each evidence row's label -
finding red on the problem row, the accent on the observed-evidence row,
the signal green on the action row. The dashes are decoration in the
site's own idiom (DESIGN.md, "The Dossier Rule Set"): the row labels
carry the meaning, the dashes never encode severity, and they appear
nowhere else in the document.

Since 2026-09-16 the priority card is laid out on one two-column axis: a
136px left rail carries the rank as a plain 44px numeral (never a circled
digit, which sits visibly low in its ring) and every row label, and the
right column carries the reading text at 13.5px on a measure of about 70
characters. The decision facts (Complexité, Impact, Pages concernées, and
Conformité when there is a status to state) sit directly under the title,
each label and value one unbreakable unit. The evidence rows follow,
divided by hairlines, and a closing context list (conformity requirement,
reference figure, finding references) keeps the same rail. A row label is
positioned out of the row's small, unbreakable lead block (a paragraph, or
a subhead with its first list item), so Paged.js always prints the label
beside the row's opening text; a card or row continued on a new page drops
the divider that would otherwise double the card's top edge.

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
10. No page ends on a heading: the last painted element on a physical page is
    never a heading whose content starts on the next (issue #303). The annex's
    category blocks take a forced page break rather than a keep-with-next,
    since Paged.js honours only the former; see paged.css's note.

## 5. Deterministic render-QA contract

The PDF renderer is the sole delivery authority. After the final Paged.js
preview and any bounded appendix-header repair, it runs this checklist before
Chromium emits PDF bytes. These are structural checks, not a visual-quality
score:

- **Delivery blockers:** Paged.js's `Layout repeated` bailout, a blank
  non-cover physical page, a duplicated declared atomic block, a declared
  bounded `data-render-atomic` unit spanning physical pages, or a page whose
  last painted element is a heading (issue #303).
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

- **Bounded operator text, not free prompts.** The only operator input is an
  optional per-language custom cover question. Hook family is a closed
  vocabulary derived from findings, with French and English copy tables.
  Stored operator text is trimmed, length-bounded data, escaped at render
  time, and never becomes a model or system instruction.
- **Bilingual fallbacks are independent per language.** A missing custom
  question falls back to the safe generic copy for that language only;
  nothing is machine translated and nothing is copied from the other
  language. Without preparation data the report renders exactly as before
  (the byte-identical generic question).
- **The opening question** on the cover and in section 01 is the operator's
  custom question for that language where one exists, otherwise the generic
  question.
- **The audience table lists roles only.** Named contacts belong to the
  prospect record, not the report.
- **French is the canonical writing selection (Plan 067).** A paid report
  requires one selected French analysis. English is an optional attachment to
  that same findings/structure provenance and is generated only by the
  explicit operator action. Legacy bilingual selections remain readable. The
  renderer and this design system are otherwise unchanged: English does not
  introduce a second layout or a parallel report template.

The full trade-off record, including rejected alternatives, is
`docs/decisions/trade-offs.md` entry 62.

## 7. Working rule

Do not iterate on this design by comparing PDF screenshots. If output diverges
from `report.reference.html`, diff the DOM, not the pixels.
