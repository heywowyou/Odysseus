import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { renderDiff } from './render-diff.js';

const TEST_PORT = 5183;
const TEST_URL = `http://localhost:${TEST_PORT}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const spaDemoDir = path.resolve(__dirname, '../../../fixtures/spa-demo');
const viteBin = path.join(spaDemoDir, 'node_modules', '.bin', 'vite');

let devServer: ChildProcess;
let browser: Browser;
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

describe('renderDiff against fixtures/spa-demo', () => {
  beforeAll(async () => {
    devServer = spawn(viteBin, ['--port', String(TEST_PORT), '--strictPort'], {
      cwd: spaDemoDir,
      stdio: 'ignore',
    });
    await waitForServer(TEST_URL, 30_000);
    ({ browser } = await launchBrowser());
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
    devServer?.kill();
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
