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
 *  grants it) must carry some text, and no block from this report's own
 *  set of "atomic, never-split" classes (paged.css's `.card,
 *  .render-card, .theme-card, .glossary-entry, .section-head`) may
 *  have identical text content appearing on two different pages - a
 *  legitimate report never repeats a card or a glossary term verbatim,
 *  so any match is Paged.js duplicating a fragment, not real content.
 *  Scoped to those classes rather than every element on the page so a
 *  deliberately repeated short string (a rule id like "f001" appearing
 *  in both a priority card and the annex, for instance) never false-
 *  positives. Deliberately excludes `table`/`thead`: the appendix
 *  thead-repair pass below (issue #45) intentionally clones a rule group's
 *  header onto more than one page, which must never trip this check. */
const ATOMIC_BLOCK_SELECTOR = '.card, .render-card, .theme-card, .glossary-entry, .section-head';

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
        return { pageIndex: p.pageIndex, tag: candidate.tag, ...overflow };
      }
    }
  }
  return undefined;
}

export function describePagedjsOverflow(violation: PagedjsOverflowViolation): string {
  return (
    `Painted content <${violation.tag.toLowerCase()}> extends past the printable content rectangle ` +
    `on physical page ${violation.pageIndex + 1} at ${violation.side} by ${violation.amountPx}px.`
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
          candidates.push({
            tag: el.tagName,
            painted,
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

const MAX_APPENDIX_THEAD_REPAIR_PASSES = 3;

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
 *  more content fit there. */
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

/** Pure string transform, no browser needed: for each detected split point,
 *  closes the currently-open table right before the continuation row and
 *  reopens a fresh, valid sibling `<table>` (same rule id, colgroup and a
 *  cloned header) starting at that row. This produces two ordinary,
 *  well-formed tables in the source rather than one non-conforming table
 *  with two `<thead>` elements, and mirrors what Paged.js already treats
 *  each page's fragment as. Never forces a whole rule group onto one page
 *  (trade-off 17): it only ever duplicates the header markup that was
 *  already going to render at that exact row. */
export function insertRepeatedTheadsIntoHtml(
  html: string,
  splits: readonly AppendixTableSplitPoint[],
  tablePreambleByRuleId: ReadonlyMap<string, string>,
): string {
  let result = html;
  for (const { ruleId, continuationRowId } of splits) {
    const preamble = tablePreambleByRuleId.get(ruleId);
    if (!preamble) continue;
    const rowMarker = `<tr id="${continuationRowId}"`;
    const rowIndex = result.indexOf(rowMarker);
    if (rowIndex === -1) continue;
    result = `${result.slice(0, rowIndex)}</tbody></table>${preamble}${result.slice(rowIndex)}`;
  }
  return result;
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

    // Issue #45, second half: repair any appendix rule-group table that
    // lost its column header on a continuation page. Reports with no
    // multi-page rule group pay nothing extra - detection finds no splits
    // and the loop exits after the very first pass, exactly as before this
    // fix. Bounded per MAX_APPENDIX_THEAD_REPAIR_PASSES: each pass can only
    // ever push a fragment's own later rows onto a further page, matching
    // trade-off 17's "no group-level atomicity, bounded per-row only".
    for (let attempt = 0; attempt < MAX_APPENDIX_THEAD_REPAIR_PASSES; attempt++) {
      const splits = await detectAppendixTableSplits(page);
      if (splits.length === 0) break;
      const preambles = extractAppendixTablePreambles(currentHtml);
      const patched = insertRepeatedTheadsIntoHtml(currentHtml, splits, preambles);
      if (patched === currentHtml) break;
      currentHtml = patched;
      await runPagedjsPreview(currentHtml);
    }
    await removeEmptyAppendixTableGhosts(page);

    const structure = await analyzePagedjsPagesInBrowser(page);
    const structuralFailure = describePagedjsStructuralFailure(structure);
    if (structuralFailure !== undefined) {
      throw new Error(`Report generation aborted: ${structuralFailure} Never shipped to a client.`);
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
