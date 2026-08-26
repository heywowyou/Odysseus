import http, { type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { crawlSite } from './crawl.js';

/**
 * Reproduces a real bug found auditing haaitza.com: a same-origin page
 * (/carte-cadeaux) forwards into haaitza-lacoorniche.diadabox.fr, a
 * third-party booking platform shared with another client. The
 * redirect-following fix in crawl-redirect.e2e.test.ts (following a
 * requested URL to wherever it lands, needed for a same-business
 * www-to-apex 301) had no way to distinguish that safe case from
 * landing on a completely different business's domain - it deep-crawled
 * 58 pages of the vendor's own site and attributed its defects,
 * including most of that audit's "critical" findings, to the client.
 * requestedHost and landedHost here share nothing (localhost vs
 * 127.0.0.1, both loopback but different hostname strings, deliberately
 * not a www-prefix variant of each other) so isSameSiteHostname must
 * reject the pair and the crawler must treat it exactly like a
 * social-platform redirect: recorded as skipped-external-redirect, not
 * visited, and its own links never followed.
 */
const PORT_A = 5190;
const PORT_B = 5191;

let redirectServer: Server;
let targetServer: Server;
let browser: Browser;

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve) => server.listen(port, resolve));
}

function close(server: Server | undefined): Promise<void> {
  return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
}

describe('crawlSite following a redirect onto a genuinely different site', () => {
  beforeAll(async () => {
    redirectServer = http.createServer((_req, res) => {
      res.writeHead(301, { Location: `http://127.0.0.1:${PORT_B}/` });
      res.end();
    });
    targetServer = http.createServer((req, res) => {
      if (req.url === '/vendor-page-2') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>vendor page 2</body></html>');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        `<html><body><a href="http://127.0.0.1:${PORT_B}/vendor-page-2">Vendor page 2</a></body></html>`,
      );
    });
    await Promise.all([listen(redirectServer, PORT_A), listen(targetServer, PORT_B)]);
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await close(redirectServer);
    await close(targetServer);
  });

  it('marks the page skipped-external-redirect and never follows its links onto the foreign site', async () => {
    const result = await crawlSite(`http://localhost:${PORT_A}/`, {
      browser,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
    });

    // visitedCount counts every page dequeued and attempted, regardless of
    // outcome (robots-skips are the one exception, filtered earlier in the
    // loop) - the real assertion is that nothing has status 'visited'.
    expect(result.pages.some((page) => page.status === 'visited')).toBe(false);
    const homePage = result.pages.find((page) => page.url === `http://localhost:${PORT_A}/`);
    expect(homePage?.status).toBe('skipped-external-redirect');
    const vendorPage = result.pages.find((page) => page.url.includes('vendor-page-2'));
    expect(vendorPage).toBeUndefined();
  }, 30_000);
});
