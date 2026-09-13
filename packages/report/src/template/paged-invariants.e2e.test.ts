/**
 * Asserts docs/report/report-design-system.md section 4's invariants against the
 * real Paged.js pipeline (the same one pdf.ts runs), using the stress
 * fixture (section 5) rather than a real scan - "layout is never iterated
 * against a real client scan" is the doc's own working rule, and this is
 * the one place that rule is enforced as a test rather than a convention.
 *
 * Needs real Chromium, matching this repo's *.e2e.test.ts convention.
 *
 * Plan 018 (2026-08-30 executive review) replaced compact flow with the
 * one-section-per-page contract: every numbered .sheet starts on a fresh
 * physical page, sparse pages are an accepted executive-reading choice,
 * and there is no page-count range to assert anymore. Per the plan
 * correction that preceded the axe rebuild: axe-core runs against the
 * POST-PAGINATION DOM (after Paged.js's preview() resolves), not the
 * pre-pagination source - Paged.js clones and fragments the DOM to lay
 * out pages, which can duplicate landmarks or reorder reading order even
 * when the source markup is clean.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '@odysseus/scanner';
import { renderHtml } from './render-html.js';
import {
  analyzePagedjsOverflow,
  collectPagedjsOverflowModels,
  renderPdfWithPageCountFromHtml,
} from '../pdf.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import {
  buildStressFixture,
  buildStressFixtureNoFindings,
  buildStressFixtureNoWcagFailures,
} from '../stress-fixture.js';

const require = createRequire(import.meta.url);
const WCAG22AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function readPagedjsSource(): Promise<string> {
  const entryPath = require.resolve('pagedjs');
  const packageRoot = path.dirname(path.dirname(entryPath));
  return fs.readFile(path.join(packageRoot, 'dist', 'paged.js'), 'utf-8');
}

interface PaginatedDocument {
  page: Page;
  pageCount: number;
  /** Console error-level messages Paged.js itself logged while laying
   *  out the document, most importantly its own "Layout repeated"
   *  infinite-loop guard (pdf.ts's PAGEDJS_LAYOUT_REPEATED_MARKER):
   *  when it detects it would reprocess the same fragment boundary
   *  without making progress, it aborts and silently drops every page
   *  after that point rather than hanging. A real client report (La
   *  Corniche, report-feedback-la-corniche.md items 0.2/0.7) shipped
   *  with its last several pages missing this way, with no error
   *  surfaced anywhere - the PDF byte stream was completely well-formed,
   *  just truncated. Neither variant of the stress fixture happened to
   *  trigger it (confirmed: it is sensitive to a specific document shape
   *  the stress fixture does not reproduce), so this is asserted
   *  generically against every pagination test in this file instead of
   *  chasing one narrow synthetic repro - the same console-error
   *  detection pdf.ts's renderPdfFromHtml now performs before ever
   *  returning a PDF to a caller. */
  consoleErrors: string[];
}

/** Loads html, runs the real Paged.js pipeline (same steps as pdf.ts),
 *  and returns the live Playwright page with the paginated DOM still
 *  attached, for direct DOM assertions - a second, separate call handles
 *  the PDF-bytes-level checks (outline/tagging), since page.pdf() and
 *  DOM inspection can both run against the same paginated page. */
async function paginate(
  browser: Browser,
  html: string,
  pagedjsSource: string,
): Promise<PaginatedDocument> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.addScriptTag({ content: pagedjsSource });
  const pageCount = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Paged = (globalThis as any).Paged;
    const previewer = new Paged.Previewer();
    const flow = await previewer.preview();
    return flow.pages.length;
  });
  return { page, pageCount, consoleErrors };
}

async function buildStressHtml(): Promise<string> {
  const { manifest, findings, analysis } = buildStressFixture();
  const { pages: renderDiffEvidencePages, totalEligible } = resolveRenderDiffEvidence(
    manifest,
    findings,
  );
  return renderHtml({
    manifest,
    findings,
    analysis,
    renderDiffEvidencePages,
    renderDiffTotalEligible: totalEligible,
  });
}

