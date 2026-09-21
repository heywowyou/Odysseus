/**
 * item 36: section 05 (the printable checklist) is explicitly labeled
 * "Page pensée pour être imprimée ou capturée seule" but rendered as
 * light text on the same near-black background as every other sheet.
 * Verifies the @media print inversion (paged.css) actually takes effect
 * on the real Paged.js output under print media - not just a visual
 * inspection in a screen-mode viewer, per the doc's own acceptance check.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '@odysseus/scanner';
import { renderHtml } from './render-html.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import { buildStressFixture } from '../stress-fixture.js';

const require = createRequire(import.meta.url);

async function readPagedjsSource(): Promise<string> {
  const entryPath = require.resolve('pagedjs');
  const packageRoot = path.dirname(path.dirname(entryPath));
  return fs.readFile(path.join(packageRoot, 'dist', 'paged.js'), 'utf-8');
}

describe('item 36: the printable checklist page inverts to a light background under print media', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser.close();
  });

  it("paints #section-05's physical page with a light background and dark text under print media in both themes", async () => {
    const { manifest, findings, analysis } = buildStressFixture();
    const { pages: renderDiffEvidencePages, totalEligible } = resolveRenderDiffEvidence(
      manifest,
      findings,
    );
    const pagedjsSource = await readPagedjsSource();

    for (const theme of ['dark', 'light'] as const) {
      const html = await renderHtml({
        manifest,
        findings,
        analysis,
        renderDiffEvidencePages,
        renderDiffTotalEligible: totalEligible,
        theme,
      });
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        // playwright's page.pdf() (pdf.ts, the real generation path) applies
        // print media by default with no emulateMedia({media:'screen'}) call
        // anywhere in this package - emulating print explicitly here matches
        // that real path rather than the default screen context this test
        // would otherwise run under.
        await page.emulateMedia({ media: 'print' });
        await page.setContent(html, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await page.addScriptTag({ content: pagedjsSource });
        await page.evaluate(async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Paged = (globalThis as any).Paged;
          const previewer = new Paged.Previewer();
          await previewer.preview();
        });

        const colors = await page.evaluate(() => {
          const checklistPage = document.querySelector('#section-05')?.closest('.pagedjs_page');
          // item 0.1: .pagedjs_sheet is nested inside .pagedjs_page and is the
          // element that actually paints the visible page surface - a fix
          // that only repaints .pagedjs_page but leaves .pagedjs_sheet dark
          // produces dark ink on a still-dark page while this assertion, if it
          // only checked .pagedjs_page, would pass anyway. Check both.
          const checklistSheet = checklistPage?.querySelector('.pagedjs_sheet') ?? null;
          const otherPage = document.querySelector('#section-05')?.closest('.pagedjs_page')
            ?.previousElementSibling as Element | null;
          const get = (el: Element | null | undefined) =>
            el
              ? { bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }
              : null;
          return {
            checklistPage: get(checklistPage),
            checklistSheet: get(checklistSheet),
            otherPage: get(otherPage),
          };
        });

        expect(colors.checklistPage).not.toBeNull();
        expect(colors.checklistSheet).not.toBeNull();
        // Light background: high-ish RGB values, not the dark theme's #161826
        // (rgb(22, 24, 38)).
        expect(colors.checklistPage!.bg).not.toBe('rgb(22, 24, 38)');
        expect(colors.checklistSheet!.bg).not.toBe('rgb(22, 24, 38)');
        if (colors.otherPage) {
          expect(colors.otherPage.bg).not.toBe(colors.checklistPage!.bg);
          expect(colors.otherPage.bg).not.toBe(colors.checklistSheet!.bg);
        }
      } finally {
        await context.close();
      }
    }
  }, 120_000);
});
