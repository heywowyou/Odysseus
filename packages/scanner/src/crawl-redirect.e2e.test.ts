import http, { type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { crawlSite } from './crawl.js';

/**
 * Reproduces a real bug found auditing lacoorniche.com: the site's
 * www subdomain permanently redirects (301) to the apex domain, and every
 * link on the landed page is naturally absolute against that apex origin.
 * Before the fix, crawlSite resolved links against the pre-redirect
 * request URL, so the entire real site looked cross-origin and got
 * dropped - visitedCount was 1 no matter the configured maxPages. Two
 * origins in this test (PORT_A redirecting to PORT_B) reproduce the same
 * "requested origin != landed origin" shape without needing a resolvable
 * second hostname.
 */
const PORT_A = 5188;
const PORT_B = 5189;

let redirectServer: Server;
let targetServer: Server;
let browser: Browser;

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve) => server.listen(port, resolve));
}

function close(server: Server | undefined): Promise<void> {
  return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
}

describe('crawlSite following a cross-origin redirect', () => {
  beforeAll(async () => {
    redirectServer = http.createServer((_req, res) => {
      res.writeHead(301, { Location: `http://localhost:${PORT_B}/` });
      res.end();
    });
    targetServer = http.createServer((req, res) => {
      if (req.url === '/page2') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>page 2</body></html>');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body><a href="http://localhost:${PORT_B}/page2">Page 2</a></body></html>`);
    });
    await Promise.all([listen(redirectServer, PORT_A), listen(targetServer, PORT_B)]);
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await close(redirectServer);
    await close(targetServer);
  });

  it('follows links resolved against the landed origin, not the pre-redirect request origin', async () => {
    const result = await crawlSite(`http://localhost:${PORT_A}/`, {
      browser,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
    });

    expect(result.visitedCount).toBe(2);
    const page2 = result.pages.find((page) => page.url === `http://localhost:${PORT_B}/page2`);
    expect(page2?.status).toBe('visited');
  }, 30_000);
});
