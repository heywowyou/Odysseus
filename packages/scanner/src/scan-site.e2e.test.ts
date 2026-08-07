import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { scanSite, type ScanProgressEvent } from './scan-site.js';

const TEST_PORT = 5195;
const TEST_URL = `http://localhost:${TEST_PORT}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const spaDemoDir = path.resolve(__dirname, '../../../fixtures/spa-demo');
const viteBin = path.join(spaDemoDir, 'node_modules', '.bin', 'vite');

let devServer: ChildProcess;
let browser: Browser;
let debugPort: number;
let scratchScreenshotDir: string;

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url} to respond`);
}

describe('scanSite against fixtures/spa-demo', () => {
  beforeAll(async () => {
    devServer = spawn(viteBin, ['--port', String(TEST_PORT), '--strictPort'], {
      cwd: spaDemoDir,
      stdio: 'ignore',
    });
    await waitForServer(TEST_URL, 30_000);
    ({ browser, debugPort } = await launchBrowser());
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
    devServer?.kill();
  });

  afterEach(async () => {
    if (scratchScreenshotDir) await fs.rm(scratchScreenshotDir, { recursive: true, force: true });
  });

  it(
    'crawls then scans every visited page, skipping the robots-disallowed one',
    async () => {
      scratchScreenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-scan-site-'));
      const result = await scanSite(TEST_URL, {
        browser,
        debugPort,
        maxPages: 10,
        maxDepth: 3,
        delayMs: 0,
        screenshotDir: scratchScreenshotDir,
      });

      expect(result.crawl.visitedCount).toBe(3);
      expect(result.pages).toHaveLength(3);

      for (const pageResult of result.pages) {
        expect(pageResult.renderDiffError).toBeUndefined();
        expect(pageResult.axeError).toBeUndefined();
        expect(pageResult.lighthouseError).toBeUndefined();
        expect(pageResult.renderDiff).toBeDefined();
        expect(pageResult.axe).toBeDefined();
        expect(pageResult.lighthouse).toBeDefined();
      }

      const scannedUrls = new Set(result.pages.map((p) => new URL(p.url).pathname));
      expect(scannedUrls.has('/private.html')).toBe(false);

      const home = result.pages.find((p) => new URL(p.url).pathname === '/');
      expect(home?.transactionalFlowEvidence?.some((e) => e.kind === 'checkout-form')).toBe(true);

      const mentionsLegalesPage = result.pages.find((p) => new URL(p.url).pathname === '/mentions-legales.html');
      expect(mentionsLegalesPage?.mentionsLegalesError).toBeUndefined();
      expect(mentionsLegalesPage?.mentionsLegales?.siren).toBe('732829320');

      // The outbound-only Booking.com link must not have been treated as a
      // first-party check-out flow on any other page.
      const about = result.pages.find((p) => new URL(p.url).pathname === '/about.html');
      expect(about?.mentionsLegales).toBeUndefined();
    },
    180_000,
  );

  it(
    'emits scan-start once and scan-page once per scanned page, alongside crawl events',
    async () => {
      scratchScreenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-scan-site-'));
      const events: ScanProgressEvent[] = [];

      const result = await scanSite(TEST_URL, {
        browser,
        debugPort,
        maxPages: 10,
        maxDepth: 3,
        delayMs: 0,
        screenshotDir: scratchScreenshotDir,
        onProgress: (event) => events.push(event),
      });

      expect(events.filter((event) => event.type === 'crawl-start')).toHaveLength(1);
      expect(events.filter((event) => event.type === 'crawl-page')).toHaveLength(result.crawl.visitedCount);

      const starts = events.filter((event) => event.type === 'scan-start');
      expect(starts).toHaveLength(1);
      expect(starts[0]).toMatchObject({ totalPages: result.pages.length });

      const pageEvents = events.filter((event) => event.type === 'scan-page');
      expect(pageEvents).toHaveLength(result.pages.length);
      expect(pageEvents.map((event) => (event.type === 'scan-page' ? event.scanned : undefined))).toEqual([1, 2, 3]);
    },
    180_000,
  );
});
