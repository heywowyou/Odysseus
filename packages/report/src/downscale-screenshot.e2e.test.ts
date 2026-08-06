/**
 * The one test in this package that needs real Chromium: verifies the
 * canvas-based downscale in screenshots.ts actually shrinks and
 * re-encodes a screenshot, not just that the data flows through (that
 * part is covered, with a stub browser, by screenshots.test.ts). Matches
 * this repo's existing *.e2e.test.ts convention for real-browser tests.
 */
import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '@odysseus/scanner';
import { resolveRenderDiffEvidence } from './screenshots.js';
import { loadSasFernandeManifest, SAS_FERNANDE_AUDIT_DIR } from './test-fixtures.js';

let browser: Browser;

beforeAll(async () => {
  ({ browser } = await launchBrowser());
});

afterAll(async () => {
  await browser.close();
});

async function decodedImageDimensions(dataUri: string): Promise<{ width: number; height: number }> {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight };
    }, dataUri);
  } finally {
    await page.close();
  }
}

describe('downscaleScreenshot (real Chromium, via resolveRenderDiffEvidence)', () => {
  it('re-encodes the real homepage raw.png (3.8MB PNG) to a width-capped JPEG data URI', async () => {
    const manifest = await loadSasFernandeManifest();
    const inflated = {
      ...manifest,
      pages: manifest.pages.map((page) =>
        page.pageDir === 'pages/root-c122da' ? { ...page, renderDiffMissingPercent: 40 } : page,
      ),
    };

    const pages = await resolveRenderDiffEvidence(inflated, SAS_FERNANDE_AUDIT_DIR, [], browser);
    const [homepage] = pages;
    if (!homepage?.rawDataUri) throw new Error('expected a downscaled raw screenshot');

    expect(homepage.rawDataUri).toMatch(/^data:image\/jpeg;base64,/);

    // The original PNG is ~3.8MB; base64 JPEG at 800px wide, quality 80,
    // height-capped, must be dramatically smaller - this is the actual
    // A8 fix (30.7MB -> 670KB on the real haaitza report), not just a
    // format-label swap.
    const approxByteSize = (homepage.rawDataUri.length * 3) / 4;
    expect(approxByteSize).toBeLessThan(500_000);

    const { width, height } = await decodedImageDimensions(homepage.rawDataUri);
    expect(width).toBeLessThanOrEqual(800);
    expect(height).toBeLessThanOrEqual(2400);
  }, 30_000);
});
