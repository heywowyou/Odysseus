/**
 * Prints the fully composed, self-contained HTML (render-html.ts) to PDF
 * via a real paged-media engine, per docs/report/report-design-system.md section
 * 2: Chromium's own print CSS ignores @page margin boxes, which is where
 * paged.css's footer string and page counter live, so Paged.js runs
 * inside the page first and lays out real .pagedjs_page fragments -
 * page.pdf() afterwards just rasterizes what Paged.js already built,
 * rather than relying on Chromium's native pagination at all.
 *
 * Reuses a Browser launched once by generateReportPdf (index.ts) via
 * launchBrowser from @odysseus/scanner (one browser dependency, not two),
 * rather than launching a second browser here.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Browser, Page } from 'playwright';

const require = createRequire(import.meta.url);

/** pagedjs's package.json only exposes a conditional root export (no
 *  subpath exports for ./dist/*), so `import`/`require.resolve` cannot
 *  reach dist/paged.js by module specifier. require.resolve('pagedjs')
 *  itself still resolves cleanly (the "require" condition maps to
 *  lib/index.cjs), and that gives a real file path whose package root
 *  fs.readFile can then read dist/paged.js from directly - module
 *  resolution and plain file reads are governed by different rules, and
 *  only the former is restricted by the exports map. Cached at module
 *  load: this file never changes at runtime. */
let cachedPagedjsSource: string | undefined;
async function readPagedjsSource(): Promise<string> {
  if (cachedPagedjsSource) return cachedPagedjsSource;
  const entryPath = require.resolve('pagedjs');
  const packageRoot = path.dirname(path.dirname(entryPath)); // .../pagedjs/lib/index.cjs -> .../pagedjs
  cachedPagedjsSource = await fs.readFile(path.join(packageRoot, 'dist', 'paged.js'), 'utf-8');
  return cachedPagedjsSource;
}

/** Paged.js's own infinite-loop guard: when its layout algorithm detects
 *  it is about to reprocess the same fragment boundary without making
 *  progress, it logs this and aborts, silently dropping everything after
 *  that point in the document rather than hanging. Confirmed against a
 *  real client report (La Corniche, report-feedback-la-corniche.md items
 *  0.2/0.7): the shipped PDF was missing its final ~3 pages of content
 *  (two whole sections, plus two annex category groups) with no error
 *  surfaced anywhere - the PDF byte stream is completely well-formed,
 *  just truncated. Detected here rather than trusted to disappear: this
 *  is a real Paged.js limitation (github.com/pagedjs/pagedjs's own
 *  "Layout repeated" failure class), not something this package's own
 *  markup/CSS can guarantee never triggers again for every future
 *  document shape. */
const PAGEDJS_LAYOUT_REPEATED_MARKER = 'Layout repeated';

/** A second, silent variant of the same Paged.js fragility the marker
 *  above catches, found against a real La Corniche re-scan
 *  (report-feedback-la-corniche-v2.md): the layout engine cloned the
 *  glossary's first ~14 entries onto a second page fragment with a
 *  fully blank page in between, and logged nothing to the console at
 *  all - no "Layout repeated" message, no error, no warning. The
 *  console-based guard above cannot catch this variant by definition.
 *  Checked structurally instead, against the real post-pagination DOM:
 *  every interior page (the cover is allowed to be visually sparse,
 *  same exemption invariant 2 in paged-invariants.test.ts already
 *  grants it) must carry some text, and no block from this selector's
 *  class list may have identical text content appearing on two
 *  different pages - any match is Paged.js duplicating a fragment, not
 *  real content. The property every class here shares is verbatim
 *  uniqueness across a legitimate report, not CSS atomicity. Most of these
 *  classes remain break-inside: avoid, while `.theme-card` is explicitly
 *  fragmentable and `.appendix-rule-head` (issue #171) is also NOT atomic
 *  (trade-off 17); all are still unique - one heading per annex rule
 *  group, and its text renders the severity badge, rule code and
 *  occurrence counts together, so the same rule id's heading in the
 *  third-party partition always carries the vendor tag its first-party
 *  copy lacks. Scoped to those classes rather than every element on the
 *  page so a deliberately repeated short string (a rule id like "f001"
 *  appearing in both a priority card and the annex, for instance) never
 *  false-positives. Deliberately excludes `table`/`thead`: the appendix
 *  thead-repair pass below (issue #45) intentionally clones a rule group's
 *  header onto more than one page, which must never trip this check. */
const ATOMIC_BLOCK_SELECTOR =
  '.card, .render-card, .theme-card, .glossary-entry, .section-head, .appendix-rule-head';

/** Explicit opt-in only: unlike the legacy duplicate-fragment selector above,
 * this marker means the component is structurally bounded by its template and
 * must therefore occupy exactly one physical Paged.js page. It must never be
 * inferred from a `break-inside` CSS declaration: appendix groups and other
 * potentially page-tall content intentionally use paged fragments. */
const RENDER_ATOMIC_SELECTOR = '[data-render-atomic]';

/** One `.pagedjs_page` fragment's content, reduced to exactly what the
 *  structural check needs. Extracted via page.evaluate (real DOM,
 *  requires a browser) and handed to the pure functions below so the
 *  actual pass/fail decision is testable without one. */
export interface PagedPageModel {
  text: string;
  atomicBlockTexts: string[];
  renderAtomicMarkers: string[];
}

export interface PagedjsStructuralCheckResult {
  blankPageIndex: number;
  duplicateText: string | undefined;
  splitAtomicMarker: { marker: string; pageIndexes: number[] } | undefined;
  pageCount: number;
}

/** Pure decision logic, no DOM: the cover page (index 0) is exempt from
 *  the blank-page check per the same invariant paged-invariants.test.ts
 *  grants it, and an atomic block's text is compared only against its
 *  own prior occurrence, on a different page, never within the same
 *  page fragment. */
export function analyzePagedjsPages(
  pages: readonly PagedPageModel[],
): PagedjsStructuralCheckResult {
  const blankPageIndex = pages.findIndex((p, i) => i > 0 && p.text.trim().length === 0);

  const seenOnPage = new Map<string, number>();
  let duplicateText: string | undefined;
  for (const [pageIndex, p] of pages.entries()) {
    for (const rawText of p.atomicBlockTexts) {
      const text = rawText.trim();
      if (!text) continue;
      const previousPage = seenOnPage.get(text);
      if (previousPage !== undefined && previousPage !== pageIndex) {
        duplicateText = text;
        break;
      }
      seenOnPage.set(text, pageIndex);
    }
    if (duplicateText !== undefined) break;
  }

  const pagesByAtomicMarker = new Map<string, number[]>();
  for (const [pageIndex, p] of pages.entries()) {
    for (const marker of new Set(p.renderAtomicMarkers.filter(Boolean))) {
      const pageIndexes = pagesByAtomicMarker.get(marker) ?? [];
      pageIndexes.push(pageIndex);
      pagesByAtomicMarker.set(marker, pageIndexes);
    }
  }
  const splitAtomicMarker = [...pagesByAtomicMarker.entries()]
    .map(([marker, pageIndexes]) => ({ marker, pageIndexes }))
    .find(({ pageIndexes }) => pageIndexes.length > 1);

  return { blankPageIndex, duplicateText, splitAtomicMarker, pageCount: pages.length };
}

