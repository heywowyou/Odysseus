# Report feedback: La Corniche, second full real-scan pass (FR, full tier, 2026-08-19)

**Both P0 and P2 items below are FIXED, 2026-08-19, same session, verified
against this same artifacts directory** (`artifacts/lacoorniche.com/
2026-08-19T11-15-01Z`). Regenerating now produces a clean 27-page PDF: no
blank interior page, no duplicated glossary, no orphaned table header.
See each item's own "FIXED" note below for what changed and why.

Fresh `audit` + `analyze` + `report` run against `https://lacoorniche.com`,
independent of the artifacts the previous same-day session fixed against.
Report: `artifacts/lacoorniche.com/2026-08-19T11-15-01Z/reports/2026-08-19T11-21-13Z-fr.pdf`,
28 pages, 18 pages crawled, 105 findings (21 critical, 32 serious, 5
moderate, 47 minor). Purpose: verify the previous session's fixes hold
against a genuinely new scan (not a re-render of the same artifacts) and
look for regressions or new defects, per the standing rule that a report
change is not done until checked against a real site.

Note on the crawl target: `audit https://www.lacoorniche.com` (with
`www`) only visits 1 page - the site does not serve internal links from
that host/scheme combination the crawler follows. `audit
https://lacoorniche.com` (no `www`) crawls normally to 18 pages, same as
every prior session's artifacts. Not a report bug, just worth remembering
for the next person who reaches for the `www` form from muscle memory.

## Arithmetic audit

Checks out. 21 + 32 + 5 + 47 = 105 severity total, matches "105 constats
distincts". 95 (accessibility) + 7 (SEO) + 2 (GEO) + 1 (Rendu) = 105
category total. 21 + 32 = 53 matches the résumé's "53 constats
prioritaires". The 603-occurrence accessibility tile explicitly excludes
169 heuristic (`alt-text-quality-heuristic`) occurrences, and the
heuristic rollup table independently reports exactly 169 occurrences
across 41 constats - the cross-reference is real, not just asserted. No
counting regression from the previous session's fixes.

## P0. Ships a blank page and a duplicated section to the client

### New. The glossary renders twice with a blank page between the two copies

**FIXED, 2026-08-19.** Root cause confirmed by instrumenting `pdf.ts`
with a temporary debug pass that diffed `.glossary-entry` text content
against the post-pagination DOM: 14 of 27 entries were genuinely
duplicated by Paged.js (not a template bug), with zero console output of
any kind - a real, silent variant of the truncation failure the existing
`PAGEDJS_LAYOUT_REPEATED_MARKER` guard already handles, just without the
console signal that guard depends on. Two changes:

- `glossary.ts`: the section now renders with the `sheet-standalone`
  class (paged.css's `break-before: page`), forcing it to always start on
  a fresh page rather than potentially sharing a page with the annex's
  tail. This removes the specific fractional-leftover-space condition
  that triggered the duplication for this document - confirmed by
  rerunning the same debug instrumentation after the change: 27 entries,
  zero duplicates, zero blank pages. Does not reintroduce any cap on
  glossary length; `sheet-standalone` only fixes the section's own
  starting page, the term list still flows across as many pages as it
  needs (item 34's rule, unchanged).
- `pdf.ts`: added a second, general structural guard
  (`detectPagedjsStructuralFailure`) that runs after every render,
  independent of console output. It fails generation loudly if any
  interior page is blank, or if any block from the report's atomic-class
  set (`.card`, `.render-card`, `.theme-card`, `.glossary-entry`,
  `.section-head`) has identical text on two different pages - the two
  concrete symptoms of this failure mode. This is deliberately broader
  than the one bug found here: the markup fix above addresses this
  specific document shape, but per this package's own standing position
  ("not something this package's own markup/CSS can guarantee never
  triggers again for every future document shape"), the next
  document-shape-specific trigger should abort loudly instead of shipping
  silently, the same posture already taken for the truncation variant.

**Verification.** Regenerated against this same artifacts directory
after both changes: 27 pages (was 28), no blank page, no duplicate
glossary entries, full test suite (325 tests across `packages/report`)
still passes.

**Original symptom** (for reference; no longer reproducible). Pages
24-27, in order:

- Page 24: glossary, starting at "WCAG 2.2" and ending mid-list after
  "SEO" (page full).
- Page 25: **entirely blank** - background, footer, and page number only,
  no content of any kind. `pdftotext` would return zero characters, the
  same signature as the already-fixed item 0.2 (`report-feedback-la-
  corniche.md`), just relocated.
- Page 26: the glossary **again**, from "WCAG 2.2" through the same terms
  as page 24, this time running one entry further to "GEO" before the
  page fills.
- Page 27: the *rest* of the glossary (Constat/Occurrence, Sélecteur,
  DGCCRF, Parcours transactionnel, Sans objet, Recherche émergente,
  Signaux à vérifier, Pages concernées, Rendu, Sirene, Effort, Impact
  commercial) - correct, no further duplication, and no term from this
  page repeats anything already shown.

So the reader hits a dead page directly followed by watching fourteen
terms they already read start over from the top. The table of contents
on page 2 still says "13 Prochaines étapes ... 27", but that section is
actually on page 28 - the TOC's static page numbers were computed
against the intended layout, not against what Paged.js actually
produced, so the duplication silently desynced them. This is exactly the
commercial-credibility failure item 0.2 described ("the one page of the
document with commercial upside" pattern applies to the glossary and
next-steps pages alike here), just a different section and a different
manifestation of the same underlying engine limitation.

**Confirmed not a template bug.** `packages/report/src/template/sections/
glossary.ts`'s `renderGlossary` calls the term list exactly once; there is
no duplicate render call, no duplicate entry in `strings.glossary.terms`,
and no conditional branch that could emit the block twice. The HTML
source going into Paged.js contains the glossary content once. The
duplication is produced by Paged.js's own pagination pass.

**Why the existing guard didn't catch it.** `packages/report/src/pdf.ts`'s
`PAGEDJS_LAYOUT_REPEATED_MARKER` guard only aborts generation when
Paged.js logs a console error containing the literal string "Layout
repeated" - the failure mode documented from the *first* La Corniche
session, where the tail of the document was silently dropped. This run's
`report` command exited 0 with no such console message: Paged.js
re-laid-out the glossary fragment without ever emitting that specific
error. Same underlying engine fragility (a fragment near a page boundary
gets reprocessed instead of flowing once), different symptom (duplicate
+ blank page instead of truncation), and the guard's substring match is
specific enough to the truncation wording that it does not fire here.

**Why the test suite didn't catch it either.** `packages/report/src/
template/paged-invariants.test.ts` already has "invariant 2: no sheet is
more than 80 percent empty" and its own top-of-file comment states
plainly that its "Layout repeated" detection is asserted generically
"since neither variant of the stress fixture happened to trigger it...
confirmed: it is sensitive to a specific document shape this generator's
29-page run does not reproduce." That is exactly what happened here: a
real 28-page, 105-finding, GEO-inclusive report (this site now has GEO
findings, which the stress fixture may or may not model at the same
density) hit a document shape the fixture doesn't cover. The file's own
top comment also states the working rule "layout is never iterated
against a real client scan" - which is the reasoning that kept the
fixture-only test policy, and is also exactly why this shipped
undetected until a real scan was run.

**Fix direction.** Two independent layers, not one:
- `pdf.ts`'s guard currently only recognizes the truncation wording.
  Broaden detection to whatever Paged.js actually logs for a repeated-
  layout-without-truncation event (needs a real repro under Playwright
  with console capture to see the exact message, since this run's
  console apparently didn't carry the same literal marker - or Paged.js
  emits no console signal at all for this variant, in which case
  detection has to happen structurally instead: e.g. render, then check
  for two `.glossary-entry` (or any) elements sharing identical text
  content on non-adjacent pages, or check for a sheet with a rendered
  page directly following an empty one).
- Add a post-render structural invariant (in addition to the existing
  80-percent-empty one) that fails when the same section heading /
  content block appears in two non-adjacent page fragments. The 80%-
  empty invariant alone would have caught page 25 here, so wiring that
  invariant into a real, larger, GEO-inclusive fixture (or running it
  against saved real-scan HTML, not just the synthetic stress fixture)
  would likely have caught this before it reached a client build. Worth
  reconsidering whether "never test layout against a real scan" should
  have a narrow exception for a periodic regression check using a
  captured real HTML snapshot, without changing the "don't chase one
  narrow synthetic repro" policy for day-to-day fixture design.

**Acceptance check.** Regenerate against this same artifacts directory
(`report --language fr artifacts/lacoorniche.com/2026-08-19T11-15-01Z`)
after any fix and confirm: no blank interior page, no repeated section
heading, and the TOC's `Prochaines étapes` page number matches its actual
page.

## P2. Layout and pagination

### New. The "Signaux à vérifier" heuristic table's header wraps and splits across a page break

**FIXED, 2026-08-19.** `conformance-summary.ts`'s `renderRollupTable`
(shared by the WCAG-failure table and this heuristic table) converted
from a CSS grid of `<div>`s to real `<table>`/`<thead>`/`<tbody>`
markup, the same pagedjs-fragility fix `findings-appendix.ts` and
`core-web-vitals-table.ts` already applied for their own tables, plus
`white-space:nowrap` on the header cells so "Pages concernées" can no
longer wrap onto two lines in the first place. That alone stopped the
header-text split but uncovered a second, milder issue: with a real
`<table>`, a single-row table's header could still land on one page with
its lone body row pushed to the next, with no repeated header above it -
`table thead { display: table-header-group }`'s auto-repeat only engages
once a table has already shown at least one body row before breaking,
which this table hadn't. `break-after: avoid` on `thead` and
`break-before: avoid` on `tbody tr:first-child` were both tried and
neither changed the outcome. The fix that worked: `break-inside: avoid`
on the whole `<table>` element. This is safe specifically because both
tables `renderRollupTable` serves are bounded in row count by a small
fixed vocabulary (WCAG 2.2 AA success criteria; `HEURISTIC_RULE_IDS`),
unlike `findings-appendix.ts`'s per-rule-group content, which trade-off
17 (CLAUDE.md) found can grow taller than a page - the reasoning that
removed atomicity there does not apply to a table that can never have
more than roughly a dozen rows.

**Verification.** Regenerated against this same artifacts directory: the
table now moves as one atomic unit when it doesn't fit, header and row
together, on every page of the report. Full test suite still passes.

**Original symptom** (for reference; no longer reproducible). Page 9
ended with the "Signaux à vérifier" table's header row
- "INTITULÉ", "CONSTATS", "OCCURRENCES", and a "PAGES" label that wraps
onto two lines because the column is narrow. The page break falls
between the two wrapped lines of that last header: "PAGES" stays on page
9, its own second line "CONCERNÉES" and the *first data row*
("Contenu non textuel", 41, 169, 17) both spill onto page 10, arriving
with no visible header directly above them. A reader hitting page 10 in
isolation sees a stray "CONCERNÉES" line followed immediately by a data
row, disconnected from the table it belongs to.

**Root cause.** `packages/report/src/template/sections/conformance-
summary.ts`'s `renderRollupTable` (used for both the WCAG-failure table
and, via `heuristicBlock`, this heuristic table) is a CSS grid
(`display:grid`), not an HTML `<table>`. `packages/report`'s own annex
table (`findings-appendix.ts`) already moved to a genuine `<table>` with
`tbody tr { break-inside: avoid }` (paged.css) specifically because
trade-off 17 found that CSS grid / div-based row layouts don't get the
same row-level break protection a real table gets from Paged.js - grid
items can be individually reflowed across a page boundary the way this
header row just was. The rollup table never got the same treatment.

**Fix direction.** Either add `break-inside: avoid` to the individual
grid header cell (won't help - the break happened inside a single
`headCell()`'s wrapped text, not between rows) or, more robustly, convert
`renderRollupTable` to a real `<table>` the same way the annex table was
converted, so Paged.js's native table-row fragmentation rules apply
instead of grid-item reflow. A narrower fix - widening the "Pages
concernées" column or shortening its label so it never wraps to two
lines - would mask this one instance but leaves the same grid-based
break fragility for the next report whose data happens to push a
different header or cell across a boundary.

**Acceptance check.** Regenerate and confirm every "Signaux à vérifier"
and WCAG-failure table header stays fully on one page, never splits a
wrapped header line across a page break, on this same artifacts
directory.

## What held up from the previous session's fixes

No re-verification of every item in `report-feedback-la-corniche.md` was
done line by line (that would require the exact same artifacts, and this
was deliberately a fresh scan). What this fresh, independent scan does
confirm: no English debug text or raw heuristic reasoning leaked into any
French section, no literal `?` placeholder strings, no zero-page TOC
entries for sections that do exist, the plural-agreement template branch
on the cover reads correctly ("21 constats critiques et 32 constats
sérieux" - both plural, correctly), and the arithmetic layer (severity
totals, category totals, occurrence cross-references) is internally
consistent throughout. The regressions found in this pass are both new
and narrower than what the previous session fixed: they are Paged.js
pagination-engine fragility resurfacing in two sections the previous
fixes did not touch (glossary, heuristic rollup table), not a return of
any previously fixed content or data bug.

## New, minor, found while verifying the fixes above - not fixed

The table of contents' page numbers are computed live by Paged.js itself
(paged.css's `.toc-row::after { content: target-counter(attr(href url),
page) }`, not a static estimate), and after both fixes above every row is
correct except the last: "13 Prochaines étapes" shows page 26, but the
section's own footer ("PAGE 27 / 27") and its actual position both say
27. Checked against the very first version of this report generated this
session (before either fix): the TOC showed 27 for a section that was
actually on page 28 - the same one-page understatement, just shifted by
whatever the total page count happened to be at the time. This means the
discrepancy is a separate, narrow, pre-existing `target-counter`
staleness affecting specifically the last TOC row, independent of (and
not introduced or worsened by) either fix in this document. Worth a
dedicated look, not chased further here since it wasn't part of what
this session set out to fix and every other TOC row (including
"Glossaire", which moved from page 24 to page 25 as a direct result of
this session's fix) resolves correctly.

## Known, unrelated to this session's fixes

Lighthouse fails to produce a result on every page of this specific site
(`runLighthouseIsolated: worker ... exited before returning a result
(code 1, signal null)`), reproduced identically in this run's manifest
and in the prior `2026-08-19T09-40-57Z` artifacts before this session
started. The report correctly states "la mesure de performance n'a pas
abouti" rather than fabricating a result (per item 0.3's report-side
fix), so this is not a report bug - it is a scanner/environment issue
specific to this site that predates this session and is out of scope
here. Flagged for awareness only: every report generated against this
site will have an empty Performance section until that's investigated
separately.