/** Reproduces the real Villas Foch failure shape: the legal context leaves
 * too little space for the bounded executive-summary jump panel. The panel
 * must move as one unit, never leave its heading at a page bottom while its
 * rows start the next page. */
function addStartHereBoundaryPressure(html: string): string {
  return html.replace(
    '<div class="start-here"',
    '<div style="height:120mm" data-start-here-pressure></div><div class="start-here"',
  );
}

/** Leaves enough room for a priority's heading and opening explanation but
 * not its whole card. An atomic card would move to the next page and strand
 * the section heading; a fragmentable card starts in the remaining space. */
function addFirstThemeBoundaryPressure(html: string): string {
  return html.replace(
    '<div class="card elev-sm theme-card"',
    '<div style="height:105mm" data-theme-boundary-pressure></div><div class="card elev-sm theme-card"',
  );
}

const THEME_OVERFLOW_BLOCK_COUNT = 48;

/** Extends priority 1 beyond a physical page with uniquely labelled blocks,
 * exercising genuine multi-page fragmentation and text preservation. */
function makeFirstThemeOversized(html: string): string {
  const firstThemeStart = html.indexOf('id="theme-1"');
  const secondThemeStart = html.indexOf('id="theme-2"', firstThemeStart);
  if (firstThemeStart < 0 || secondThemeStart < 0) return html;
  const firstThemeEnd = html.lastIndexOf('</div>', secondThemeStart);
  const blocks = Array.from(
    { length: THEME_OVERFLOW_BLOCK_COUNT },
    (_, index) =>
      `<p data-theme-overflow-block="${index + 1}">Priority overflow marker ${index + 1}: preserved exactly once.</p>`,
  ).join('');
  return `${html.slice(0, firstThemeEnd)}${blocks}${html.slice(firstThemeEnd)}`;
}

/** Every sheet eyebrow in source document order. html-utils.ts's sheet()
 *  helper, toc.ts, and metadata-sheet.ts are the only h6 emitters in the
 *  package (verified by plan 018's step-2 work), so each h6 marks exactly
 *  one sheet start: the metadata sheet, the TOC, and every included
 *  numbered section, cover excluded (it renders no h6). Comparing this
 *  source sequence against the paginated DOM's first appearances asserts
 *  the whole reading order without hardcoding section ids, so section
 *  reorders and conditional suppressions (section-06, section-10) cannot
 *  stale this file. */
