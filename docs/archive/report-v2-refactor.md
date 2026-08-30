# Odysseus report v2: audit and refactor spec

**Implemented 2026-08-07**, in one session, both parts together rather than
the two-session split Part 5 originally proposed. Part 3 and Part 4 below
are both done: real regenerated reports against the sas-fernande.fr and
haaitza.com fixtures were checked (page count, file size, `pdfinfo`-style
tag/outline verification via raw PDF inspection, since `pdfinfo` itself
was unavailable in that session), and `packages/report`'s new axe-core
self-test (3.5/R8) passes with zero violations against the real rendered
HTML. See `docs/product/odysseus-project-brief.md` milestone 6.2 for the
summary. This document is kept as the defect record and the design
rationale, not rewritten into past tense throughout.

Source document: `2026-08-06T21-15-31Z-fr.pdf`, the first client-facing report, generated
against haaitza.com on 6 August 2026. 30 pages, 30.7 MB, French, 20 pages scanned,
103 findings.

Suggested repo path: `docs/archive/report-v2-refactor.md`.

Companion artifact (removed 2026-08-16): `report-v2-prototype-haaitza-fr.html`, a working
prototype of the target output built from the real haaitza data, rendering to a 20 page,
670 KB, tagged PDF. It was a light-theme design and was deleted once the report's dark,
GlassWire-inspired reskin (`docs/product/odysseus-project-brief.md`, "Post-7.1: scan
concurrency and reskin") superseded it; `packages/report/src/template/report.css` is the
current design source of truth. The numbers below were verified against that prototype
at the time, not asserted: see "Verification performed" at the end.

---

## Part 1: consolidated defect list

Forty defects, grouped. Items marked `[NEW]` were found in the second pass and were not
in the first. Items marked `[CORRECTED]` revise a first-pass conclusion.

### Group A: credibility. Things a competent prospect would notice.

**A1. The top priority is driven by two pages that are not really pages.**
The v1 ranking puts a theme built on `/social/facebook/` and `/social/instagram/` at
number 1. Both are wrapper pages that embed Meta content. Screenshot evidence from the
report itself confirms it: the raw view of the Facebook page is empty except for a
Facebook logo, the rendered view is the hotel's Facebook page under a Meta cookie
dialog. Recommending SEO work on a third-party embed is the single most damaging thing
in the document.

**A2. Three of eleven themes are driven by those same two pages.** Themes 1, 5 and 10.
A quarter of the client's reading time is spent on 10 percent of the crawl, and the
least actionable 10 percent.

**A3. The report recommends indexing pages that are deliberately `noindex`.** The
`is-crawlable` finding covers the CGU, the cookie policy and the privacy policy. Telling
a hotel to index its legal pages is actively wrong advice, not merely unhelpful.

**A4. `[NEW]` Performance advice contradicts the performance data.** Total Blocking Time
runs to 16,490 ms on the homepage. That is a JavaScript execution problem. The v1 advice
leads with images and CSS. A developer reading the report will follow the advice and see
no improvement.

**A5. `[NEW]` A one-line site-wide fix ranks below a missing meta-description.** The
blocked-zoom finding (`meta-viewport`, WCAG 1.4.4, 18 pages, one line of markup) is
ranked 11th, below a missing meta-description on a social wrapper page. Effort and
impact are both being ignored by the ranking.

**A6. `[NEW]` The two largest findings by volume are invisible.** `link-name` with 180
occurrences on the sitemap page, and `crawlable-anchors` with 203 occurrences in the
footer, are buried in the appendix at the same visual weight as a single-occurrence
minor. These are the two facts most likely to make a prospect act.

**A7. 46 second LCP is reported with no context.** No throttling profile is stated, so
the number reads as either broken tooling or an unbelievable exaggeration. Both
readings destroy trust. It is a correct Lighthouse mobile-throttled measurement and
needs to say so.

**A8. `[NEW]` A report about web performance ships as a 30.7 MB PDF.** Two homepage
screenshot strips of roughly 13,000 pixels height account for 28.7 MB of it, drawn
across four PDF pages, for a page whose render diff is 0 percent. It exceeds the
attachment limit of most mail servers.

**A9. `[NEW]` No traceability between narrative and evidence.** Themes cite no
`findingId`, the appendix exposes no `findingId`. A client cannot get from "priority 3"
to the underlying rows, and neither can their developer.

### Group B: structure and information architecture

**B10. No summary statistics.** Nowhere does the document state 20 pages, 103 findings,
8 critical, 20 major, 15 moderate, 60 minor. The reader has no sense of scale before
being asked to read eleven themes.

**B11. Sixty minor performance rows outrank four accessibility legal rows visually.**
The appendix is dominated by `unused-css-rules` and friends. The four rows that
constitute a conformance gap are lost in it.

**B12. `[NEW]` Appendix rows for the same rule are not adjacent.** They are ordered by
dedupe-key hash, so the fourteen `link-name` findings are scattered through the table
interleaved with unrelated rules.

**B13. Twelve visually identical appendix rows.** All fourteen `link-name` findings
render as the same title, the same severity, the same page count. There is no selector
column, so nothing distinguishes them. The reader concludes the tool is broken.

**B14. `[NEW]` "Par o\u00f9 commencer" repeats theme prose verbatim.** The block restates the
`businessImpact` of themes 1 to 3 word for word, then the quick-wins block repeats
theme titles again without dedupe. Three sections say the same thing.

**B15. `[NEW]` Methodology and limitations duplicate each other.** The 30 to 40 percent
automated-coverage passage appears twice, nearly verbatim.

**B16. `[NEW]` Methodology omits the crawl size.** The number of pages scanned, the
single most basic scope fact, is not stated anywhere in the document.

**B17. `[NEW]` Render diff character counts are computed but never rendered.**
`RenderDiffResult` carries `rawTextLength` and `renderedTextLength`. The template drops
them. The most concrete possible evidence is thrown away.

**B18. Screenshots are shown for pages with nothing to show.** The homepage pair is
included at 0 percent missing content, at a cost of 28.7 MB.

### Group C: the legal framing is invisible

**C19. The EAA and EN 301 549 are never named where it matters.** Accessibility findings
are presented as usability advice. The commercial argument for the whole service is
absent from the deliverable that is supposed to make it.

**C20. No conformance axis.** A WCAG failure and a slow image are rendered with the same
badge vocabulary. Non-conformance is a different kind of fact from an optimization and
needs a different visual channel.

**C21. No per-criterion rollup.** Seven WCAG 2.2 AA criteria are failing on 18 of 20
pages. The document never lists them together, so there is no page the client can hand
to a lawyer or an agency.

**C22. `[NEW]` The document overclaims nothing but underclaims everything.** There is no
statement of what the report does and does not assert about legal obligation. This cuts
both ways: it fails to convey risk, and it leaves Jules exposed if it ever does.

### Group D: layout and pagination

**D23. Random page breaks.** `break-inside: avoid` is applied at section level. A
section taller than a page cannot avoid breaking, so Chromium breaks it arbitrarily.
The primitive is correct, the granularity is wrong.

**D24. Table headers do not repeat across pages.** Consequence of D23: the wrapper
prevents `thead { display: table-header-group }` from taking effect.

**D25. No orphan and widow control.** Single lines stranded at page boundaries.

**D26. No page numbers, no table of contents.** A 30 page document with no way to
navigate it.

**D27. `[NEW]` English number formatting in a French document.** "16,490 ms" should be
"16 490 ms" with a narrow no-break space.

**D28. Mixed French and English in tables.** Rule IDs are exposed raw with no gloss.

**D29. `[CORRECTED]` A TOC with page numbers is not achievable in a single Chromium
pass.** The first-pass recommendation was wrong. Chromium cannot resolve page numbers
into TOC entries without a two-pass render. Use `page.pdf({ outline: true })` for PDF
bookmarks plus `displayHeaderFooter` for page numbers instead. Verified working: the
prototype produces a full bookmark tree derived from the heading hierarchy.

**D30. `[NEW]` A `position: fixed` print footer collides with repeated table headers.**
Found by rendering, not by reading: in Chromium a `position: fixed` element intended as
a running footer renders at the top of continuation pages and overlaps the repeated
`thead`. Use Chromium's `footerTemplate` instead and delete the CSS footer.

### Group E: the report's own accessibility

**E31. The PDF is untagged.** Confirmed by `pdfinfo`: `Tagged: no`. An accessibility
audit delivered as an inaccessible document is the single worst look available. A
screen-reader user cannot navigate it.

**E32. Screenshots have no alternative text.**

**E33. Severity is encoded by colour alone.** Fails the same criterion, 1.4.1, that the
report cites against the client.

**E34. No document language, no semantic heading structure, no reading order.**

**E35. `[NEW]` The report is never tested against the tooling it sells.** axe-core and
Playwright are already dependencies. Nothing runs axe against the report's own HTML.

### Group F: content and wording

**F36. Severity label "Important" is ambiguous** between "urgent" and "significant".

**F37. Effort and impact are prose words, not a scale.** Nothing sortable or scannable.

**F38. `[NEW]` Themes dump full page lists inline,** sometimes twenty URLs mid-paragraph.

**F39. `[NEW]` `nested-interactive` on the cookie policy page is almost certainly the
consent CMP widget.** The selectors would show this immediately; v1 hides selectors, so
the finding reads as inexplicable.

**F40. `[NEW]` Quick wins are not identified as such.** Four of the eight real themes are
low-effort. Nothing marks them.

---

## Part 2: requirements

**R1. Document order.** Cover, table of contents, statistics page, executive summary,
conformance summary, ranked priorities, observations, render evidence, performance
measurements, appendix, methodology.

**R2. Legal framing derived deterministically.** A theme is a conformance gap when its
findings satisfy `category === 'accessibility' && wcagCriteria.length > 0`. Computed in
template code, not asked of the LLM, not added to the locked `Theme` schema.

**R3. Conformance is a separate axis from severity.** Distinct badge, distinct colour,
distinct position in the card.

**R4. Severity badges carry a glyph.** Triangle, diamond, filled circle, hollow circle.
Legible in greyscale and to colour-blind readers. Addresses E33.

**R5. Appendix regrouped by rule, with a selector column.** Rows for one rule adjacent,
groups ordered by severity then total occurrences. Minor performance findings collapse
to an aggregate table. Every row carries its `findingId`.

**R6. Performance section states its throttling profile** and rates each metric against
published Core Web Vitals thresholds.

**R7. Pagination primitives at the right granularity.** `break-inside: avoid` on cards
and table rows only, never on sections; `break-after: avoid` on headings; orphans and
widows at 3; `thead` repeating.

**R8. The PDF is tagged, with alt text, semantic HTML, and a bookmark outline,** and is
tested with axe-core in CI.

**R9. Wrapper pages and legal-noindex pages are diverted, not explained.** See Part 4.

---

## Part 3: `packages/report` changes

### 3.1 `pdf.ts`

```ts
await page.pdf({
  path: outputPath,
  format: 'A4',
  printBackground: true,
  tagged: true,        // fixes E31
  outline: true,       // fixes D26, gives a bookmark tree from the headings
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: FOOTER_TEMPLATE,
  margin: { top: '15mm', right: '14mm', bottom: '20mm', left: '14mm' },
});
```

`tagged` and `outline` are both supported in Playwright 1.49 and verified working here.
The bottom margin must be enlarged to make room for the footer.

The footer template runs in a separate isolated context with no access to page CSS, so
every style must be inline and only web-safe font stacks are available:

```ts
const FOOTER_TEMPLATE = `
<div style="width:100%;font-size:7pt;color:#5B6672;padding:0 14mm;
  font-family:Helvetica,Arial,sans-serif;display:flex;justify-content:space-between;">
  <span>${escapeHtml(siteHost)} &middot; Rapport confidentiel</span>
  <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>`;
```

`siteHost` is client-controlled and must be escaped.

**Do not also add a `position: fixed` CSS footer.** That was the plan until the
prototype was rendered; it collides with repeated table headers (D30).

### 3.2 Print CSS primitives

Replace the section-level `avoid-break` with:

```css
@media print {
  .new-page   { break-before: page; }
  .keep       { break-inside: avoid; }   /* cards and small groups only */
  h2, h3      { break-after: avoid; }
  p, li       { orphans: 3; widows: 3; }
  tr          { break-inside: avoid; }
  thead       { display: table-header-group; }
}
```

One subtlety learned from rendering: `.keep` on a rule group with fourteen rows blanks
half a page. Apply it conditionally.

```ts
const keepClass = group.findings.length <= 6 ? ' keep' : '';
```

Groups above that threshold break across pages with the header row repeating, which is
the better outcome.

### 3.3 Appendix grouping

A pure function over `Finding[]`, no schema change:

```ts
type RuleGroup = {
  ruleId: string;
  severity: Severity;
  findings: Finding[];
  totalOccurrences: number;
  maxPages: number;
  wcagCriteria: string[];   // union across the group
};

const SEVERITY_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const;

export function groupAppendix(findings: Finding[]): RuleGroup[] {
  const map = new Map<string, RuleGroup>();
  for (const f of findings) {
    const key = `${f.ruleId}::${f.severity}`;
    const g = map.get(key) ?? {
      ruleId: f.ruleId, severity: f.severity, findings: [],
      totalOccurrences: 0, maxPages: 0, wcagCriteria: [],
    };
    g.findings.push(f);
    g.totalOccurrences += f.occurrenceCount;
    g.maxPages = Math.max(g.maxPages, f.pageUrls.length);
    g.wcagCriteria = [...new Set([...g.wcagCriteria, ...(f.wcagCriteria ?? [])])].sort();
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    || b.totalOccurrences - a.totalOccurrences);
}
```

Minor performance findings take a second reduction, aggregating by `ruleId` into
`{ findingCount, maxPages, totalOccurrences }`, sorted by occurrences descending. This
turns 60 rows into 32 and moves them below the four that matter (B11).

The selector column is the fix for B13. Selectors come from the client's own markup and
can contain brackets, quotes and arbitrary user content, so they must be HTML-escaped
and rendered with `word-break: break-all` in a monospace face.

### 3.4 Evidence images

The fix for A8 and B18, and the largest single win in the refactor:

- include a screenshot pair only where `missingPercent >= 5`; haaitza drops from 20 pairs
  to 2;
- downscale to 800 px wide, JPEG quality 80, before base64 embedding;
- crop or cap height; a 13,000 px strip is not evidence, it is ballast;
- emit `alt` text describing what the image shows, not what it is called (E32);
- render `rawTextLength` and `renderedTextLength` alongside each pair (B17).

Prototype result: 30.7 MB to 670 KB, a factor of 45, with more information on the page
rather than less.

### 3.5 Self-test

axe-core and Playwright are already dependencies. Add a test that loads the rendered
report HTML and asserts zero violations. An accessibility auditor that fails its own
audit is not a product.

---

## Part 4: `packages/llm` changes

### 4.1 The governing decision: divert, do not instruct

The wrapper-page and legal-page problems (A1, A2, A3) cannot be fixed by telling the
model to be careful. They are fixed by never showing it the input.

In `buildLlmInput`, which is not a locked contract, partition findings before the
structure pass:

```ts
const isWrapperPage = (url: string) =>
  manifest.renderDiff[url]?.missingPercent >= 95;

const LEGAL_PATH = /(cgu|cgv|conditions|mentions-legales|cookies|confidentialite|privacy|terms|legal)/i;

const isDiverted = (f: Finding) =>
  f.pageUrls.length > 0 &&
  (f.pageUrls.every(isWrapperPage) || f.pageUrls.every(u => LEGAL_PATH.test(u)));
```

Diverted findings never reach the model. They are rendered by the template into a
deterministic "Observations" section with fixed copy: for wrappers, that the correction
is a decision about whether the pages should exist; for legal pages, that `noindex` is
usually intentional and no action is recommended by default.

This is exactly the governing rule of the system. Deterministic scanners detect. The LLM
explains what is left. Three of eleven v1 themes disappear by construction, and the
model cannot produce the bad advice in A3 because it never sees the finding.

### 4.2 Structure pass

**Site-wide accessibility floor.** A finding present on 80 percent or more of crawled
pages and carrying WCAG criteria may not be ranked in the bottom quartile, and its
impact may not be below `medium`. This is what put blocked zoom at position 11 (A5).
Enforce in code after the structure pass returns, do not ask the model to remember it.

**Occurrence weighting.** Rank by occurrence volume as well as page count, so the 180
and 203 occurrence findings surface (A6).

**Containment guard.** If a theme's findings resolve entirely to diverted pages, log a
warning. After 4.1 this should be unreachable; log, do not reject, so a regression is
visible rather than silent.

### 4.3 Writing pass

- `businessImpact` capped at two sentences, enforced by schema.
- `recommendedActions` capped at three, `.max(3)` in the Zod schema. Concrete verbs.
- `legalRelevance` takes a fixed shape, filled from deterministic data:
  `"Crit\u00e8re X (Nom), WCAG 2.2 niveau AA, r\u00e9f\u00e9renc\u00e9 par la norme EN 301 549."`
  The model chooses no part of this sentence. It fixes C19 without inviting invention.
- The executive summary must cite the deterministic counts. Pass them into
  `WritingInput` as a `siteStats` object rather than hoping the model counts correctly.
- Performance actions must follow the dominant metric. When TBT dominates, the advice is
  JavaScript, not images (A4). Pass the dominant metric in as a field.
- No page-URL lists in prose (F38). Page counts only; URLs live in the appendix.
- The "where to start" block references themes by rank rather than restating their prose
  (B14).
- Methodology and limitations merge into one section (B15) that states the crawl size
  (B16).

All prompts now target `mistral-large-latest` with `strict` JSON schema response format.
Tightening the schema is the reliable lever here; prose instruction is the weak one.

### 4.4 Wording

`serious` renders as "Majeur", not "Important" (F36). Effort and impact render as a
three-dot scale with a label (F37). Quick wins, meaning low effort with medium or high
impact, carry a badge (F40). French number formatting throughout, narrow no-break space
as thousands separator and before units (D27).

---

## Part 5: session plan

**Session A, `packages/report`, template only.** Print CSS primitives, `pdf.ts` options
and footer, appendix grouping, severity badges, evidence downscaling and filtering,
conformance rollup, statistics page, axe self-test. No LLM changes. Fold the throttling
profile capture into this session: read it from the Lighthouse manifest if present, fall
back to a static string.

**Session B, `packages/llm`.** The `buildLlmInput` diversion filter, the deterministic
observations section, structure-pass ranking rules, writing-pass schema tightening,
`siteStats` in `WritingInput`.

Session A is independently valuable. If B slips, the report is already dramatically
better.

**Verification after each session:** `pnpm typecheck`, `pnpm test`, regenerate the
haaitza report and diff the page count and file size, `git diff` against the three locked
contract files to confirm they are untouched, `pgrep -af vite` for orphaned fixture
servers.

**Do not touch:** `findings.ts`, `severity.ts`, `llm-output.ts`. Nothing in this spec
requires it. The conformance flag is derived in template code; `siteStats` is an input
type, not an output contract.

---

## Part 6: out of scope

- Full PDF/UA conformance. `tagged: true` is a large step, not the whole standard.
- TOC entries with page numbers, which need a two-pass render (D29). Bookmarks plus
  footer page numbers cover the need.
- Font embedding. The prototype uses Georgia and a system sans stack, which is
  deliberate: it renders identically everywhere with no network fetch. Self-hosting a
  display face is a later refinement, not a blocker.

---

## Verification performed

Claims in this document were checked rather than assumed.

| Claim | Method | Result |
|---|---|---|
| v1 PDF is untagged | `pdfinfo` | `Tagged: no` |
| 28.7 MB is two screenshot strips | `pdfimages -list` | 15.2 MB + 13.5 MB, 13,230 px and 13,371 px tall, drawn on 4 pages |
| `/social/` pages are Meta wrappers | extracted page 18 images | raw view empty, rendered view is a Meta page under a cookie dialog |
| Finding totals | recomputed from transcribed data | 103 = 8 + 20 + 15 + 60; 23 a11y, 15 SEO, 64 perf, 1 rendering; 431 a11y occurrences |
| 7 WCAG criteria failing | rollup over the same data | 1.1.1, 1.4.1, 1.4.3, 1.4.4, 2.4.4, 2.5.8, 4.1.2 |
| `tagged` and `outline` work | rendered the prototype with Playwright | `Tagged: yes`, full bookmark tree |
| Size fix works | rendered the prototype | 670 KB against 30.7 MB |
| Pagination holds | rasterized all 20 pages and inspected | no blank half-pages, table headers repeat |
| CSS fixed footer collides | rasterized and inspected | overlapped repeated `thead`; removed |

The prototype's ranking is a corrected target, produced by applying the Part 4 rules by
hand to the real data, not by running the pipeline. It is what the refactored system
should produce, and it is the acceptance test for session B.
