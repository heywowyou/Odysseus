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
  describeTrailingHeadings,
  detectTrailingHeadings,
  detectEmptyThemeCardFragments,
  detectSplitRemainingRules,
  detectWidowedSheetTails,
  forceBreakBeforeRemainingRules,
  forceBreakBeforeThemeCards,
  markSnugBlocksInHtml,
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

/** Issue #303: leaves the annex's first category heading just enough room to
 * print at a page foot while its first rule group moves to the next page -
 * the shape two delivered reports shipped ("Référencement (SEO)", "Rendu",
 * "Visibilité dans les moteurs d'IA (GEO)"). The height was found by
 * sweeping filler heights through the real pipeline; neighbouring heights
 * resolve on their own, which is exactly why the defect survived the
 * unpressured fixture. Re-swept at 158mm (155 to 160 strand) after issue
 * #318 reflowed the analysed-page list above the first category. */
function addAppendixCategoryBoundaryPressure(html: string): string {
  return html.replace(
    '<div class="appendix-category"',
    '<div style="height:158mm" data-appendix-category-pressure></div><div class="appendix-category"',
  );
}

/** Issue #304: makes the priority card's own body tall enough that the
 * break falls immediately before its context footer - the shape two
 * delivered reports shipped, where a page opened with "Conformité : Non
 * conforme · Constats : f181, f188, f189" and nothing else. 180mm was found
 * by sweeping through the real pipeline; above ~230mm the preceding row is
 * taller than a page on its own and no keep-together can be satisfied. */
function addThemeContextBoundaryPressure(html: string): string {
  return html.replace(
    '<div class="theme-row theme-row-context">',
    '<div class="theme-row" style="height:180mm" data-theme-context-pressure></div><div class="theme-row theme-row-context">',
  );
}

/** Makes the first priority card's action row nearly a page tall by
 * adding short items to its body just above its tail (themes.ts renderActionRow). A real
 * English report had that shape: #304's keep-with-previous carried the
 * whole row to the next page with the footer, the pair no longer fit, and
 * the overflow gate refused the report. */
function addTallActionRowPressure(html: string, extraItems: number): string {
  const items = Array.from(
    { length: extraItems },
    (_, i) => `<li data-action-row-pressure>Action ${i + 1}</li>`,
  ).join('');
  return html.replace(
    /(\s*<\/div>\s*<div class="theme-row-tail">)/u,
    `<ul class="theme-list theme-list-continued">${items}</ul>$1`,
  );
}

/** Undoes paged.css's issue #304 rule, for the same reason
 * withoutAppendixCategoryPageBreak exists: with the rule in place the
 * defect cannot be produced, so the assertion needs the unfixed document to
 * mean anything. */
function withoutThemeContextKeepWithPrevious(html: string): string {
  return html.replace(
    '</head>',
    '<style>.theme-row-context { break-before: auto; }</style></head>',
  );
}

/** Counts priority-card context footers that open a page with none of their
 * own card above them on that page. */
async function countOrphanedThemeContextRows(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      Array.from(document.querySelectorAll('.pagedjs_page')).flatMap((pageEl) =>
        Array.from(pageEl.querySelectorAll('.theme-row-context')).filter((context) => {
          const cardFragment = context.closest('.theme-card');
          return (
            cardFragment !== null &&
            cardFragment.querySelector(
              '.theme-card-header, .theme-row:not(.theme-row-context), .theme-row-tail',
            ) === null
          );
        }),
      ).length,
  );
}

/** Pushes the first priority card down the page by `mm`, so a sweep moves
 * its page break through every block of the card in turn. */
function addFirstThemeOffset(html: string, mm: number): string {
  return html.replace(
    '<div class="card elev-sm theme-card"',
    `<div style="height:${mm}mm" data-theme-offset-pressure></div><div class="card elev-sm theme-card"`,
  );
}

/** Makes the first priority card's last action item as tall as a real
 * remediation with its code snippet (~50mm on the delivered Villas Foch
 * report), wherever the template places that item. */