export function describePagedjsStructuralFailure(
  result: PagedjsStructuralCheckResult,
): string | undefined {
  if (result.blankPageIndex !== -1) {
    return (
      `Paged.js produced a blank interior page (page ${result.blankPageIndex + 1} of ${result.pageCount}), ` +
      `the signature of a layout fragment silently duplicating elsewhere in the document.`
    );
  }
  if (result.duplicateText !== undefined) {
    return (
      `Paged.js rendered the same block twice on separate pages ("${result.duplicateText.slice(0, 80)}..."), ` +
      `which never happens for legitimate report content - a layout fragment was duplicated.`
    );
  }
  if (result.splitAtomicMarker !== undefined) {
    const { marker, pageIndexes } = result.splitAtomicMarker;
    return (
      `Declared bounded render unit "${marker}" spans physical pages ` +
      `${pageIndexes.map((pageIndex) => pageIndex + 1).join(', ')} of ${result.pageCount}.`
    );
  }
  return undefined;
}

/** Extracts the real post-pagination page model off the live Paged.js DOM
 *  and reduces it to the structural check result, whose pageCount is the
 *  only measured page count this package ever produces: the final PDF is
 *  never parsed to rediscover it. */
async function analyzePagedjsPagesInBrowser(page: Page): Promise<PagedjsStructuralCheckResult> {
  const pages = await page.evaluate(
    ({ atomicBlockSelector, renderAtomicSelector }) => {
      return Array.from(document.querySelectorAll('.pagedjs_page')).map((p) => ({
        text: p.textContent ?? '',
        atomicBlockTexts: Array.from(p.querySelectorAll(atomicBlockSelector)).map(
          (block) => block.textContent ?? '',
        ),
        renderAtomicMarkers: Array.from(p.querySelectorAll(renderAtomicSelector)).map(
          (block) => block.getAttribute('data-render-atomic') ?? '',
        ),
      }));
    },
    { atomicBlockSelector: ATOMIC_BLOCK_SELECTOR, renderAtomicSelector: RENDER_ATOMIC_SELECTOR },
  );

  return analyzePagedjsPages(pages);
}

/** Issue #118. Constrained successor to plan 033's removed geometry
 *  collector. The removed version walked every element under each
 *  .pagedjs_page and compared it against the printable rectangle, so it
 *  reported ordinary Paged.js infrastructure as overflow: the margin boxes
 *  that carry the running page counter and the footer sit outside the
 *  content area by design, and a normal report (the small-site fixture,
 *  physical page 4) died with "Painted content <div> exceeds printable
 *  content rectangle ... at right" during the full test run. That tripped
 *  plan 033's STOP condition and the collector was removed.
 *
 *  This version keeps the same failure class but narrows where it looks.
 *  It walks only painted element boxes inside the .sheet fragments under
 *  .pagedjs_page_content, because the design system's content unit is the
 *  sheet (html-utils.ts wraps every section in one). Everything else on a
 *  page is page surface, not content painted on it, and most of it spans
 *  the full sheet width by construction: the margin boxes carrying the
 *  running page counter and footer live outside the content area, and the
 *  wrapper frames around the fragments (Paged.js's own page-content div
 *  plus render-html's font-family div) measure the full page width and so
 *  stick 18mm into the sheet padding on each side. Confirmed against the
 *  real small-site render: those frames were the ONLY boxes a wider walk
 *  reported on all 35 pages. The appendix continuation headers the issue
 *  also names never need an exemption of their own: the repair pass
 *  (insertRepeatedTheadsIntoHtml) rebuilds them as ordinary in-flow
 *  tables inside a sheet, and the header-only ghost fragments are already
 *  deleted (removeEmptyAppendixTableGhosts) before this gate runs.
 *
 *  Text that paints past its own element box (an unbreakable string
 *  overflowing a fixed-width card) is deliberately out of scope: element
 *  boxes stay put when only glyphs overflow, so that class needs text
 *  range geometry, and paged.css's overflow-wrap defences plus
 *  paged-invariants invariant 6 already own it. Precision is preferred
 *  over recall throughout: a false positive aborts a normal client
 *  deliverable, which is exactly what got the broad collector stopped. */

/** Subpixel rounding at fractional print-resolution boundaries
 *  (18mm is not a whole number of pixels) routinely moves an edge by a
 *  fraction of a pixel. Below this, a difference is measurement noise,
 *  not overflow; paged-invariants invariant 6 uses the same +1px slack. */
export const PAGEDJS_OVERFLOW_TOLERANCE_PX = 1;

/** A box smaller than this in BOTH dimensions is layout dust: rounding
 *  shards and zero-size anchors like the hidden .footer-source node
 *  (0x0 by design). Something that actually paints is at least a
 *  hairline big on one axis. */
export const PAGEDJS_NEGLIGIBLE_BOX_PX = 1;

export interface PagedRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PagedOverflowCandidate {
  /** Uppercase DOM tag name (DIV, TABLE, ...); lowercased for the error
   *  message so the report matches the old gate's "<div>" style. */
  tag: string;
  /** False when the element cannot paint at all (display: none,
   *  visibility: hidden, opacity: 0): such boxes exist in geometry but
   *  never in ink, so they must never fire. */
  painted: boolean;
  rect: PagedRect;
  /** Issue #276: the appendix finding the box sits in, when there is one,
   *  so a refused report names what to look at. */
  findingId?: string;
  /** The heading of the report section the box sits in, for the same
   *  reason: most overflowing boxes are not in an annex row. */
  sectionTitle?: string;
  /** The start of the box's own text, so a refusal outside any titled
   *  section still names the block to look at. */
  textExcerpt?: string;
}

export interface PagedPageOverflowModel {
  pageIndex: number;
  /** The printable content rectangle: .pagedjs_page_content's box inset
   *  horizontally by the .sheet fragment's own computed padding, because
   *  the sheet padding (not @page) is where this design puts its side
   *  margins. */
  contentRect: PagedRect;
  candidates: PagedOverflowCandidate[];
}

export type PagedOverflowSide = 'right' | 'left' | 'bottom' | 'top';

export interface PagedjsOverflowViolation {
  pageIndex: number;
  tag: string;
  side: PagedOverflowSide;
  amountPx: number;
  findingId?: string;
  sectionTitle?: string;
  textExcerpt?: string;
}

/** Fixed side order so a box wider than the whole sheet reports its
 *  dominant side deterministically instead of an arbitrary one. */
function firstOverflowSide(
  rect: PagedRect,
  contentRect: PagedRect,
): { side: PagedOverflowSide; amountPx: number } | undefined {
  const sides: readonly (readonly [PagedOverflowSide, number])[] = [
    ['right', rect.right - contentRect.right],
    ['bottom', rect.bottom - contentRect.bottom],
    ['left', contentRect.left - rect.left],
    ['top', contentRect.top - rect.top],
  ];
  for (const [side, amount] of sides) {
    if (amount > PAGEDJS_OVERFLOW_TOLERANCE_PX) {
      return { side, amountPx: Math.round(amount * 10) / 10 };
    }
  }
  return undefined;
}

/** Pure decision over the collected geometry, no DOM: returns the first
 *  painted box that leaves its page's printable content rectangle by more
 *  than the rounding tolerance, in document order, so the reported page is
 *  always the earliest offender. A degenerate content rectangle (zero
 *  sized) is skipped: that signature belongs to the structural gates,
 *  which describe it far more precisely than geometry could. */
export function analyzePagedjsOverflow(
  pages: readonly PagedPageOverflowModel[],
): PagedjsOverflowViolation | undefined {
  for (const p of pages) {
    if (p.contentRect.width <= 0 || p.contentRect.height <= 0) continue;
    for (const candidate of p.candidates) {
      if (!candidate.painted) continue;
      if (
        candidate.rect.width < PAGEDJS_NEGLIGIBLE_BOX_PX &&
        candidate.rect.height < PAGEDJS_NEGLIGIBLE_BOX_PX
      ) {
        continue;
      }
      const overflow = firstOverflowSide(candidate.rect, p.contentRect);
      if (overflow !== undefined) {
        return {
          pageIndex: p.pageIndex,
          tag: candidate.tag,
          ...overflow,
          ...(candidate.findingId === undefined ? {} : { findingId: candidate.findingId }),
          ...(candidate.sectionTitle === undefined ? {} : { sectionTitle: candidate.sectionTitle }),
          ...(candidate.textExcerpt === undefined ? {} : { textExcerpt: candidate.textExcerpt }),
        };
      }
    }
  }
  return undefined;
}

