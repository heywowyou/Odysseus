/**
 * Asserts docs/report-design-system.md section 4's invariants against the
 * real Paged.js pipeline (the same one pdf.ts runs), using the stress
 * fixture (section 5) rather than a real scan - "layout is never iterated
 * against a real client scan" is the doc's own working rule, and this is
 * the one place that rule is enforced as a test rather than a convention.
 *
 * Needs real Chromium, matching this repo's *.e2e.test.ts convention,
 * though it isn't named that way since it belongs next to render-html.ts.
 *
 * Per the plan correction that preceded this rebuild: axe-core runs
 * against the POST-PAGINATION DOM (after Paged.js's preview() resolves),
 * not the pre-pagination source - Paged.js clones and fragments the DOM
 * to lay out pages, which can duplicate landmarks or reorder reading
 * order even when the source markup is clean.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '@odysseus/scanner';
import { renderHtml } from './render-html.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import { buildStressFixture, buildStressFixtureNoFindings, buildStressFixtureNoWcagFailures } from '../stress-fixture.js';

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
}

/** Loads html, runs the real Paged.js pipeline (same steps as pdf.ts),
 *  and returns the live Playwright page with the paginated DOM still
 *  attached, for direct DOM assertions - a second, separate call handles
 *  the PDF-bytes-level checks (outline/tagging), since page.pdf() and
 *  DOM inspection can both run against the same paginated page. */
async function paginate(browser: Browser, html: string, pagedjsSource: string): Promise<PaginatedDocument> {
  const context = await browser.newContext();
  const page = await context.newPage();
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
  return { page, pageCount };
}

async function buildStressHtml(): Promise<string> {
  const { manifest, findings, analysis } = buildStressFixture();
  const { pages: renderDiffEvidencePages, totalEligible } = resolveRenderDiffEvidence(manifest, findings);
  return renderHtml({ manifest, findings, analysis, renderDiffEvidencePages, renderDiffTotalEligible: totalEligible });
}

