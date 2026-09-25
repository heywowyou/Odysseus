/**
 * Issue #497: relative links resolve against the document's base URL. With
 * <base href="/fr/">, `chambres` is /fr/chambres, as the browser and the
 * link-facts check read it; resolving against the page URL queued /chambres
 * (a 404 reported as a broken internal link) and never visited the real page.
 */
import http, { type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { crawlSite } from './crawl.js';

let server: Server;
let origin: string;
let browser: Browser;

function listen(target: Server): Promise<number> {
  return new Promise((resolve) => {
    target.listen(0, '127.0.0.1', () => {
      const address = target.address();
      if (address === null || typeof address === 'string') throw new Error('Expected TCP server.');
      resolve(address.port);
    });
  });
}

describe('crawl link resolution against <base href>', () => {
  beforeAll(async () => {
    server = http.createServer((request, response) => {
      const url = request.url ?? '/';
      if (url === '/robots.txt') {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('User-agent: *\nAllow: /');
        return;
      }
      const pages: Record<string, string> = {
        '/': '<head><base href="/fr/"></head><body><a href="chambres">Chambres</a></body>',
        '/fr/chambres': '<body><p>Nos chambres</p></body>',
      };
      const body = pages[url];
      if (body === undefined) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(`<html>${body}</html>`);
    });
    origin = `http://127.0.0.1:${await listen(server)}`;
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('visits /fr/chambres and never queues /chambres', async () => {
    const result = await crawlSite(`${origin}/`, {
      browser,
      maxPages: 10,
      maxDepth: 2,
      delayMs: 0,
    });

    const urls = result.pages.map((page) => new URL(page.url).pathname);
    expect(urls).toContain('/fr/chambres');
    expect(result.pages.find((page) => page.url.endsWith('/fr/chambres'))?.status).toBe('visited');
    expect(urls).not.toContain('/chambres');
  }, 60_000);
});