export function describePagedjsOverflow(violation: PagedjsOverflowViolation): string {
  return (
    `Painted content <${violation.tag.toLowerCase()}> extends past the printable content rectangle ` +
    `on physical page ${violation.pageIndex + 1} at ${violation.side} by ${violation.amountPx}px` +
    (violation.findingId === undefined ? '' : ` in finding ${violation.findingId}`) +
    (violation.sectionTitle === undefined
      ? ''
      : ` in section "${violation.sectionTitle.replace(/"/gu, "'")}"`) +
    (violation.textExcerpt === undefined
      ? '.'
      : `, block starting "${violation.textExcerpt.replace(/"/gu, "'")}".`)
  );
}

/** Collects the geometry the pure check above decides over, off the live
 *  post-pagination DOM. Exported so the e2e suites can run the collector
 *  and the pure analysis against an already-paginated page (including one
 *  that renders fine, to prove the gate stays silent there) without going
 *  through the aborting render path. */
export async function collectPagedjsOverflowModels(page: Page): Promise<PagedPageOverflowModel[]> {
  return page.evaluate((): PagedPageOverflowModel[] => {
    // The inline inset is identical on every .sheet fragment (one paged.css
    // rule), so it is read once from the first fragment instead of per page.
    const firstSheet = document.querySelector('.pagedjs_page_content .sheet');
    const sheetStyle = firstSheet === null ? null : getComputedStyle(firstSheet);
    const padLeft = sheetStyle === null ? 0 : Number.parseFloat(sheetStyle.paddingLeft) || 0;
    const padRight = sheetStyle === null ? 0 : Number.parseFloat(sheetStyle.paddingRight) || 0;

    // A section split across pages keeps its id on every fragment but its
    // heading only on the first, so titles are read once per id up front.
    const sectionTitles = new Map<string, string>();
    for (const section of Array.from(document.querySelectorAll('section.sheet[id]'))) {
      const heading = section.querySelector('h1, h2');
      const title = heading?.textContent?.replace(/\s+/gu, ' ').trim();
      if (title && !sectionTitles.has(section.id)) sectionTitles.set(section.id, title);
    }

    return Array.from(document.querySelectorAll('.pagedjs_page')).map((pageEl, pageIndex) => {
      const contentEl = pageEl.querySelector('.pagedjs_page_content');
      const box = contentEl === null ? undefined : contentEl.getBoundingClientRect();
      const contentRect: PagedRect = {
        left: (box?.left ?? 0) + padLeft,
        top: box?.top ?? 0,
        right: (box?.right ?? 0) - padRight,
        bottom: box?.bottom ?? 0,
        width: box?.width ?? 0,
        height: box?.height ?? 0,
      };

      const candidates: PagedOverflowCandidate[] = [];
      if (contentEl !== null) {
        // Only what the sheet fragments contain: see the block comment
        // above for why the fragments themselves and the frames around
        // them are page surface, not candidates.
        for (const el of Array.from(contentEl.querySelectorAll('.sheet *'))) {
          const style = getComputedStyle(el);
          const opacity = Number.parseFloat(style.opacity);
          const painted =
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            (Number.isNaN(opacity) || opacity > 0);
          const r = el.getBoundingClientRect();
          const annexRow = el.closest('[id^="annexref-"]');
          const sectionId = el.closest('section.sheet[id]')?.id;
          const sectionTitle = sectionId === undefined ? undefined : sectionTitles.get(sectionId);
          const text = el.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
          const textExcerpt =
            text === '' ? undefined : text.length > 60 ? `${text.slice(0, 60)}…` : text;
          candidates.push({
            tag: el.tagName,
            painted,
            ...(annexRow === null ? {} : { findingId: annexRow.id.slice('annexref-'.length) }),
            ...(sectionTitle === undefined ? {} : { sectionTitle }),
            ...(textExcerpt === undefined ? {} : { textExcerpt }),
            rect: {
              left: r.left,
              top: r.top,
              right: r.right,
              bottom: r.bottom,
              width: r.width,
              height: r.height,
            },
          });
        }
      }

      return { pageIndex, contentRect, candidates };
    });
  });
}

/** Plan 018: there is deliberately no hard page-count maximum. A document
 *  above this many measured pages is still generated, persisted, and
 *  deliverable; only a non-blocking warning travels with it (CLI output
 *  and the dashboard report row). The threshold lives beside the code
 *  that measures the count so interface and CLI share one source, and the
 *  dashboard mirrors it by value because it reads no workspace packages. */
export const REPORT_PAGE_COUNT_WARNING_THRESHOLD = 60;

export interface ReportPageCountWarning {
  pageCount: number;
  threshold: number;
}

/** Pure warning decision over the measured count, shared by report-stage
 *  and the CLI. A document with no recorded pageCount (a legacy report
 *  generated before it was measured) warns about nothing: absence is
 *  never read as a value. */
export function reportPageCountWarning(
  pageCount: number | undefined,
): ReportPageCountWarning | undefined {
  if (pageCount === undefined || pageCount <= REPORT_PAGE_COUNT_WARNING_THRESHOLD) {
    return undefined;
  }
  return { pageCount, threshold: REPORT_PAGE_COUNT_WARNING_THRESHOLD };
}

export interface RenderedPdfWithPageCount {
  pdf: Buffer;
  pageCount: number;
}

/** Issue #45, second half. Paged.js clones a `<table data-appendix-rule-id>`
 *  (findings-appendix.ts) into every page fragment it splits a rule group
 *  across, attributes intact, but drops the `<thead>` from every fragment
 *  after the first - Paged.js 0.4.3 does not implement CSS's
 *  table-header-group repetition, confirmed against a real 38-page report
 *  (paged.css's D3 comment). `continuationRowId` is the `annexref-<id>` id
 *  of the first finding row on a fragment found missing its header. */
export interface AppendixTableSplitPoint {
  ruleId: string;
  continuationRowId: string;
}

/** Issue #312 raised this from 3: a pass that merges a stale continuation
 *  back (mergeStaleAppendixContinuationsIntoHtml) lets the natural split
 *  land somewhere else, which the next pass repairs. */
const MAX_APPENDIX_LAYOUT_REPAIR_PASSES = 5;

/** Issue #387: stale-continuation merges have their own budget and no longer
 *  spend the repair passes above. The Cap d'Antibes French report merged one
 *  reopened color-contrast table per pass for three passes (each merge exposed
 *  the next), and Paged.js re-split all three at the very same rows: the
 *  room check measured the row fitting (108px of room for a 71px row) where
 *  the layout would not place it. That left one repair pass, whose own
 *  patch stranded the unused-javascript heading with nothing left to repair
 *  it, and the gate refused the PDF. Each row is still merged at most once,
 *  so this cap only bounds the extra layouts. */
const MAX_STALE_CONTINUATION_MERGE_PASSES = 5;

/** Reads the live, post-layout DOM for any appendix table Paged.js split
 *  across pages without repeating the header on a continuation fragment.
 *  Pure detection, no mutation - the fix is applied to the pre-pagination
 *  HTML source and re-laid-out from scratch (see insertRepeatedTheadsIntoHtml),
 *  not by patching the DOM Paged.js already fragmented. */
