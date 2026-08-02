import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { scanPage } from './scan-page.js';

const TEST_PORT = 5191;
const TEST_URL = `http://localhost:${TEST_PORT}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const spaDemoDir = path.resolve(__dirname, '../../../fixtures/spa-demo');
const viteBin = path.join(spaDemoDir, 'node_modules', '.bin', 'vite');

let devServer: ChildProcess;
let browser: Browser;
let debugPort: number;

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

describe('scanPage against fixtures/spa-demo', () => {
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

  it(
    'runs render-diff, axe, and Lighthouse against the homepage with no scanner failures',
    async () => {
      const result = await scanPage(browser, debugPort, TEST_URL, { delayMs: 0 });

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
    },
    120_000,
  );
});
