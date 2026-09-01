import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { renderDiff } from './render-diff.js';

// Origin of the shared fixtures/spa-demo dev server started once per e2e
// run by scripts/vitest-e2e-global-setup.mjs.
const TEST_URL = inject('spaDemoOrigin');

let browser: Browser;
let scratchScreenshotDir: string;

describe('renderDiff against fixtures/spa-demo', () => {
  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
  });

  afterEach(async () => {
    if (scratchScreenshotDir) await fs.rm(scratchScreenshotDir, { recursive: true, force: true });
  });

  it('measures the near-total text gap on the spa-demo fixture', async () => {
    scratchScreenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-render-diff-'));
    const result = await renderDiff(browser, TEST_URL, { screenshotDir: scratchScreenshotDir });

    expect(result.httpStatus).toBe(200);
    expect(result.rawTextLength).toBeLessThan(20);
    expect(result.renderedTextLength).toBeGreaterThan(100);
    expect(result.missingPercent).toBeGreaterThan(90);
    expect(result.consoleErrors).toEqual([]);
    expect(path.isAbsolute(result.rawScreenshotRef!)).toBe(true);
    expect(path.isAbsolute(result.renderedScreenshotRef!)).toBe(true);
    expect(existsSync(result.rawScreenshotRef!)).toBe(true);
    expect(existsSync(result.renderedScreenshotRef!)).toBe(true);
  }, 45_000);
});
