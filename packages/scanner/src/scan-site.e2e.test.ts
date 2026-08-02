import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { scanSite } from './scan-site.js';

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

      expect(result.crawl.visitedCount).toBe(2);
      expect(result.pages).toHaveLength(2);

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
    },
    180_000,
  );
});