function addSnippetSizedLastActionItem(html: string): string {
  const contextAt = html.indexOf('<div class="theme-row theme-row-context">');
  const lastItemEnd = html.lastIndexOf('</li>', contextAt);
  return `${html.slice(0, lastItemEnd)}<div style="height:45mm" data-snippet-pressure></div>${html.slice(lastItemEnd)}`;
}

/** The largest blank band, in millimetres, that a priority card leaves at the
 * foot of a page before continuing on the next one. A delivered Villas Foch
 * report left ~105mm: the footer's keep-with-previous carried the atomic
 * footer (conformity, sourced figure, finding references) and the atomic
 * last remediation with its code snippet to the next page as one block. */
async function largestThemeCardFootGapMm(page: Page): Promise<number> {
  return page.evaluate(() => {
    let largest = 0;
    for (const pageEl of Array.from(document.querySelectorAll('.pagedjs_page'))) {
      const area = pageEl.querySelector('.pagedjs_page_content');
      if (area === null) continue;
      const areaBottom = area.getBoundingClientRect().bottom;
      for (const card of Array.from(pageEl.querySelectorAll('.theme-card[data-split-to]'))) {
        let contentBottom = card.getBoundingClientRect().top;
        for (const el of Array.from(card.querySelectorAll('*'))) {
          const rect = el.getBoundingClientRect();
          if (rect.height > 0 && el.children.length === 0) {
            contentBottom = Math.max(contentBottom, rect.bottom);
          }
        }
        largest = Math.max(largest, ((areaBottom - contentBottom) * 25.4) / 96);
      }
    }
    return largest;
  });
}

/** Undoes paged.css's issue #303 rule, reproducing the layout the two
 * delivered reports shipped. Only a test uses this: it is what makes the
 * gate's own assertion meaningful, since with the rule in place the strand
 * cannot be produced at all. */