export async function detectAppendixTableSplits(page: Page): Promise<AppendixTableSplitPoint[]> {
  return page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table[data-appendix-rule-id]'));
    const byRuleId = new Map<string, Element[]>();
    for (const table of tables) {
      const ruleId = table.getAttribute('data-appendix-rule-id') ?? '';
      const list = byRuleId.get(ruleId) ?? [];
      list.push(table);
      byRuleId.set(ruleId, list);
    }
    const splits: { ruleId: string; continuationRowId: string }[] = [];
    for (const [ruleId, tablesForRule] of byRuleId) {
      if (tablesForRule.length < 2) continue;
      // The first element in document order is always the fragment that
      // opened with the real header; only later fragments can have lost it.
      for (let i = 1; i < tablesForRule.length; i++) {
        const table = tablesForRule[i];
        if (!table || table.querySelector('thead')) continue;
        const firstRow = table.querySelector('tr[id^="annexref-"]');
        if (firstRow?.id) splits.push({ ruleId, continuationRowId: firstRow.id });
      }
    }
    return splits;
  });
}

/** Extracts, per rule id, the exact source markup from a table's opening
 *  `<table data-appendix-rule-id="...">` tag through its opening `<tbody>`
 *  tag inclusive (colgroup + thead + tbody-open) - keyed by the first
 *  occurrence in document order, which is always the one still carrying the
 *  real header. Exported for unit testing without a browser. */
export function extractAppendixTablePreambles(html: string): Map<string, string> {
  const preambles = new Map<string, string>();
  const regex = /<table[^>]*data-appendix-rule-id="([^"]*)"[^>]*>[\s\S]*?<tbody>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const ruleId = match[1] ?? '';
    if (!preambles.has(ruleId)) preambles.set(ruleId, match[0]);
  }
  return preambles;
}

/** Removes a degenerate side effect of insertRepeatedTheadsIntoHtml: Paged.js
 *  can still open the freshly-reopened table right at a page boundary,
 *  keeping only its cloned `<thead>` on the page being closed (an empty,
 *  header-only box, measured at 28.5px) and pushing every row of that same
 *  table onto the next page inside yet another reopened fragment that keeps
 *  its own header. The real header the reader needs is the one on that next
 *  fragment; this one is a duplicate with no rows under it, so it is deleted
 *  from the DOM rather than left to print as a stray floating header line.
 *  Safe to run unconditionally after layout has settled: nothing else can
 *  reflow onto the space it leaves behind, since Paged.js already decided no
 *  more content fit there.
 *
 *  Issue #172, closed by #179: this cleanup was, together with the repair
 *  re-pagination above, half of the guarantee that a cloned header never
 *  prints stranded. The other half used to be an accident: the thead's
 *  inline break-after:avoid (findings-appendix.ts) decided whether the
 *  repair loop converged at all, through Chromium behaviour no one could
 *  name. Paged.js reads forced breaks only from stylesheet declarations its
 *  breaks module parses, never inline styles, and the stylesheet
 *  break-after: avoid tried on the thead (2026-09-11, 30-row fixture, real
 *  pipeline) left pagination unchanged: it stamped data-previous-break-after
 *  on the table's tbody, a boundary the chunker never proposes as a break
 *  point (it breaks between rows). #179 removed the reliance by
 *  construction: the repair's reopened tables now carry
 *  data-appendix-continuation and a stylesheet break-before: page, so they
 *  open at a page top with at least one row under their header and
 *  convergence no longer hinges on browser internals. This cleanup stays as
 *  the unconditional post-layout backstop: any header-only fragment that
 *  ever still appears is deleted here, before the gates run. */
async function removeEmptyAppendixTableGhosts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table[data-appendix-rule-id]'));
    for (const table of tables) {
      const hasThead = table.querySelector('thead');
      const hasRow = table.querySelector('tr[id^="annexref-"]');
      if (hasThead && !hasRow) table.remove();
    }
  });
}

/** Marks a table the repair reopened so the injected stylesheet rule below
 *  can force it onto a fresh page. The value is the rule id, for diagnostics
 *  only - the selector deliberately does not key on it. */
const APPENDIX_CONTINUATION_ATTR = 'data-appendix-continuation';

/** The repair's convergence guarantee (issue #179), as a stylesheet rule:
 *  a reopened table always opens at a page top, so its cloned header always
 *  has at least one finding row under it. Stylesheet, not inline, because
 *  Paged.js reads forced breaks only from declarations its breaks module
 *  parses - the same channel forceBreakBeforeAppendixRuleGroups uses. */
const APPENDIX_CONTINUATION_BREAK_RULE = `table[${APPENDIX_CONTINUATION_ATTR}] { break-before: page; }`;

/** Pure string transform, no browser needed: for each detected split point,
 *  closes the currently-open table right before the continuation row and
 *  reopens a fresh, valid sibling `<table>` (same rule id, colgroup and a
 *  cloned header) starting at that row. This produces two ordinary,
 *  well-formed tables in the source rather than one non-conforming table
 *  with two `<thead>` elements, and mirrors what Paged.js already treats
 *  each page's fragment as. Never forces a whole rule group onto one page
 *  (trade-off 17): it only ever duplicates the header markup that was
 *  already going to render at that exact row.
 *
 *  Issue #179: each reopened table is also marked
 *  `data-appendix-continuation` and the matching break-before: page rule is
 *  injected once before `</head>`. Without it, whether a reopened table
 *  kept its cloned header instead of stranding it as a header-only fragment
 *  at the page being closed decided the bounded repair loop's convergence,
 *  and that decision rode on undocumented Chromium behaviour (the thead's
 *  since-retired inline break-after:avoid, findings-appendix.ts). With it,
 *  convergence is structural: the reopened table opens at a page top, so
 *  the split it repairs cannot re-form at that boundary. The price is a
 *  possibly shorter page before each reopened table, the same cost the #170
 *  strand repair already pays for moving a group start. Rule ids are
 *  constrained to scanner-id characters before being embedded in the
 *  attribute value; anything else still gets the cloned header, just no
 *  mark, and the fail-closed gates stay the backstop.
 *
 *  Two shapes are deliberately left unmarked, both measured:
 *
 *  A split whose continuation row is the group's FIRST finding row is not a
 *  mid-table split - it is the retreat shape, where Paged.js keeps the
 *  header with the group heading and moves every row (the #170 fixture
 *  shape). Forcing that reopened table onto a fresh page would yank the
 *  rows away from a heading the strand repair relocates in the very same
 *  pass, and the heading would strand between the two forced breaks
 *  (measured, filler 150mm of the heading-keep sweep).
 *
 *  A rule id the same pass also strand- or duplication-repairs
 *  (strandRepairedRuleIds) gets no marks either: its group-level
 *  break-before: page already relocates the group start, and stacking a
 *  table-level forced break inside a group whose heading Paged.js clones at
 *  internal fragment boundaries produced strand shapes the once-only group
 *  rules cannot reach (measured on the stress fixture, paged-invariants'
 *  #171 gauntlet). The exemption is per pass: a group whose strand clears
 *  while its split persists gets marked on a later pass. In both shapes the
 *  header clone still rides along, unmarked. */
