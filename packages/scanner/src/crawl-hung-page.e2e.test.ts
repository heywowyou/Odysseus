/**
 * Issue #499: a page that blocks its renderer used to fail the whole crawl,
 * because the watchdog closed the crawl's only context and its error left
 * crawlSite. The page is now that page's error, and the crawl goes on.
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

describe('crawl with a page whose renderer never answers', () => {
  beforeAll(async () => {
    server = http.createServer((request, response) => {
      const url = request.url ?? '/';
      if (url === '/robots.txt') {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('User-agent: *\nAllow: /');
        return;
      }
      const pages: Record<string, string> = {
        '/': '<a href="/hung">Hung</a><a href="/a">A</a><a href="/b">B</a>',
        // Spins forever once loaded, so every later evaluation hangs.
        '/hung':
          '<a href="/c">C</a><script>addEventListener("load", () => setTimeout(() => { for (;;) {} }, 0));</script>',
        '/a': '<p>A</p>',
        '/b': '<p>B</p>',
        '/c': '<p>C</p>',
      };
      const body = pages[url];
      if (body === undefined) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(`<html><body>${body}</body></html>`);
    });
    origin = `http://127.0.0.1:${await listen(server)}`;
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('records the hung page as an error and visits the others', async () => {
    const result = await crawlSite(`${origin}/`, {
      browser,
      maxPages: 10,
      maxDepth: 2,
      delayMs: 0,
      timeoutMs: 1_000,
    });

    const byPath = new Map(result.pages.map((page) => [new URL(page.url).pathname, page]));
    expect(byPath.get('/hung')?.status).toBe('error');
    expect(byPath.get('/hung')?.error).toMatch(/watchdog/u);
    expect(byPath.get('/a')?.status).toBe('visited');
    expect(byPath.get('/b')?.status).toBe('visited');
    // The abandoned iteration's late writes never add a second record.
    expect(result.pages.filter((page) => page.url.endsWith('/hung'))).toHaveLength(1);
  }, 60_000);
});
