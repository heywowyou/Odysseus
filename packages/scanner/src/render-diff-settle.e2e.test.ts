import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { renderDiff } from './render-diff.js';

/**
 * Regression cover for the 2026-08-24 www.lagnonu.fr defect: a real site
 * held one request open forever (chat widget / analytics heartbeat), so
 * `waitUntil: 'networkidle'` never resolved. Because render-diff, the axe
 * pass, and every onRenderedPage custom check share that one navigation,
 * a single unreachable condition silently cost the whole audit its
 * accessibility findings on all 20 pages - while the full test suite
 * passed, since fixtures/spa-demo does settle.
 *
 * The fixture here reproduces the shape that mattered (a page whose text
 * is complete long before its network is) rather than the specific widget.
 */
/** Bound to port 0 and read back, so this server is private to this file
 *  and needs no agreed number. (The spa-demo e2e suites once ran on
 *  hand-allocated fixed ports and this file collided with crawl.e2e's
 *  5187 - an EADDRINUSE that surfaced only when both happened to run
 *  concurrently. Those suites now share one server provided by
 *  scripts/vitest-e2e-global-setup.mjs.) */
let testUrl: string;

const PAGE_HTML = `<!doctype html><html><body>
<h1>Rendered heading</h1>
<p>This paragraph is present well before the network ever falls idle.</p>
<script>
  // Never resolves: the response below is deliberately held open, so the
  // browser always has one request in flight.
  fetch('/never-ends').catch(() => {});
</script>
</body></html>`;

let server: http.Server;
let browser: Browser;
let screenshotDir: string;

describe('renderDiff against a page that never reaches network idle', () => {
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/never-ends') {
        // Headers sent, body never finished, connection never closed.
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write('holding');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(PAGE_HTML);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('server did not bind a port');
    testUrl = `http://127.0.0.1:${address.port}/`;
    ({ browser } = await launchBrowser());
    screenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-settle-'));
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
    if (screenshotDir) await fs.rm(screenshotDir, { recursive: true, force: true });
  });

  it('completes, measures the rendered text, and still runs the onRenderedPage hook', async () => {
    let hookRan = false;
    let headingFromHook: string | null = null;

    const result = await renderDiff(browser, testUrl, {
      screenshotDir,
      // Kept short so the test asserts the bound is honoured rather than
      // spending the production default waiting for an idle that never comes.
      settleTimeoutMs: 1_000,
      onRenderedPage: async (page) => {
        hookRan = true;
        headingFromHook = await page.textContent('h1');
      },
    });

    // The hook is the actual regression: axe and every custom check hang
    // off it, and it was being skipped entirely on affected sites.
    expect(hookRan).toBe(true);
    expect(headingFromHook).toBe('Rendered heading');

    expect(result.httpStatus).toBe(200);
    expect(result.renderedTextLength).toBeGreaterThan(50);
  }, 60_000);

  it('does not wait appreciably longer than the settle bound', async () => {
    const startedAt = Date.now();
    await renderDiff(browser, testUrl, { screenshotDir, settleTimeoutMs: 1_000 });
    const elapsedMs = Date.now() - startedAt;

    // Two navigations (raw + rendered) plus a 1s settle. Generous ceiling:
    // this asserts the settle is bounded at all, not a precise duration.
    expect(elapsedMs).toBeLessThan(20_000);
  }, 60_000);
});

// Issue #85: a page whose script sends the browser elsewhere shortly after
// 'load' (a delayed client-side redirect, as opposed to a synchronous one
// that would already be resolved by the time 'load' fires). The existing
// best-effort networkidle settle wait above is the only window in this
// pipeline long enough to observe it before rendered content is captured.
describe('renderDiff against a page that redirects itself shortly after load', () => {
  let redirectServer: http.Server;
  let redirectBrowser: Browser;
  let redirectScreenshotDir: string;
  let sourceUrl: string;
  let destinationUrl: string;

  beforeAll(async () => {
    redirectServer = http.createServer((req, res) => {
      if (req.url === '/destination') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!doctype html><html><body><h1>Destination</h1></body></html>');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!doctype html><html><body>
<h1>Redirecting</h1>
<script>setTimeout(() => { location.href = '/destination'; }, 200);</script>
</body></html>`);
    });
    await new Promise<void>((resolve) => redirectServer.listen(0, '127.0.0.1', resolve));
    const address = redirectServer.address();
    if (address === null || typeof address === 'string')
      throw new Error('server did not bind a port');
    sourceUrl = `http://127.0.0.1:${address.port}/`;
    destinationUrl = `http://127.0.0.1:${address.port}/destination`;
    ({ browser: redirectBrowser } = await launchBrowser());
    redirectScreenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-redirect-'));
  }, 60_000);

  afterAll(async () => {
    await redirectBrowser?.close();
    await new Promise<void>((resolve) => {
      redirectServer.closeAllConnections?.();
      redirectServer.close(() => resolve());
    });
    if (redirectScreenshotDir) await fs.rm(redirectScreenshotDir, { recursive: true, force: true });
  });

  it('reports the settled destination URL, not the originally requested one', async () => {
    const result = await renderDiff(redirectBrowser, sourceUrl, {
      screenshotDir: redirectScreenshotDir,
    });

    expect(result.renderedLandedUrl).toBe(destinationUrl);
  }, 60_000);
});