export function insertRepeatedTheadsIntoHtml(
  html: string,
  splits: readonly AppendixTableSplitPoint[],
  tablePreambleByRuleId: ReadonlyMap<string, string>,
  strandRepairedRuleIds: ReadonlySet<string> = new Set(),
): string {
  let result = html;
  let markedTables = 0;
  for (const { ruleId, continuationRowId } of splits) {
    const preamble = tablePreambleByRuleId.get(ruleId);
    if (!preamble) continue;
    const rowMarker = `<tr id="${continuationRowId}"`;
    const rowIndex = result.indexOf(rowMarker);
    if (rowIndex === -1) continue;
    // The original table always precedes any reopened sibling, so this is
    // the original table's opening tag.
    const originalTableIndex = result.indexOf(preamble);
    const firstRowIndex =
      originalTableIndex === -1
        ? -1
        : result.indexOf('<tr id="annexref-', originalTableIndex + preamble.length);
    const isRetreatShape = firstRowIndex !== -1 && result.startsWith(rowMarker, firstRowIndex);
    const markable =
      /^[a-z0-9._-]+$/i.test(ruleId) && !isRetreatShape && !strandRepairedRuleIds.has(ruleId);
    if (markable) {
      const markedPreamble = preamble.replace(
        '<table',
        `<table ${APPENDIX_CONTINUATION_ATTR}="${ruleId}"`,
      );
      result = `${result.slice(0, rowIndex)}</tbody></table>${markedPreamble}${result.slice(rowIndex)}`;
      markedTables++;
    } else {
      result = `${result.slice(0, rowIndex)}</tbody></table>${preamble}${result.slice(rowIndex)}`;
    }
  }
  const headClose = result.indexOf('</head>');
  if (
    markedTables > 0 &&
    headClose !== -1 &&
    !result.includes(`table[${APPENDIX_CONTINUATION_ATTR}]`)
  ) {
    result = `${result.slice(0, headClose)}<style>${APPENDIX_CONTINUATION_BREAK_RULE}</style>${result.slice(headClose)}`;
  }
  return result;
}

/** Issue #312. A table the repair reopened (insertRepeatedTheadsIntoHtml)
 *  whose reason to exist no longer holds in the current layout. Every repair
 *  pass re-lays the document out, so a split repaired in one pass can move:
 *  a later strand repair or an earlier reopened table shifts the rows, and
 *  the reopened table then either sits mid-page right under the previous
 *  fragment of its own group (the column header printed again between two
 *  rows) or keeps forcing a page break the rows no longer need (a delivered
 *  report showed two rows, then a page about 60% blank). */
interface StaleAppendixContinuation {
  ruleId: string;
  /** The `annexref-<id>` id of the reopened table's first finding row. */
  continuationRowId: string;
}

/** Reads the live, post-layout DOM for reopened appendix tables that are
 *  stale in the sense above. A reopened table is any table of a rule group,
 *  after the group's first, that still carries a `<thead>` (Paged.js drops
 *  the header from its own continuation fragments, so a header there came
 *  from the source). It is stale when the previous fragment of the same
 *  group ends on the same physical page, or when it was forced onto a fresh
 *  page although its first row would have fit below that previous fragment.
 *  Pure detection, no mutation. */
async function detectStaleAppendixContinuations(page: Page): Promise<StaleAppendixContinuation[]> {
  return page.evaluate((continuationAttr) => {
    const tables = Array.from(document.querySelectorAll('table[data-appendix-rule-id]'));
    const byRuleId = new Map<string, Element[]>();
    for (const table of tables) {
      const ruleId = table.getAttribute('data-appendix-rule-id') ?? '';
      byRuleId.set(ruleId, [...(byRuleId.get(ruleId) ?? []), table]);
    }
    const stale: { ruleId: string; continuationRowId: string }[] = [];
    for (const [ruleId, fragments] of byRuleId) {
      for (let i = 1; i < fragments.length; i++) {
        const table = fragments[i];
        const previous = fragments[i - 1];
        if (!table || !previous || !table.querySelector('thead')) continue;
        const firstRow = table.querySelector('tr[id^="annexref-"]');
        // A header-only ghost is removeEmptyAppendixTableGhosts's to delete,
        // and a previous ghost says nothing about where rows ended.
        if (!firstRow?.id || !previous.querySelector('tr[id^="annexref-"]')) continue;
        const pageEl = table.closest('.pagedjs_page');
        const previousPageEl = previous.closest('.pagedjs_page');
        if (pageEl !== null && pageEl === previousPageEl) {
          stale.push({ ruleId, continuationRowId: firstRow.id });
          continue;
        }
        if (!table.hasAttribute(continuationAttr)) continue;
        const area = previousPageEl?.querySelector('.pagedjs_page_content');
        if (!area) continue;
        const room = area.getBoundingClientRect().bottom - previous.getBoundingClientRect().bottom;
        if (room > firstRow.getBoundingClientRect().height + 1) {
          stale.push({ ruleId, continuationRowId: firstRow.id });
        }
      }
    }
    return stale;
  }, APPENDIX_CONTINUATION_ATTR);
}

/** Pure string transform, the inverse of insertRepeatedTheadsIntoHtml for
 *  the given rows: removes the `</tbody></table>` plus reopened preamble
 *  sitting directly before each continuation row, so the rows flow on in
 *  the table before them and Paged.js decides the split afresh. A row not
 *  preceded by a reopened table of its own rule group is left untouched. */
export function mergeStaleAppendixContinuationsIntoHtml(
  html: string,
  stale: readonly StaleAppendixContinuation[],
): string {
  let result = html;
  for (const { ruleId, continuationRowId } of stale) {
    const rowIndex = result.indexOf(`<tr id="${continuationRowId}"`);
    if (rowIndex === -1) continue;
    const closeIndex = result.lastIndexOf('</tbody></table>', rowIndex);
    if (closeIndex === -1) continue;
    const reopened = result.slice(closeIndex + '</tbody></table>'.length, rowIndex);
    const isReopenedPreamble =
      reopened.startsWith('<table') &&
      reopened.includes(`data-appendix-rule-id="${ruleId}"`) &&
      reopened.trimEnd().endsWith('<tbody>') &&
      !reopened.includes('<tr id="annexref-');
    // The table being closed must belong to the same group, or this is a
    // group's own first table directly after another group's.
    const closedTableTag = result.slice(result.lastIndexOf('<table', closeIndex), closeIndex);
    const closesSameGroup = closedTableTag.includes(`data-appendix-rule-id="${ruleId}"`);
    if (!isReopenedPreamble || !closesSameGroup) continue;
    result = `${result.slice(0, closeIndex)}${result.slice(rowIndex)}`;
  }
  return result;
}

/** Issue #311. Blocks the first layout showed would fit whole in the room
 *  under their predecessor: numbered sections (by id) and annex categories
 *  (by data-appendix-category). */
export interface FlowingBlocks {
  sectionIds: string[];
  appendixCategories: string[];
}

/** The gap a flowed block keeps from what precedes it, plus a margin for
 *  Paged.js rounding: the section head's --space-12 cushion (33.6px) and
 *  the annex category's own --space-12 bottom margin. */
const FLOW_CUSHION_PX = 48;

/** Reads the post-layout DOM for sections and annex categories that sit on
 *  a single page and would fit whole under the previous block of the same
 *  kind on that block's last page. Greedy in document order: a block that
 *  flows uses up room, and the next block measures against what is left.
 *  Standalone sheets (contents, checklist, annex opening) never receive a
 *  flowed section, and the cover and standalone sheets never flow. Pure
 *  detection, no mutation. */
