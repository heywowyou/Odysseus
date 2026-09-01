/**
 * Item 0.1: the printable checklist page (section-05) was found rendering
 * dark text on a still-dark background under print media, three times
 * across three feedback passes, each pass making it worse (heavy-toner
 * risk -> visibly dark -> fully invisible). Root cause each time: a fix
 * repainted `.pagedjs_page` but not `.pagedjs_sheet`, the element nested
 * inside it that actually paints the visible page surface - and the only
 * test that existed (print-inversion.test.ts) checked computed
 * `background-color`, which can pass even when the fix is incomplete if
 * the assertion doesn't happen to probe the right element (exactly what
 * happened: print-inversion.test.ts passed while the real PDF stayed
 * broken, twice).
 *
 * A pixel-level screenshot diff against a known-good baseline catches
 * this whole class of "the right CSS property is set on the wrong
 * element" bug regardless of which specific element the next regression
 * happens to target, which a `getComputedStyle` assertion on named
 * selectors cannot promise. The baseline
 * (__fixtures__/checklist-print-baseline.png) was captured against the
 * current, working fix - regenerate it deliberately (never to silence a
 * failure without checking first) if the checklist page's design
 * legitimately changes.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { launchBrowser } from '@odysseus/scanner';
import { renderHtml } from './render-html.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import { buildStressFixture } from '../stress-fixture.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(__dirname, '__fixtures__/checklist-print-baseline.png');

/** A mismatch ratio, not a pixel count: font hinting/anti-aliasing can
 *  differ by a handful of pixels between Chromium builds without any
 *  real visual defect. 1% of the page's pixels is generous enough to
 *  absorb that while still catching "the whole page is a different
 *  color", which is what item 0.1's regression actually looked like
 *  (effectively 100% of pixels wrong). */
const MAX_MISMATCH_RATIO = 0.01;

async function readPagedjsSource(): Promise<string> {
  const entryPath = require.resolve('pagedjs');
  const packageRoot = path.dirname(path.dirname(entryPath));
  return fs.readFile(path.join(packageRoot, 'dist', 'paged.js'), 'utf-8');
}

describe('item 0.1: the printable checklist page never regresses to dark-on-dark under print media', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser.close();
  });

  it('matches the known-good light-background baseline within a small pixel-diff tolerance', async () => {
    const { manifest, findings, analysis } = buildStressFixture();
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
    const pagedjsSource = await readPagedjsSource();

    const context = await browser.newContext();
    const page = await context.newPage();
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

    const box = await page.evaluate(() => {
      const el = document.querySelector('#section-05')?.closest('.pagedjs_page');
      if (!el) return null;
      el.scrollIntoView();
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    expect(box).not.toBeNull();

    const screenshotBuffer = await page.screenshot({ clip: box! });
    await context.close();

    const actual = PNG.sync.read(screenshotBuffer);
    const baselineBuffer = await fs.readFile(BASELINE_PATH);
    const baseline = PNG.sync.read(baselineBuffer);

    expect(actual.width).toBe(baseline.width);
    expect(actual.height).toBe(baseline.height);

    const diff = new PNG({ width: actual.width, height: actual.height });
    const mismatchedPixels = pixelmatch(
      actual.data,
      baseline.data,
      diff.data,
      actual.width,
      actual.height,
      {
        threshold: 0.1,
      },
    );
    const totalPixels = actual.width * actual.height;
    const mismatchRatio = mismatchedPixels / totalPixels;

    expect(mismatchRatio).toBeLessThan(MAX_MISMATCH_RATIO);
  }, 30_000);
});
