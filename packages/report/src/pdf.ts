/**
 * Prints the fully composed, self-contained HTML (render-html.ts) to PDF
 * via a real paged-media engine, per docs/report-design-system.md section
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
 *  positives. */
const ATOMIC_BLOCK_SELECTOR = '.card, .render-card, .theme-card, .glossary-entry, .section-head';

async function detectPagedjsStructuralFailure(page: Page): Promise<string | undefined> {
  const result = await page.evaluate((selector) => {
    const pages = Array.from(document.querySelectorAll('.pagedjs_page'));
    const blankPageIndex = pages.findIndex((p, i) => i > 0 && (p.textContent ?? '').trim().length === 0);

    const seenOnPage = new Map<string, number>();
    let duplicateText: string | undefined;
    pages.forEach((p, pageIndex) => {
      const blocks = Array.from(p.querySelectorAll(selector));
      for (const block of blocks) {
        const text = block.textContent?.trim();
        if (!text) continue;
        const previousPage = seenOnPage.get(text);
        if (previousPage !== undefined && previousPage !== pageIndex) {
          duplicateText = text;
          break;
        }
        seenOnPage.set(text, pageIndex);
      }
      if (duplicateText) return;
    });

    return { blankPageIndex, duplicateText, pageCount: pages.length };
  }, ATOMIC_BLOCK_SELECTOR);

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
  return undefined;
}

export async function renderPdfFromHtml(html: string, browser: Browser): Promise<Buffer> {
  const pagedjsSource = await readPagedjsSource();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    // The HTML is fully self-contained (CSS and fonts inlined as data
    // URIs), so there is nothing to wait on network-wise; 'load' is
    // enough. document.fonts.ready still matters even so: font-display:
    // block means Chromium's own layout can proceed before the woff2
    // decode finishes, and Paged.js measures element heights to decide
    // page breaks - a font swap after that measurement produces different
    // page breaks on every run (nocturne.css's own font-display comment).
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    let pagedjsLayoutFailure: string | undefined;
    let debugNodePromise: Promise<void> | undefined;
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes(PAGEDJS_LAYOUT_REPEATED_MARKER)) {
        pagedjsLayoutFailure = msg.text();
        if (process.env['ODYSSEUS_DEBUG_PAGEDJS']) {
          debugNodePromise = Promise.all(msg.args().map((a) => a.evaluate((n: unknown) => {
            const el = n as Element;
            return el && el.outerHTML ? el.outerHTML.slice(0, 2000) : String(n);
          }).catch((e: unknown) => `<unresolvable: ${e instanceof Error ? e.message : String(e)}>`))).then((parts) => {
            // eslint-disable-next-line no-console
            console.error('[pagedjs:debug-node]', parts.join('\n---\n'));
          });
        }
      }
      if (process.env['ODYSSEUS_DEBUG_PAGEDJS']) {
        // eslint-disable-next-line no-console
        console.error(`[pagedjs:${msg.type()}] ${msg.text()}`);
      }
    });

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

    const structuralFailure = await detectPagedjsStructuralFailure(page);
    if (structuralFailure !== undefined) {
      throw new Error(`Report generation aborted: ${structuralFailure} Never shipped to a client.`);
    }

    return await page.pdf({
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
  } finally {
    await context.close();
  }
}
