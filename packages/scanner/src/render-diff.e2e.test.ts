import { existsSync, promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { decideScannedPageStatus, scannedPageFactsOf } from '@odysseus/core';
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

  /** Trade-off 110: the head-metadata noindex check reads X-Robots-Tag
   *  from the raw pass's response. */
  it('hands the raw response X-Robots-Tag header to its hook', async () => {
    scratchScreenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-render-diff-'));
    const server = createServer((_req, res) => {
      res
        .writeHead(200, { 'content-type': 'text/html', 'x-robots-tag': 'noindex, nofollow' })
        .end('<p>Hidden page</p>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const seen: Array<string | null> = [];
    try {
      await renderDiff(browser, `http://127.0.0.1:${port}/`, {
        screenshotDir: scratchScreenshotDir,
        onRawRobotsHeader: (value) => seen.push(value),
      });
    } finally {
      server.close();
    }
    expect(seen).toEqual(['noindex, nofollow']);
  }, 45_000);

  // Plan 075 M4: leprieuredeboulogne's /feed reached the scan from a
  // discovery wave, which has no content-type check of its own.
  it('records the raw answer content type, and the verdict sets a feed aside', async () => {
    scratchScreenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-render-diff-'));
    const server = createServer((_req, res) => {
      res
        .writeHead(200, { 'content-type': 'application/rss+xml; charset=UTF-8' })
        .end(
          '<?xml version="1.0"?><rss version="2.0"><channel><title>Le Prieuré</title></channel></rss>',
        );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/feed`;
    try {
      const result = await renderDiff(browser, url, { screenshotDir: scratchScreenshotDir });

      expect(result.rawContentType).toBe('application/rss+xml; charset=UTF-8');
      expect(decideScannedPageStatus(scannedPageFactsOf({ url, renderDiff: result }))).toEqual({
        status: 'skipped-non-html',
      });
    } finally {
      server.close();
    }
  }, 45_000);
});
