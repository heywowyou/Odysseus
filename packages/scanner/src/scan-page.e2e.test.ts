import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { scanPage } from './scan-page.js';

// Origin of the shared fixtures/spa-demo dev server started once per e2e
// run by scripts/vitest-e2e-global-setup.mjs.
const TEST_URL = inject('spaDemoOrigin');

let browser: Browser;
let debugPort: number;
let scratchScreenshotDir: string;

describe('scanPage against fixtures/spa-demo', () => {
  beforeAll(async () => {
    ({ browser, debugPort } = await launchBrowser());
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
  });

  afterEach(async () => {
    if (scratchScreenshotDir) await fs.rm(scratchScreenshotDir, { recursive: true, force: true });
  });

  it('runs render-diff, axe, and Lighthouse against the homepage with no scanner failures', async () => {
    scratchScreenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-scan-page-'));
    const result = await scanPage(browser, debugPort, TEST_URL, {
      delayMs: 0,
      screenshotDir: scratchScreenshotDir,
    });

    expect(result.renderDiffError).toBeUndefined();
    expect(result.axeError).toBeUndefined();
    expect(result.lighthouseError).toBeUndefined();

    expect(result.renderDiff?.httpStatus).toBe(200);
    expect(result.renderDiff?.missingPercent).toBeGreaterThan(90);

    // The fixture's email input has no <label>, but its placeholder
    // attribute is still a valid accessible-name source per the HTML-AAM
    // spec, so axe-core's `label` rule does not fire here even though
    // placeholder-as-label is a real UX anti-pattern. Only color-contrast
    // and image-alt are rule violations axe-core actually reports.
    const violationIds: string[] =
      result.axe?.violations.map((violation: { id: string }) => violation.id) ?? [];
    expect(violationIds).toEqual(expect.arrayContaining(['color-contrast', 'image-alt']));

    const categories = result.lighthouse?.categories ?? {};
    for (const key of ['performance', 'accessibility', 'seo', 'best-practices']) {
      expect(categories).toHaveProperty(key);
      expect(typeof categories[key]?.score).toBe('number');
    }
  }, 120_000);
});