function sheetEyebrowsFromSource(html: string): string[] {
  return [...html.matchAll(/<h6[^>]*>([\s\S]*?)<\/h6>/g)].map((m) =>
    (m[1] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim(),
  );
}

/** The id of every numbered section in source document order (cover and
 *  TOC pass no id to sheet(); every numbered section passes exactly one).
 *  Same extraction shape as section-registry.test.ts's DOM-order check,
 *  but applied to the pre-pagination source so the paginated-DOM order
 *  assertion below stays independent of the registry's runtime state. */
function sectionIdsFromSource(html: string): string[] {
  return [...html.matchAll(/<section class="sheet[^"]*" id="(section-[^"]+)">/g)].map(
    (match) => match[1] ?? '',
  );
}

// One Chromium and one Paged.js source read per file: the describes below
// only paginate different documents against the same browser.
let browser: Browser;
let pagedjsSource: string;

beforeAll(async () => {
  [{ browser }, pagedjsSource] = await Promise.all([launchBrowser(), readPagedjsSource()]);
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe('Paged.js invariants against the stress fixture (docs/report/report-design-system.md section 4)', () => {
  let doc: PaginatedDocument;
  let stressHtml: string;

  beforeAll(async () => {
    stressHtml = await buildStressHtml();
    doc = await paginate(browser, stressHtml, pagedjsSource);
  }, 60_000);

  it('Paged.js never hits its own layout-repeated bailout while paginating the stress fixture', () => {
    expect(doc.consoleErrors).toEqual([]);
  });

  // Plan 018 retired the 18-to-32 page-count range along with compact
  // flow: one numbered section per page genuinely grows the document
  // (the stress fixture paginates to ~35 pages), and the contract now
  // carries no length failure at all - above 60 pages the report stage
  // attaches a non-blocking warning instead (report-stage.ts).

  it('invariant 5: the DOM page count matches what Paged.js itself resolved counter(pages) to', async () => {
    const domPageCount = await doc.page.evaluate(
      () => document.querySelectorAll('.pagedjs_page').length,
    );
    expect(domPageCount).toBe(doc.pageCount);
  });

  // item D-flaky (report-feedback-palais-gallien-v2.md follow-up session):
  // this test was previously reported "flaky"/"environmental" against a
  // getComputedStyle(el, '::after').content bug that supposedly broke
  // pseudo-element content resolution in this sandboxed Chromium
  // regardless of what CSS it read. Direct investigation (querying the
  // exact same property against a single real page in isolation) showed
  // the mechanism actually works correctly and deterministically - the
  // real bug was this test asserting a page-counter rule on *every*
  // page, including the cover, whose @page cover rule (paged.css)
  // deliberately sets `@top-right { content: ""; }` (documented right
  // there: "the page counter is dropped for this page only rather than
  // repositioned over the gradient with its own contrast rules").
  it('invariant 4: every non-cover page carries the footer string and a page-counter rule in its margin boxes', async () => {
    const marginInfo = await doc.page.evaluate(() =>
      Array.from(document.querySelectorAll('.pagedjs_page')).map((p) => {
        const topRight = p.querySelector('.pagedjs_margin-top-right .pagedjs_margin-content');
        const bottomCenter = p.querySelector(
          '.pagedjs_margin-bottom-center .pagedjs_margin-content',
        );
        return {
          isCover: p.classList.contains('pagedjs_cover_page'),
          counterRule: topRight ? getComputedStyle(topRight, '::after').content : '',
          footerRule: bottomCenter ? getComputedStyle(bottomCenter, '::after').content : '',
        };
      }),
    );

    expect(marginInfo.length).toBe(doc.pageCount);
    for (const { isCover, counterRule, footerRule } of marginInfo) {
      if (isCover) {
        // The cover deliberately has no running page counter (see comment
        // above) - asserting it stays empty, rather than skipping the
        // page outright, so a future accidental counter on the cover
        // would also be caught.
        expect(counterRule).toBe('""');
        continue;
      }
      expect(counterRule).toContain('counter(page)');
      expect(counterRule).toContain('counter(pages)');
      // The footer string comes from .footer-source via string-set (never
      // literal markup per the doc), so every non-cover page's rule must
      // resolve to the same non-empty string() reference, not fall back
      // to "none".
      expect(footerRule).not.toBe('none');
      expect(footerRule.length).toBeGreaterThan(0);
    }
  });

  // B8's target-counter(attr(href url), page) resolution (the TOC page
  // numbers) was tried here as a direct computed-style assertion, the
  // same shape as invariant 4 above - dropped after confirming it doesn't
  // actually work that way: Paged.js resolves target-counter through its
  // own two-stage polyfill (the ::after content resolves to an
  // intermediate `counter(target-counter-<uuid>)` reference, itself
  // defined by a second, separately generated stylesheet rule per
  // element), not a single CSS content value invariant 4's direct
  // getComputedStyle check can read in one step. toc.test.ts's static
  // assertions (every row links to its section's id, one .toc-page span
  // per row) and manual verification against a real `page.pdf()` render
  // remain the actual coverage for B8.

  it('invariant 1: no <img> renders taller than 90mm (vacuously true here: section 08 has no <img> at all, per doc §3)', async () => {
    const imgHeights = await doc.page.evaluate(() =>
      Array.from(document.querySelectorAll('.pagedjs_page img')).map(
        (img) => img.getBoundingClientRect().height,
      ),
    );
    // 90mm at 96dpi ~= 340px; Paged.js renders at print resolution, so use
    // a generous px-per-mm estimate rather than assume a fixed DPI.
    const NINETY_MM_IN_PX = 90 * 3.7795;
    for (const height of imgHeights) {
      expect(height).toBeLessThanOrEqual(NINETY_MM_IN_PX);
    }
  });

  it('invariant 6: no page scrolls horizontally - content never spills off the printed sheet', async () => {
    const overflowing = await doc.page.evaluate(
      () =>
        Array.from(document.querySelectorAll('.pagedjs_page')).filter(
          (p) => p.scrollWidth > p.clientWidth + 1,
        ).length,
    );
    expect(overflowing).toBe(0);
  });

  // Issue #118: the overflow gate pdf.ts runs on every real render must
  // stay silent across this whole 35-page document (cover gradient,
  // running heads and footers, appendix continuation headers, tables,
  // glossary). This is the broadest no-false-positive check the gate has,
  // and it costs nothing here: the pages are already laid out above.
  it('invariant 6c: the issue #118 overflow gate finds no painted content outside any printable content rectangle', async () => {
    const violation = analyzePagedjsOverflow(await collectPagedjsOverflowModels(doc.page));
    expect(violation).toBeUndefined();
  });

  it('invariant 6a: the bounded start-here panel never fragments across physical pages', async () => {
    const pressured = await paginate(
      browser,
      addStartHereBoundaryPressure(stressHtml),
      pagedjsSource,
    );
    try {
      const pageIndexes = await pressured.page.evaluate(() =>
        Array.from(document.querySelectorAll('.pagedjs_page')).flatMap((physicalPage, index) =>
          physicalPage.querySelector('[data-render-atomic="start-here"]') === null ? [] : [index],
        ),
      );
      expect(pageIndexes).toHaveLength(1);
    } finally {
      await pressured.page.context().close();
    }
  }, 60_000);

  it('invariant 6b: the bounded start-here panel declares the keep-together rule', async () => {
    const breakInside = await doc.page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('[data-render-atomic="start-here"]');
      return panel === null ? undefined : getComputedStyle(panel).breakInside;
    });
    expect(breakInside).toBe('avoid');
  });

  it('invariant 7a: priority 1 starts beside its section heading when the whole card cannot fit', async () => {
    const pressured = await paginate(
      browser,
      addFirstThemeBoundaryPressure(stressHtml),
      pagedjsSource,
    );
    try {
      const sharesPage = await pressured.page.evaluate(() =>
        Array.from(document.querySelectorAll('.pagedjs_page')).some(
          (physicalPage) =>
            physicalPage.querySelector('#section-04 .section-head') !== null &&
            physicalPage.querySelector('#theme-1') !== null,
        ),
      );
      expect(sharesPage).toBe(true);
    } finally {
      await pressured.page.context().close();
    }
  }, 60_000);

  it('invariant 7b: an oversized priority fragments without losing, duplicating, or orphaning content', async () => {
    const oversized = await paginate(browser, makeFirstThemeOversized(stressHtml), pagedjsSource);
    try {
      const result = await oversized.page.evaluate((blockCount) => {
        const pages = Array.from(document.querySelectorAll('.pagedjs_page'));
        const themePages = pages.flatMap((physicalPage, index) =>
          physicalPage.querySelector('[data-theme-overflow-block]') === null ? [] : [index],
        );
        const markerCounts = Array.from(
          { length: blockCount },
          (_, index) =>
            document.querySelectorAll(`[data-theme-overflow-block="${index + 1}"]`).length,
        );
        const headerPage = pages.findIndex(
          (physicalPage) => physicalPage.querySelector('#theme-1 .theme-card-header') !== null,
        );
        const openingPage = pages.findIndex(
          (physicalPage) => physicalPage.querySelector('#theme-1 .theme-row-problem') !== null,
        );
        return {
          themePages,
          markerCounts,
          headerPage,
          openingPage,
          hasBlankInteriorPage: pages
            .slice(1, -1)
            .some((physicalPage) => (physicalPage.textContent ?? '').trim() === ''),
        };
      }, THEME_OVERFLOW_BLOCK_COUNT);

      expect(new Set(result.themePages).size).toBeGreaterThan(1);
      expect(result.markerCounts).toEqual(
        Array.from({ length: THEME_OVERFLOW_BLOCK_COUNT }, () => 1),
      );
      expect(result.headerPage).toBe(result.openingPage);
      expect(result.hasBlankInteriorPage).toBe(false);
    } finally {
      await oversized.page.context().close();
    }
  }, 60_000);

  // Plan 018's replacement for the retired three-per-page cap: every
  // numbered .sheet starts on a fresh physical page, so a page carries at
  // most one sheet eyebrow (the metadata sheet, the TOC, and every
  // included numbered section; the cover renders no h6). The first
  // appearance order of those eyebrows across pages must equal the
  // source document's h6 sequence, which asserts every included sheet is
  // represented exactly once, in reading order, with the glossary last
  // (plan 024's glossary-last reversal of trade-off 44). Sparse
  // continuation pages (a sheet's second, third...
  // page carries no eyebrow) are the accepted executive-reading choice,
  // so no fill-ratio is asserted anywhere in this file anymore.
  it('invariant 3: exactly one sheet start per physical page, and every included sheet appears exactly once in source order', async () => {
    const pagesInfo = await doc.page.evaluate(() =>
      Array.from(document.querySelectorAll('.pagedjs_page')).map((p) => ({
        h6s: Array.from(p.querySelectorAll('h6')).map((h) => (h.textContent ?? '').trim()),
        // A section element carrying an h6 descendant is that section's
        // start fragment; Paged.js continuation shells clone the section
        // element but not its heading, so the h6 filter is what makes
        // this a start detector rather than a presence detector.
        sectionStarts: Array.from(p.querySelectorAll('section[id^="section-"]'))
          .filter((el) => el.querySelector('h6') !== null)
          .map((el) => el.id),
      })),
    );

    const firstAppearances: string[] = [];
    for (const { h6s } of pagesInfo) {
      const distinct = new Set(h6s.filter((t) => t.length > 0));
      expect(distinct.size).toBeLessThanOrEqual(1);
      for (const eyebrow of distinct) {
        if (!firstAppearances.includes(eyebrow)) firstAppearances.push(eyebrow);
      }
    }
    expect(firstAppearances).toEqual(sheetEyebrowsFromSource(stressHtml));

    const sectionStartOrder = pagesInfo.flatMap((p) => p.sectionStarts);
    expect(sectionStartOrder).toEqual(sectionIdsFromSource(stressHtml));
    // Trade-off 44 as amended 2026-09-01 (plan 024): the glossary is
    // always the final section, the technical appendix second to last.
    const sectionIds = sectionIdsFromSource(stressHtml);
    expect(sectionIds[sectionIds.length - 1]).toBe('section-13');
    expect(sectionIds[sectionIds.length - 2]).toBe('section-12');
  });

  // Belt and braces on top of invariant 3 for the sheets whose isolation
  // matters most: the metadata sheet, the checklist, and the findings
  // appendix must never share their opening page with another sheet.
  it('invariant 3b: the metadata sheet, checklist, and findings appendix never share their opening page with another section', async () => {
    const standaloneEyebrows = await doc.page.evaluate(() => {
      const result: string[][] = [];
      for (const p of Array.from(document.querySelectorAll('.pagedjs_page'))) {
        const standalone = p.querySelector('#report-metadata h6, #section-05 h6, #section-12 h6');
        if (!standalone) continue;
        result.push(
          Array.from(p.querySelectorAll('h6'))
            .map((h) => h.textContent?.trim())
            .filter((t): t is string => !!t),
        );
      }
      return result;
    });
    for (const eyebrows of standaloneEyebrows) {
      const distinct = new Set(eyebrows);
      expect(distinct.size).toBe(1);
    }
  });

  it('the cover page still carries its own real content, not a blank sheet', async () => {
    // A real regression this test would have caught: an earlier version
    // of paged.css's named `cover` page interacting with a `.footer-source`
    // node placed before the document flow pushed the cover's entire
    // content onto page 2, leaving page 1 blank apart from the footer/
    // counter margin boxes. This checks page 1 actually contains the
    // cover's own title, not merely that some page somewhere does.
    const coverText = await doc.page.evaluate(
      () => document.querySelector('.pagedjs_page')?.querySelector('h1')?.textContent ?? '',
    );
    expect(coverText.length).toBeGreaterThan(0);
  });

  it('invariant 8a: the paginated DOM passes its own axe-core audit (post-pagination, not pre-)', async () => {
    const results = await new AxeBuilder({ page: doc.page }).withTags(WCAG22AA_TAGS).analyze();
    if (results.violations.length > 0) {
      const summary = results.violations
        .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) - ${v.help}`)
        .join('\n');
      throw new Error(`Paginated report DOM failed its own axe-core audit:\n${summary}`);
    }
    expect(results.violations).toEqual([]);
  }, 60_000);

  it('invariant 8b: the generated PDF is tagged and carries a bookmark outline', async () => {
    const pdf = await doc.page.pdf({
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      tagged: true,
      outline: true,
    });
    const text = pdf.toString('latin1');
    expect(text).toContain('/Outlines');
    expect(text).toContain('/StructTreeRoot');
  });

  // Issue #171: the raw pagination above runs no repair loop, so it can
  // observe a defect the production path must repair or abort on (the
  // fixture's 28 annex groups were measured paginating to 29 headings this
  // way, Paged.js silently duplicating one). This is the one check that the
  // full production render - thead, strand and duplication repairs plus the
  // fail-closed structural, strand and overflow gates - composes into a
  // working deliverable on the exact document the defects were measured
  // against. A throw here means the pipeline correctly refused to ship a
  // broken layout; a success means every gate stayed silent.
  it('issue #171: the production render path (repairs plus gates) delivers the stress fixture', async () => {
    const result = await renderPdfWithPageCountFromHtml(stressHtml, browser);
    expect(result.pageCount).toBeGreaterThan(0);
    expect(result.pdf.length).toBeGreaterThan(1000);
  }, 300_000);
});

describe("Paged.js invariants against doc §5's two empty-branch variants", () => {
  it('renders and paginates the zero-WCAG-failures variant without error', async () => {
    const { manifest, findings, analysis } = buildStressFixtureNoWcagFailures();
    const { pages: renderDiffEvidencePages, totalEligible } = resolveRenderDiffEvidence(
      manifest,
      findings,
    );
    const html = await renderHtml({
      manifest,
      findings,
      analysis,
      renderDiffEvidencePages,
      renderDiffTotalEligible: totalEligible,
    });
    const doc = await paginate(browser, html, pagedjsSource);
    expect(doc.pageCount).toBeGreaterThan(0);
    expect(doc.consoleErrors).toEqual([]);
    await doc.page.context().close();
  }, 30_000);

  it('renders and paginates the zero-findings variant without error', async () => {
    const { manifest, findings, analysis } = buildStressFixtureNoFindings();
    const { pages: renderDiffEvidencePages, totalEligible } = resolveRenderDiffEvidence(
      manifest,
      findings,
    );
    const html = await renderHtml({
      manifest,
      findings,
      analysis,
      renderDiffEvidencePages,
      renderDiffTotalEligible: totalEligible,
    });
    const doc = await paginate(browser, html, pagedjsSource);
    expect(doc.pageCount).toBeGreaterThan(0);
    expect(doc.consoleErrors).toEqual([]);
    await doc.page.context().close();
  }, 30_000);
});