async function detectFlowingBlocks(page: Page): Promise<FlowingBlocks> {
  // No named inner functions: the dev runner's name-keeping transform would
  // reference a helper that does not exist inside the page.
  return page.evaluate((cushion) => {
    const chains: { key: string; fragments: Element[]; fixed: boolean }[][] = [[], []];
    const sources: [string, 'id' | 'data-appendix-category'][] = [
      ['section.sheet', 'id'],
      ['.appendix-category[data-appendix-category]', 'data-appendix-category'],
    ];
    sources.forEach(([selector, attribute], chainIndex) => {
      const chain = chains[chainIndex] ?? [];
      for (const el of Array.from(document.querySelectorAll(selector))) {
        const key = el.getAttribute(attribute) ?? '';
        const existing = chain.find((unit) => unit.key === key);
        if (existing && key !== '') {
          existing.fragments.push(el);
          continue;
        }
        const fixed =
          key === '' ||
          el.classList.contains('sheet-cover') ||
          el.classList.contains('sheet-standalone');
        chain.push({ key, fragments: [el], fixed });
      }
    });

    const flowing = chains.map((chain) => {
      const keys: string[] = [];
      let room = 0;
      for (const unit of chain) {
        const first = unit.fragments[0];
        const last = unit.fragments[unit.fragments.length - 1];
        if (!first || !last) continue;
        const firstPage = first.closest('.pagedjs_page');
        const onePage = unit.fragments.every((f) => f.closest('.pagedjs_page') === firstPage);
        const height = last.getBoundingClientRect().bottom - first.getBoundingClientRect().top;
        if (!unit.fixed && onePage && height + cushion <= room) {
          keys.push(unit.key);
          room -= height + cushion;
          continue;
        }
        const areaBottom =
          last
            .closest('.pagedjs_page')
            ?.querySelector('.pagedjs_page_content')
            ?.getBoundingClientRect().bottom ?? 0;
        room = unit.fixed ? 0 : areaBottom - last.getBoundingClientRect().bottom;
      }
      return keys;
    });
    return { sectionIds: flowing[0] ?? [], appendixCategories: flowing[1] ?? [] };
  }, FLOW_CUSHION_PX);
}

/** Pure string transform: adds the flow class (paged.css, issue #311) to
 *  each named section's and annex category's opening tag. Ids and category
 *  names are constrained to plain token characters before being matched. */
export function markFlowingBlocksInHtml(html: string, blocks: FlowingBlocks): string {
  let result = html;
  for (const id of blocks.sectionIds) {
    if (!/^[a-z0-9-]+$/i.test(id)) continue;
    result = result.replace(
      new RegExp(`<section class="sheet([^"]*)" id="${id}">`),
      `<section class="sheet$1 sheet-flow" id="${id}">`,
    );
  }
  for (const category of blocks.appendixCategories) {
    if (!/^[a-z0-9-]+$/i.test(category)) continue;
    result = result.replace(
      `<div class="appendix-category" data-appendix-category="${category}"`,
      `<div class="appendix-category appendix-category-flow" data-appendix-category="${category}"`,
    );
  }
  return result;
}

/** Issue #170. One annex rule group heading's placement on the paginated
 *  page: `followedByRow` is true when the heading's own detail table sits
 *  directly after it on the SAME page fragment with at least one finding
 *  row under it. A heading left as the last content of a page - its table
 *  moved wholly to the next page, or reduced to a row-less fragment - is
 *  the strand the Les Corderies French report shipped (page 26, issue
 *  #170): a paying client reads the hanging title as a layout error. */
export interface AppendixHeadingPlacement {
  ruleId: string;
  followedByRow: boolean;
}

/** Reads the live, post-layout DOM for every annex rule group heading and
 *  whether its table with at least one finding row followed it on the same
 *  page. Pure detection, no mutation - the fix is applied to the
 *  pre-pagination HTML source and re-laid-out from scratch (see
 *  forceBreakBeforeAppendixRuleGroups), never by patching the DOM Paged.js
 *  already fragmented. */
async function detectStrandedAppendixRuleHeadings(page: Page): Promise<AppendixHeadingPlacement[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('.appendix-rule-head[data-appendix-rule-id]')).map(
      (heading) => {
        const table = heading.nextElementSibling;
        return {
          ruleId: heading.getAttribute('data-appendix-rule-id') ?? '',
          followedByRow:
            table !== null &&
            table.tagName === 'TABLE' &&
            table.querySelector('tr[id^="annexref-"]') !== null,
        };
      },
    );
  });
}

/** Issue #171. One annex rule group heading observed in the paginated DOM:
 *  the physical page it sits on, the group's data-appendix-rule-id, and the
 *  heading's own text. The stress fixture (28 source groups) was measured
 *  paginating to 29 headings with Paged.js silently duplicating the
 *  stress-minor-rule-0 heading and logging no console error at all - the
 *  console guard above cannot catch this variant by definition. */
export interface AppendixHeadingOccurrence {
  ruleId: string;
  text: string;
  pageIndex: number;
}

/** Pure decision over the collected placements, no DOM: the rule ids of
 *  stranded headings, deduplicated in document order. A heading whose rule
 *  id is empty (the source always sets one, so this would mean markup
 *  drift) is still reported - it cannot be repaired and must fail the gate
 *  below rather than ship. */
export function findStrandedAppendixRuleIds(
  placements: readonly AppendixHeadingPlacement[],
): string[] {
  const stranded: string[] = [];
  for (const { ruleId, followedByRow } of placements) {
    if (!followedByRow && !stranded.includes(ruleId)) stranded.push(ruleId);
  }
  return stranded;
}

/** Collects the per-page heading occurrences the pure check below decides
 *  over, off the live post-pagination DOM. */
async function detectAppendixHeadingOccurrences(page: Page): Promise<AppendixHeadingOccurrence[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('.pagedjs_page')).flatMap((pageEl, pageIndex) =>
      Array.from(pageEl.querySelectorAll('.appendix-rule-head[data-appendix-rule-id]')).map(
        (heading) => ({
          ruleId: heading.getAttribute('data-appendix-rule-id') ?? '',
          text: (heading.textContent ?? '').trim(),
          pageIndex,
        }),
      ),
    );
  });
}

/** Pure decision over the collected occurrences, no DOM: the rule ids of
 *  headings whose exact text shows up on more than one physical page,
 *  deduplicated in document order. A legitimate report renders each annex
 *  group heading exactly once, so a verbatim repeat across pages is always
 *  Paged.js duplicating a fragment (issue #171), never content. A repeat
 *  within a single page is deliberately not flagged here, matching the
 *  cross-page semantics of the structural duplicate gate (which fails the
 *  render below when a duplication survives repair). A heading with an
 *  empty rule id that repeats still reports its (empty) id: it cannot be
 *  repaired and is left for the gates to abort on, the same posture as
 *  findStrandedAppendixRuleIds. */
export function findDuplicatedAppendixHeadingRuleIds(
  occurrences: readonly AppendixHeadingOccurrence[],
): string[] {
  const firstSeenByText = new Map<string, number>();
  const duplicated: string[] = [];
  for (const { ruleId, text, pageIndex } of occurrences) {
    const key = text.trim();
    if (key.length === 0) continue;
    const firstSeenPage = firstSeenByText.get(key);
    if (
      firstSeenPage !== undefined &&
      firstSeenPage !== pageIndex &&
      !duplicated.includes(ruleId)
    ) {
      duplicated.push(ruleId);
    }
    if (firstSeenPage === undefined) firstSeenByText.set(key, pageIndex);
  }
  return duplicated;
}

