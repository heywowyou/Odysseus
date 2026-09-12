import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { renderDiff } from './render-diff.js';
import { withPageWatchdog } from './scan-site.js';
import { createPageWorkGuard } from './page-work-guard.js';
import type { PageScanResult } from './scan-page.js';

/**
 * Regression cover for issue #200: a real full audit accumulated 100+
 * live Chromium renderer processes and OOM'd the host, because a hung
 * check inside render-diff's onRenderedPage hook (page.evaluate has no
 * built-in timeout) left its BrowserContext open forever - the existing
 * per-page watchdog abandoned the stuck promise but never closed the
 * context behind it. This reproduces that exact shape: an onRenderedPage
 * hook that awaits a real Playwright call bound to the page (so closing
 * the context actually unblocks it, the same way it would unblock a
 * hung axe/keyboard-nav/reflow check) which never resolves on its own.
 */
const PAGE_HTML = `<!doctype html><html><body>
<h1>Rendered heading</h1>
<p>Ordinary page content, nothing special about the raw/rendered text.</p>
</body></html>`;

let server: http.Server;
let browser: Browser;
let screenshotDir: string;
let testUrl: string;

describe('withPageWatchdog + renderDiff against a page whose onRenderedPage hook hangs forever', () => {
  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(PAGE_HTML);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('server did not bind a port');
    testUrl = `http://127.0.0.1:${address.port}/`;
    ({ browser } = await launchBrowser());
    screenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-watchdog-guard-'));
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
    if (screenshotDir) await fs.rm(screenshotDir, { recursive: true, force: true });
  });

  it('force-closes the wedged contexts instead of leaking them past the deadline', async () => {
    const baselineContexts = browser.contexts().length;
    const guard = createPageWorkGuard();

    const work = (async (): Promise<PageScanResult> => {
      const outcome = await renderDiff(browser, testUrl, {
        screenshotDir,
        guard,
        onRenderedPage: async (page) => {
          try {
            // A real Playwright call bound to this page's context, with no
            // timeout of its own - the same unbounded-await shape as a
            // hung axe/keyboard-nav/reflow check. Only closing the context
            // (not merely abandoning the promise) can ever unblock this.
            // Wrapped in its own try/catch, exactly as every real check in
            // scan-page.ts's onRenderedPage already is (axe,
            // mentions-legales, transactional-flow, etc.), so a forced
            // close here surfaces as an ordinary per-check failure rather
            // than an exception out of renderDiff itself.
            await page.waitForSelector('.this-selector-never-appears', { timeout: 0 });
          } catch {
            // Expected once the watchdog force-closes the context.
          }
        },
      });
      return { url: testUrl, renderDiff: outcome };
    })();

    const startedAt = Date.now();
    // Generous relative to the raw+rendered navigation this environment
    // needs (a few hundred ms), tiny relative to production's 7-10 minute
    // constants - the point is the bound is enforced at all.
    const result = await withPageWatchdog(testUrl, work, 3_000, guard);
    const elapsedMs = Date.now() - startedAt;

    // Either outcome is acceptable here: the synthesized watchdog failure,
    // or (since closing the context is exactly what unblocks work) a
    // legitimate result racing in right behind it. What matters, and
    // what would fail before this fix, is that this returns promptly at
    // all instead of hanging for the full production watchdog bound.
    expect(elapsedMs).toBeLessThan(10_000);
    expect(result.url).toBe(testUrl);

    // The actual regression check: renderer processes/contexts must be
    // gone, not merely abandoned. A short grace period lets Playwright
    // finish tearing down the forcibly-closed contexts.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(browser.contexts().length).toBe(baselineContexts);
  }, 30_000);
});
