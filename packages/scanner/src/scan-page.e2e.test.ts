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

    // Lighthouse is asked only for the two categories whose audits can
    // become findings (trade-offs 1 and 74); the other two scores stopped
    // being recorded by design, so they must not be asserted here.
    const categories = result.lighthouse?.categories ?? {};
    for (const key of ['performance', 'seo']) {
      expect(categories).toHaveProperty(key);
      expect(typeof categories[key]?.score).toBe('number');
    }
  }, 120_000);

  // Plan 036: firing case paired with the existing silent control
  // (mentions-legales.html carries a valid SIREN/RCS/TVA and is exercised
  // through write-audit.e2e.test.ts's full scanSite run). This page is
  // reached directly, not through a crawl, so findMentionsLegalesUrl's
  // first-match resolution over the real site is never touched.
  it('extracts nothing and attaches the checked-page list when the mentions-legales page carries no identifier', async () => {
    scratchScreenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-scan-page-'));
    const legalUrl = `${TEST_URL}/mentions-legales-sans-identifiant.html`;
    const result = await scanPage(browser, debugPort, legalUrl, {
      delayMs: 0,
      screenshotDir: scratchScreenshotDir,
      mentionsLegalesUrl: legalUrl,
      mentionsLegalesSearchedUrls: [TEST_URL, legalUrl],
      skipLighthouse: true,
    });

    expect(result.mentionsLegalesError).toBeUndefined();
    expect(result.mentionsLegales?.siren).toBeUndefined();
    expect(result.mentionsLegales?.rcs).toBeUndefined();
    expect(result.mentionsLegales?.tva).toBeUndefined();
    expect(result.mentionsLegales?.checkedPages).toEqual({
      resolvedUrl: legalUrl,
      homepageFallback: false,
      searchedUrls: [TEST_URL, legalUrl],
    });
  }, 60_000);
});