describe('Paged.js invariants against the stress fixture (docs/report-design-system.md section 4)', () => {
  let browser: Browser;
  let pagedjsSource: string;
  let doc: PaginatedDocument;

  beforeAll(async () => {
    [{ browser }, pagedjsSource] = await Promise.all([launchBrowser(), readPagedjsSource()]);
    const html = await buildStressHtml();
    doc = await paginate(browser, html, pagedjsSource);
  }, 60_000);

  afterAll(async () => {
    await browser.close();
  });

  it('invariant 7: total page count for the stress fixture stays within 18 to 26', () => {
    expect(doc.pageCount).toBeGreaterThanOrEqual(18);
    expect(doc.pageCount).toBeLessThanOrEqual(26);
  });

  it('invariant 5: the DOM page count matches what Paged.js itself resolved counter(pages) to', async () => {
    const domPageCount = await doc.page.evaluate(() => document.querySelectorAll('.pagedjs_page').length);
    expect(domPageCount).toBe(doc.pageCount);
  });

  it('invariant 4: every page carries the footer string and a page-counter rule in its margin boxes', async () => {
    const marginInfo = await doc.page.evaluate(() =>
      Array.from(document.querySelectorAll('.pagedjs_page')).map((p) => {
        const topRight = p.querySelector('.pagedjs_margin-top-right .pagedjs_margin-content');
        const bottomCenter = p.querySelector('.pagedjs_margin-bottom-center .pagedjs_margin-content');
        return {
          counterRule: topRight ? getComputedStyle(topRight, '::after').content : '',
          footerRule: bottomCenter ? getComputedStyle(bottomCenter, '::after').content : '',
        };
      }),
    );

    expect(marginInfo.length).toBe(doc.pageCount);
    for (const { counterRule, footerRule } of marginInfo) {
      expect(counterRule).toContain('counter(page)');
      expect(counterRule).toContain('counter(pages)');
      // The footer string comes from .footer-source via string-set (never
      // literal markup per the doc), so every page's rule must resolve to
      // the same non-empty string() reference, not fall back to "none".
      expect(footerRule).not.toBe('none');
      expect(footerRule.length).toBeGreaterThan(0);
    }
  });

  it('invariant 1: no <img> renders taller than 90mm (vacuously true here: section 08 has no <img> at all, per doc §3)', async () => {
    const imgHeights = await doc.page.evaluate(() =>
      Array.from(document.querySelectorAll('.pagedjs_page img')).map((img) => img.getBoundingClientRect().height),
    );
    // 90mm at 96dpi ~= 340px; Paged.js renders at print resolution, so use
    // a generous px-per-mm estimate rather than assume a fixed DPI.
    const NINETY_MM_IN_PX = 90 * 3.7795;
    for (const height of imgHeights) {
      expect(height).toBeLessThanOrEqual(NINETY_MM_IN_PX);
    }
  });

  it('invariant 6: no page scrolls horizontally - content never spills off the printed sheet', async () => {
    const overflowing = await doc.page.evaluate(() =>
      Array.from(document.querySelectorAll('.pagedjs_page')).filter(
        (p) => p.scrollWidth > p.clientWidth + 1,
      ).length,
    );
    expect(overflowing).toBe(0);
  });

  it('invariant 3: no sheet mixes content from two different numbered sections', async () => {
    // Every numbered section's <h6> eyebrow is unique text; a page
    // containing more than one distinct eyebrow means Paged.js fragmented
    // two different <section class="sheet"> elements onto the same
    // printed page, which the design forbids (each section always starts
    // its own sheet - "a section may overflow onto a second sheet; it may
    // never share a sheet with the next section").
    const eyebrowsPerPage = await doc.page.evaluate(() =>
      Array.from(document.querySelectorAll('.pagedjs_page')).map((p) =>
        Array.from(p.querySelectorAll('h6')).map((h) => h.textContent?.trim()),
      ),
    );
    for (const eyebrows of eyebrowsPerPage) {
      const distinct = new Set(eyebrows.filter((e): e is string => !!e));
      expect(distinct.size).toBeLessThanOrEqual(1);
    }
  });

  it('invariant 2: no sheet is more than 80 percent empty, except the cover', async () => {
    const fillRatios = await doc.page.evaluate(() =>
      Array.from(document.querySelectorAll('.pagedjs_page')).map((p, index) => {
        const pageRect = p.getBoundingClientRect();
        const contentEls = Array.from(p.querySelectorAll('.pagedjs_page_content *')).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.height > 0 && r.width > 0;
        });
        const maxBottom = contentEls.reduce((max, el) => Math.max(max, el.getBoundingClientRect().bottom), pageRect.top);
        const usedHeight = maxBottom - pageRect.top;
        return { index, ratio: usedHeight / pageRect.height };
      }),
    );

    for (const { index, ratio } of fillRatios) {
      if (index === 0) continue; // cover is exempt from the 80%-empty rule itself
      expect(ratio).toBeGreaterThan(0.2);
    }
  });

  it('the cover page (exempt from invariant 2\'s fill ratio) still carries its own real content, not a blank sheet', async () => {
    // A real regression this test would have caught: an earlier version
    // of paged.css's named `cover` page interacting with a `.footer-source`
    // node placed before the document flow pushed the cover's entire
    // content onto page 2, leaving page 1 blank apart from the footer/
    // counter margin boxes - invariant 2's blind "skip index 0" exemption
    // let it through silently. This checks page 1 actually contains the
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
});

describe('Paged.js invariants against doc §5\'s two empty-branch variants', () => {
  let browser: Browser;
  let pagedjsSource: string;

  beforeAll(async () => {
    [{ browser }, pagedjsSource] = await Promise.all([launchBrowser(), readPagedjsSource()]);
  }, 30_000);

  afterAll(async () => {
    await browser.close();
  });

  it('renders and paginates the zero-WCAG-failures variant without error', async () => {
    const { manifest, findings, analysis } = buildStressFixtureNoWcagFailures();
    const { pages: renderDiffEvidencePages, totalEligible } = resolveRenderDiffEvidence(manifest, findings);
    const html = await renderHtml({
      manifest,
      findings,
      analysis,
      renderDiffEvidencePages,
      renderDiffTotalEligible: totalEligible,
    });
    const doc = await paginate(browser, html, pagedjsSource);
    expect(doc.pageCount).toBeGreaterThan(0);
    await doc.page.context().close();
  }, 30_000);

  it('renders and paginates the zero-findings variant without error', async () => {
    const { manifest, findings, analysis } = buildStressFixtureNoFindings();
    const { pages: renderDiffEvidencePages, totalEligible } = resolveRenderDiffEvidence(manifest, findings);
    const html = await renderHtml({
      manifest,
      findings,
      analysis,
      renderDiffEvidencePages,
      renderDiffTotalEligible: totalEligible,
    });
    const doc = await paginate(browser, html, pagedjsSource);
    expect(doc.pageCount).toBeGreaterThan(0);
    await doc.page.context().close();
  }, 30_000);
});