function withoutAppendixCategoryPageBreak(html: string): string {
  return html.replace(
    '</head>',
    '<style>.appendix-category { break-before: auto; }</style></head>',
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

  it('issue #303: no page ends on a heading whose content starts on the next', async () => {
    expect(describeTrailingHeadings(await detectTrailingHeadings(doc.page))).toBeUndefined();
  });

  it('issue #303: the gate has teeth - the same document strands a category heading once the forced break is taken away', async () => {
    const pressured = await paginate(
      browser,
      withoutAppendixCategoryPageBreak(addAppendixCategoryBoundaryPressure(stressHtml)),
      pagedjsSource,
    );
    try {
      const placements = await detectTrailingHeadings(pressured.page);
      // Proves the gate has teeth: this is the defect, unrepaired.
      expect(placements.map((p) => p.category)).toContain('accessibility');
      expect(describeTrailingHeadings(placements)).toContain('issue #303');
    } finally {
      await pressured.page.context().close();
    }
  }, 60_000);

  it('issue #303: the production render path repairs that strand instead of shipping it', async () => {
    const { pdf } = await renderPdfWithPageCountFromHtml(
      addAppendixCategoryBoundaryPressure(stressHtml),
      browser,
    );
    // renderPdfWithPageCountFromHtml aborts on a surviving strand, so
    // reaching a PDF at all is the assertion.
    expect(pdf.length).toBeGreaterThan(0);
  }, 180_000);

  it("issue #304: a priority card's context footer never opens a page on its own", async () => {
    expect(await countOrphanedThemeContextRows(doc.page)).toBe(0);

    const pressured = await paginate(
      browser,
      addThemeContextBoundaryPressure(stressHtml),
      pagedjsSource,
    );
    try {
      expect(await countOrphanedThemeContextRows(pressured.page)).toBe(0);
    } finally {
      await pressured.page.context().close();
    }
  }, 60_000);

  it('issue #304: the same pressure orphans the footer once the keep-together is taken away', async () => {
    const unfixed = await paginate(
      browser,
      withoutThemeContextKeepWithPrevious(addThemeContextBoundaryPressure(stressHtml)),
      pagedjsSource,
    );
    try {
      expect(await countOrphanedThemeContextRows(unfixed.page)).toBeGreaterThan(0);
    } finally {
      await unfixed.page.context().close();
    }
  }, 60_000);

  it('issue #304: a near page-tall action row never drags the footer off the page', async () => {
    expect(stressHtml).toContain('class="theme-row-tail"');
    for (let extraItems = 18; extraItems <= 34; extraItems += 1) {
      const pressured = await paginate(
        browser,
        addTallActionRowPressure(stressHtml, extraItems),
        pagedjsSource,
      );
      try {
        const violation = analyzePagedjsOverflow(
          await collectPagedjsOverflowModels(pressured.page),
        );
        const orphaned = await countOrphanedThemeContextRows(pressured.page);
        expect({ extraItems, violation, orphaned }).toEqual({
          extraItems,
          violation: undefined,
          orphaned: 0,
        });
      } finally {
        await pressured.page.context().close();
      }
    }
  }, 600_000);

  it('a priority card that continues on the next page never leaves a large blank band behind it', async () => {
    const worst: { offsetMm: number; gapMm: number }[] = [];
    for (let offsetMm = 0; offsetMm <= 200; offsetMm += 10) {
      const pressured = await paginate(
        browser,
        addFirstThemeOffset(addSnippetSizedLastActionItem(stressHtml), offsetMm),
        pagedjsSource,
      );
      try {
        worst.push({
          offsetMm,
          gapMm: Math.round(await largestThemeCardFootGapMm(pressured.page)),
        });
        expect(await countOrphanedThemeContextRows(pressured.page)).toBe(0);
      } finally {
        await pressured.page.context().close();
      }
    }
    // One atomic snippet-sized item that does not fit leaves ~73mm; the
    // footer dragging that item along (the shipped defect) left 99mm.
    expect(worst.filter(({ gapMm }) => gapMm > 80)).toEqual([]);
  }, 600_000);

  it('a section that spills two lines onto a page of its own pulls them back once set snug', async () => {
    // A text section whose last page still has room: filling that room and
    // two lines more reproduces the one-sentence page the Grand Hôtel des
    // Alpes report ended a section with.
    const target = await doc.page.evaluate(() => {
      for (const first of Array.from(document.querySelectorAll('section.sheet[id]'))) {
        if (first.matches('.sheet-cover, .sheet-metadata, .sheet-standalone')) continue;
        const ref = first.getAttribute('data-ref');
        const fragments = Array.from(document.querySelectorAll(`section.sheet[data-ref="${ref}"]`));
        const last = fragments[fragments.length - 1];
        const area = last?.closest('.pagedjs_page')?.querySelector('.pagedjs_page_content');
        if (!last || !area || !last.querySelector(':scope > p')) continue;
        const room = area.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom;
        if (room > 150) return { id: first.getAttribute('id') ?? '', room };
      }
      return undefined;
    });
    expect(target).toBeDefined();
    const lineHeightPx = 15 * 1.55;
    const lines = Math.floor(target!.room / lineHeightPx) + 2;
    const filler = `<p>${Array.from({ length: lines }, (_, i) => `Ligne ${i + 1}`).join('<br>')}</p>`;
    const open = stressHtml.indexOf(`id="${target!.id}"`);
    const close = stressHtml.indexOf('</section>', open);
    const widowedHtml = stressHtml.slice(0, close) + filler + stressHtml.slice(close);

    const plain = await paginate(browser, widowedHtml, pagedjsSource);
    expect((await detectWidowedSheetTails(plain.page)).sectionIds).toContain(target!.id);

    const snugHtml = markSnugBlocksInHtml(widowedHtml, {
      sectionIds: [target!.id],
      appendixCategories: [],
    });
    const snug = await paginate(browser, snugHtml, pagedjsSource);
    expect((await detectWidowedSheetTails(snug.page)).sectionIds).not.toContain(target!.id);
    expect(snug.pageCount).toBe(plain.pageCount - 1);
  }, 180_000);

  it('an "Autres constats" entry split across two pages is moved whole onto the next one', async () => {
    // The Grand Hôtel de l'Opéra report printed one entry's "Constats : f049"
    // line alone at the top of a page, although every entry is
    // break-inside: avoid. Sliding the entries down the page finds that split.
    expect(stressHtml).toMatch(/<div class="remaining-rule" data-remaining-rule="/u);
    let found: { html: string; split: string[] } | undefined;
    for (let offsetMm = 0; offsetMm <= 240 && !found; offsetMm += 6) {
      const html = stressHtml.replace(
        '<div class="remaining-rule"',
        `<div style="height:${offsetMm}mm"></div><div class="remaining-rule"`,
      );
      const pressured = await paginate(browser, html, pagedjsSource);
      try {
        const split = await detectSplitRemainingRules(pressured.page);
        if (split.length > 0) found = { html, split };
      } finally {
        await pressured.page.context().close();
      }
    }
    expect(found).toBeDefined();

    const moved = await paginate(
      browser,
      forceBreakBeforeRemainingRules(found!.html, found!.split),
      pagedjsSource,
    );
    try {
      expect(await detectSplitRemainingRules(moved.page)).toEqual([]);
    } finally {
      await moved.page.context().close();
    }
  }, 600_000);

  it('a priority card left as an empty shell at a page foot is moved onto the next page', async () => {
    // A real French report painted an empty rounded card under the second
    // priority: the card's header is atomic and moved on, while the card's
    // own box still opened on the page being left. Sliding the priorities
    // down the page finds an offset that reproduces it.
    expect(stressHtml).toMatch(/<div class="card elev-sm theme-card"/u);
    let found: { html: string; empty: string[] } | undefined;
    for (let offsetMm = 0; offsetMm <= 240 && !found; offsetMm += 3) {
      const html = stressHtml.replace(
        '<div class="card elev-sm theme-card"',
        `<div style="height:${offsetMm}mm"></div><div class="card elev-sm theme-card"`,
      );
      const pressured = await paginate(browser, html, pagedjsSource);
      try {
        const empty = await detectEmptyThemeCardFragments(pressured.page);
        if (empty.length > 0) found = { html, empty };
      } finally {
        await pressured.page.context().close();
      }
    }
    expect(found).toBeDefined();

    const moved = await paginate(
      browser,
      forceBreakBeforeThemeCards(found!.html, found!.empty),
      pagedjsSource,
    );
    try {
      expect(await detectEmptyThemeCardFragments(moved.page)).toEqual([]);
    } finally {
      await moved.page.context().close();
    }
  }, 600_000);

  it('the metadata sheet stays on one page when its facts run long', async () => {
    // A two-line scope value plus the legal-name row pushed the Grand Hôtel
    // de l'Opéra metadata sheet past its page, and Paged.js spilled the
    // never-fragmenting sheet sideways.
    const extraRows = Array.from(
      { length: 3 },
      (_, i) =>
        `<div><h6>Rubrique ${i + 1}</h6><div>Société du Grand Hôtel de démonstration, établissement principal et dépendances</div></div>`,
    ).join('');
    expect(stressHtml).toMatch(/<div class="metadata-facts"/u);
    const crowded = await paginate(
      browser,
      stressHtml.replace(/(<div class="metadata-facts"[^>]*>)/u, `$1${extraRows}`),
      pagedjsSource,
    );
    try {
      const layout = await crowded.page.evaluate(() => {
        const fragments = Array.from(document.querySelectorAll('.sheet-metadata'));
        const area = fragments[0]?.closest('.pagedjs_page')?.querySelector('.pagedjs_page_content');
        const box = area?.getBoundingClientRect();
        const overflowing = fragments[0]
          ? Array.from(fragments[0].querySelectorAll('*')).some((el) => {
              const r = el.getBoundingClientRect();
              return box !== undefined && (r.right > box.right + 1 || r.bottom > box.bottom + 1);
            })
          : true;
        return { fragments: fragments.length, overflowing };
      });
      expect(layout).toEqual({ fragments: 1, overflowing: false });
    } finally {
      await crowded.page.context().close();
    }
  }, 60_000);

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
  }, 90_000);

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