/** Why the repair patches the SOURCE instead of the paginated DOM: Paged.js
 *  learns about forced breaks from STYLESHEET declarations only (inline
 *  styles never reach its breaks parser), so the fix must be a rule the
 *  breaks parser can see - one break-before: page per stranded group,
 *  targeting the group wrapper (findings-appendix.ts's .appendix-rule-group
 *  div). The same measurements killed the two simpler ideas: a declarative
 *  CSS keep-with-next never holds (in the stranded shape the engine decides
 *  the break INSIDE the group's table, whose rows cannot split under
 *  paged.css's orphans/widows and row atomicity, so the whole table
 *  retreats to the next page, and it never re-consults a marker on the
 *  heading or the table - a filler-height sweep against the real pipeline,
 *  filler 158-177mm, stranded the heading identically with and without a
 *  stylesheet break-after: avoid on it), and Paged.js 0.4.3 does not
 *  implement break-after: page as a forced break at all (its chunker only
 *  honours left/right/verso/recto for break-after), so a break-carrying
 *  spacer element is inert.
 *
 *  Measured against the stress fixture (2026-09-10): this repair resolved
 *  all eight stranded headings with the correct heading set and every
 *  finding row intact in the final DOM. Relocating the group's start is
 *  exactly the reading order a client expects; the price is a shorter page
 *  before it, the same cost any keep-together pays. This never keeps a
 *  group on ONE page (trade-off 17): rows still flow across page breaks;
 *  only the group's START moves.
 *
 *  Each stranded group's rule is injected at most once, so a repair pass
 *  that cannot fix a remaining strand makes no source progress and the
 *  bounded loop terminates; whatever is still stranded then fails the gate,
 *  fail-closed. Ids are constrained to scanner-id characters for the
 *  selector; anything else (markup drift) is skipped here and left for the
 *  gate to abort on. */
export function forceBreakBeforeAppendixRuleGroups(
  html: string,
  ruleIds: readonly string[],
): string {
  const pending = ruleIds.filter(
    (ruleId) =>
      /^[a-z0-9._-]+$/i.test(ruleId) &&
      !html.includes(`.appendix-rule-group[data-appendix-rule-id="${ruleId}"]`),
  );
  if (pending.length === 0) return html;
  const rules = pending
    .map(
      (ruleId) => `.appendix-rule-group[data-appendix-rule-id="${ruleId}"] { break-before: page; }`,
    )
    .join(' ');
  const headClose = html.indexOf('</head>');
  if (headClose === -1) return html;
  return `${html.slice(0, headClose)}<style>${rules}</style>${html.slice(headClose)}`;
}

/** Issue #303. One heading left as the last painted thing on a page, its
 *  content starting on the next: the defect issue #170 fixed for annex
 *  rule group headings, observed one level up on the annex's category
 *  headings ("Référencement (SEO)", "Rendu", "Visibilité dans les moteurs
 *  d'IA (GEO)", "À traiter avec vos prestataires tiers") across two
 *  delivered reports. `category` is the group wrapper's own
 *  data-appendix-category when the heading carries one, so the repair can
 *  target it; a stranded heading with no repairable hook still reports,
 *  and fails the gate rather than shipping. */
export interface TrailingHeadingPlacement {
  pageIndex: number;
  tag: string;
  text: string;
  category?: string;
}

/** Reads the post-layout DOM for the last painted, text-carrying element on
 *  each page and reports it when it is (or sits inside) a heading. Geometry,
 *  not document order: Paged.js fragments containers, so the element that
 *  paints lowest on a page is not reliably the last one in the fragment's
 *  markup. Pure detection, no mutation - the repair patches the
 *  pre-pagination source, same as issue #170's. Exported so the e2e suites
 *  can run it against an already-paginated page, including one that
 *  paginates cleanly, without going through the aborting render path. */
export async function detectTrailingHeadings(page: Page): Promise<TrailingHeadingPlacement[]> {
  return page.evaluate(() => {
    // A sliver of a fragment's own border or a decorative rule is not
    // content; the same negligible-box floor the overflow gate uses.
    const MIN_PAINTED_PX = 2;
    return Array.from(document.querySelectorAll('.pagedjs_page')).flatMap(
      (pageEl, pageIndex): TrailingHeadingPlacement[] => {
        const content = pageEl.querySelector('.pagedjs_page_content');
        if (content === null) return [];
        let lowest: Element | undefined;
        let lowestBottom = Number.NEGATIVE_INFINITY;
        for (const el of Array.from(content.querySelectorAll('.sheet *'))) {
          if ((el.textContent ?? '').trim().length === 0) continue;
          const style = getComputedStyle(el);
          const opacity = Number.parseFloat(style.opacity);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          if (!Number.isNaN(opacity) && opacity <= 0) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < MIN_PAINTED_PX || rect.height < MIN_PAINTED_PX) continue;
          // Ties go to the deeper element, which is the one actually
          // carrying the text rather than a wrapper ending at the same
          // edge.
          if (rect.bottom >= lowestBottom) {
            lowestBottom = rect.bottom;
            lowest = el;
          }
        }
        const heading = lowest?.closest('h1, h2, h3, h4, h5, h6');
        if (heading === undefined || heading === null) return [];
        const category = heading.getAttribute('data-appendix-category');
        return [
          {
            pageIndex,
            tag: heading.tagName,
            text: (heading.textContent ?? '').trim(),
            ...(category === null ? {} : { category }),
          },
        ];
      },
    );
  });
}

/** Issue #303's fail-closed floor: undefined when no page ends on a
 *  heading, otherwise the failure naming each one. Deliberately covers
 *  every heading, not only the repairable annex categories - a heading
 *  hanging at a page foot reads as a layout error to a paying client
 *  wherever it is, and one this repair cannot move must stop the render
 *  rather than ship. */
export function describeTrailingHeadings(
  placements: readonly TrailingHeadingPlacement[],
): string | undefined {
  if (placements.length === 0) return undefined;
  const described = placements
    .map((p) => `"${p.text}" (<${p.tag.toLowerCase()}>, page ${p.pageIndex + 1})`)
    .join(', ');
  return `Heading(s) ${described} are the last painted content on their page, with the content they introduce starting on the next (issue #303).`;
}

/** Pure gate description, no DOM: undefined when every annex heading sits
 *  with at least one of its finding rows, otherwise the failure naming the
 *  stranded rule ids. Runs after the bounded repair loop so a strand that
 *  survived every pass aborts generation instead of shipping a report with
 *  a hanging heading - the same never-ship-a-broken-layout contract as the
 *  structural and overflow gates. */
export function describeStrandedAppendixRuleHeadings(
  ruleIds: readonly string[],
): string | undefined {
  if (ruleIds.length === 0) return undefined;
  return (
    `Annex rule group heading(s) ${ruleIds.join(', ')} are stranded at a page bottom with ` +
    `none of their finding rows on the same page (issue #170).`
  );
}

