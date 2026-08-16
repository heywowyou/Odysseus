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
import type { Browser } from 'playwright';

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

    await page.addScriptTag({ content: pagedjsSource });
    await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Paged = (globalThis as any).Paged;
      const previewer = new Paged.Previewer();
      await previewer.preview();
    });

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
