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

function page(response: http.ServerResponse, body: string, headers: http.OutgoingHttpHeaders = {}) {
  response.writeHead(200, { 'Content-Type': 'text/html', ...headers });
  response.end(`<html><body>${body}</body></html>`);
}

describe('crawl cookie isolation', () => {
  beforeAll(async () => {
    // Next.js locale routing as www.alexanderpark.fr serves it: an /es/ page
    // sets NEXT_LOCALE=es, and an unprefixed (French) URL then redirects to
    // its Spanish copy for any visitor carrying that cookie.
    server = http.createServer((request, response) => {
      const url = request.url ?? '/';
      if (url === '/robots.txt') {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('User-agent: *\nAllow: /');
        return;
      }
      if (url === '/sitemap.xml' || url === '/favicon.ico') {
        response.writeHead(404);
        response.end();
        return;
      }
      if (url === '/') {
        page(response, '<a href="/es/chambres">ES</a><a href="/chambres">FR</a>');
        return;
      }
      if (url === '/es/chambres') {
        page(response, '<p>Habitaciones</p>', { 'Set-Cookie': 'NEXT_LOCALE=es; Path=/' });
        return;
      }
      if (url === '/chambres') {
        if (request.headers.cookie?.includes('NEXT_LOCALE=es') === true) {
          response.writeHead(307, { Location: '/es/chambres' });
          response.end();
          return;
        }
        page(response, '<p>Chambres</p>');
        return;
      }
      response.writeHead(404);
      response.end();
    });
    origin = `http://127.0.0.1:${await listen(server)}`;
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('crawls a French page after a Spanish page has set a language cookie', async () => {
    const result = await crawlSite(`${origin}/`, {
      browser,
      maxPages: 10,
      maxDepth: 2,
      delayMs: 0,
    });

    const statusOf = (path: string) =>
      result.pages.find((crawled) => crawled.url === `${origin}${path}`)?.status;
    expect(statusOf('/es/chambres')).toBe('visited');
    expect(statusOf('/chambres')).toBe('visited');
  }, 60_000);
});
