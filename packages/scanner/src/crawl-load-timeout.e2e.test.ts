import http, { type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { crawlSite } from './crawl.js';

/**
 * A real hotel site served its English pages as ordinary 200 documents
 * whose `load` event never fired inside the crawler's timeout (a hanging
 * embedded resource). The crawler recorded each one as 'error', and the
 * report then called the links to them broken. Here /slow answers its
 * document at once but holds one image request open forever, so `load`
 * never fires; /dead never answers at all.
 */
const PORT = 5197;

let server: Server;
let browser: Browser;
const heldResponses: http.ServerResponse[] = [];

describe('crawlSite on a page whose load event never fires', () => {
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/hang.png' || req.url === '/dead') {
        heldResponses.push(res);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (req.url === '/slow') {
        res.end('<html><head><title>Slow</title></head><body><img src="/hang.png"></body></html>');
        return;
      }
      res.end('<html><body><a href="/slow">Slow</a> <a href="/dead">Dead</a></body></html>');
    });
    await new Promise<void>((resolve) => server.listen(PORT, resolve));
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    for (const res of heldResponses) res.destroy();
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('retries on the document alone and keeps the page, while a silent URL stays an error', async () => {
    const result = await crawlSite(`http://localhost:${PORT}/`, {
      browser,
      maxPages: 10,
      maxDepth: 2,
      delayMs: 0,
      timeoutMs: 2_000,
    });

    const slow = result.pages.find((page) => page.url.endsWith('/slow'));
    expect(slow?.status).toBe('visited');
    const dead = result.pages.find((page) => page.url.endsWith('/dead'));
    expect(dead?.status).toBe('error');
  }, 60_000);
});