export async function renderPdfWithPageCountFromHtml(
  html: string,
  browser: Browser,
): Promise<RenderedPdfWithPageCount> {
  const pagedjsSource = await readPagedjsSource();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    let pagedjsLayoutFailure: string | undefined;
    let debugNodePromise: Promise<void> | undefined;
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes(PAGEDJS_LAYOUT_REPEATED_MARKER)) {
        pagedjsLayoutFailure = msg.text();
        if (process.env['ODYSSEUS_DEBUG_PAGEDJS']) {
          debugNodePromise = Promise.all(
            msg.args().map((a) =>
              a
                .evaluate((n: unknown) => {
                  const el = n as Element;
                  return el && el.outerHTML ? el.outerHTML.slice(0, 2000) : String(n);
                })
                .catch(
                  (e: unknown) => `<unresolvable: ${e instanceof Error ? e.message : String(e)}>`,
                ),
            ),
          ).then((parts) => {
            console.error('[pagedjs:debug-node]', parts.join('\n---\n'));
          });
        }
      }
      if (process.env['ODYSSEUS_DEBUG_PAGEDJS']) {
        console.error(`[pagedjs:${msg.type()}] ${msg.text()}`);
      }
    });

    // The HTML is fully self-contained (CSS and fonts inlined as data
    // URIs), so there is nothing to wait on network-wise; 'load' is
    // enough. document.fonts.ready still matters even so: font-display:
    // block means Chromium's own layout can proceed before the woff2
    // decode finishes, and Paged.js measures element heights to decide
    // page breaks - a font swap after that measurement produces different
    // page breaks on every run (nocturne.css's own font-display comment).
    async function runPagedjsPreview(currentHtml: string): Promise<void> {
      pagedjsLayoutFailure = undefined;
      debugNodePromise = undefined;
      await page.setContent(currentHtml, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.addScriptTag({ content: pagedjsSource });
      await page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Paged = (globalThis as any).Paged;
        const previewer = new Paged.Previewer();
        await previewer.preview();
      });
      if (debugNodePromise) await debugNodePromise;
      if (pagedjsLayoutFailure !== undefined) {
        throw new Error(
          `Report generation aborted: Paged.js hit its own layout-repeated guard and stopped ` +
            `laying out the document early, which silently drops every page after that point. ` +
            `Never shipped to a client. Paged.js message: "${pagedjsLayoutFailure}"`,
        );
      }
    }

    let currentHtml = html;
    await runPagedjsPreview(currentHtml);

    // Issue #311: short sections and annex categories that fit whole under
    // their predecessor follow it instead of opening a page. Measured on the
    // first layout and applied once, before the annex repairs below, which
    // then work on the flowed document.
    const flowing = await detectFlowingBlocks(page);
    if (flowing.sectionIds.length > 0 || flowing.appendixCategories.length > 0) {
      const flowed = markFlowingBlocksInHtml(currentHtml, flowing);
      if (flowed !== currentHtml) {
        currentHtml = flowed;
        await runPagedjsPreview(currentHtml);
      }
    }

    // Issue #45, second half + issue #170 + issue #171 + issue #179: repair,
    // against the real post-layout DOM, the three appendix pagination defects
    // the layout engine itself cannot be talked out of - a rule group
    // continuation fragment missing its column header (#45, whose repair
    // also forces each reopened table onto a fresh page so convergence is
    // structural, not a favour from browser internals), a rule group heading
    // stranded at a page bottom with its whole table on the next page
    // (#170), and a rule group heading Paged.js silently duplicated with no
    // console error (#171). All three repairs patch the pre-pagination HTML
    // source and re-lay-out from scratch; for a duplication the source patch
    // is the same fresh-page start the strand repair uses, which moves the
    // group's boundary away from the heading Paged.js kept re-cloning.
    // Reports with none of the defects pay nothing extra - detection finds
    // nothing and the loop exits after the very first pass, exactly as
    // before these fixes. Bounded per MAX_APPENDIX_LAYOUT_REPAIR_PASSES (and
    // MAX_STALE_CONTINUATION_MERGE_PASSES for the #312 merges):
    // each pass only ever pushes content downward (a repeated header adds
    // markup at an existing row boundary; a break rule moves a group start
    // to a fresh page), so one pass can expose a strand, a split or a
    // duplication further down that a later pass then repairs, but nothing
    // can loop. Anything still broken after the bound is caught by the
    // gates below and aborts: a persistent duplication fails the structural
    // gate (the selector now covers .appendix-rule-head), so a client PDF
    // can never ship a duplicated rule heading.
    const mergedContinuationRowIds = new Set<string>();
    let repairPasses = 0;
    let mergePasses = 0;
    while (repairPasses < MAX_APPENDIX_LAYOUT_REPAIR_PASSES) {
      // Issue #312: a stale reopened table is merged back on its own pass,
      // before any other repair reads this layout, since the merge moves
      // the rows every other detection would be measuring.
      // A row is merged at most once, so a measurement Paged.js disagrees
      // with cannot oscillate. Issue #387: a merge does not spend a repair
      // pass, so the repair passes after it are all still there to repair
      // the split it re-exposes and whatever that repair moves in turn.
      const stale = (await detectStaleAppendixContinuations(page)).filter(
        (item) => !mergedContinuationRowIds.has(item.continuationRowId),
      );
      if (stale.length > 0 && mergePasses < MAX_STALE_CONTINUATION_MERGE_PASSES) {
        const merged = mergeStaleAppendixContinuationsIntoHtml(currentHtml, stale);
        if (merged !== currentHtml) {
          for (const item of stale) mergedContinuationRowIds.add(item.continuationRowId);
          currentHtml = merged;
          mergePasses++;
          await runPagedjsPreview(currentHtml);
          continue;
        }
      }
      const splits = await detectAppendixTableSplits(page);
      const stranded = findStrandedAppendixRuleIds(await detectStrandedAppendixRuleHeadings(page));
      const duplicated = findDuplicatedAppendixHeadingRuleIds(
        await detectAppendixHeadingOccurrences(page),
      );
      if (splits.length === 0 && stranded.length === 0 && duplicated.length === 0) break;
      const preambles = extractAppendixTablePreambles(currentHtml);
      const strandIds = new Set([...stranded, ...duplicated]);
      const patched = forceBreakBeforeAppendixRuleGroups(
        insertRepeatedTheadsIntoHtml(currentHtml, splits, preambles, strandIds),
        [...strandIds],
      );
      if (patched === currentHtml) break;
      currentHtml = patched;
      repairPasses++;
      await runPagedjsPreview(currentHtml);
    }
    await removeEmptyAppendixTableGhosts(page);

    const structure = await analyzePagedjsPagesInBrowser(page);
    const structuralFailure = describePagedjsStructuralFailure(structure);
    if (structuralFailure !== undefined) {
      throw new Error(`Report generation aborted: ${structuralFailure} Never shipped to a client.`);
    }

    // Issue #170's fail-closed floor: whatever the bounded repair loop
    // could not fix is a hanging heading in a paying client's hands.
    const strandedFailure = describeStrandedAppendixRuleHeadings(
      findStrandedAppendixRuleIds(await detectStrandedAppendixRuleHeadings(page)),
    );
    if (strandedFailure !== undefined) {
      throw new Error(`Report generation aborted: ${strandedFailure} Never shipped to a client.`);
    }

    // Issue #303's own fail-closed floor, for every heading rather than
    // only the annex's.
    const trailingHeadingFailure = describeTrailingHeadings(await detectTrailingHeadings(page));
    if (trailingHeadingFailure !== undefined) {
      throw new Error(
        `Report generation aborted: ${trailingHeadingFailure} Never shipped to a client.`,
      );
    }

    // Issue #118. Geometry runs after the structural gates, never before
    // them: a broken layout produces several signatures at once, and the
    // structural ones name the failure more precisely than a box
    // coordinate can.
    const overflowViolation = analyzePagedjsOverflow(await collectPagedjsOverflowModels(page));
    if (overflowViolation !== undefined) {
      throw new Error(
        `Report generation aborted: ${describePagedjsOverflow(overflowViolation)} ` +
          `Never shipped to a client.`,
      );
    }

    const pdf = await page.pdf({
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      // Without this, Chromium ignores the page's own @page { size: A4 }
      // rule and falls back to its page.pdf() default of Letter, which is
      // wider and shorter than A4: the extra width showed up as white
      // bands down both sides of every sheet, and the missing height
      // clipped the running footer at the bottom of every page.
      preferCSSPageSize: true,
      tagged: true, // fixes E31: an accessibility audit must not ship an untagged PDF
      outline: true, // fixes D26: a bookmark tree derived from the heading hierarchy
    });
    return { pdf, pageCount: structure.pageCount };
  } finally {
    await context.close();
  }
}

/** Compatibility wrapper for callers that only need the bytes (the two
 *  template e2e suites): the page count is measured either way, they just
 *  drop it. */
export async function renderPdfFromHtml(html: string, browser: Browser): Promise<Buffer> {
  return (await renderPdfWithPageCountFromHtml(html, browser)).pdf;
}
