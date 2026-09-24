import http, { type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { HOST_REFUSAL_STOP_THRESHOLD } from '@odysseus/core';
import { launchBrowser } from './browser.js';
import { crawlSite } from './crawl.js';

let server: Server;
let origin: string;
let browser: Browser;
/** Page paths the server received, in order; robots.txt and sitemap excluded. */
let pageRequests: string[] = [];
/** Pages served normally before the server starts dropping every connection. */
let answeredBeforeBan = Number.POSITIVE_INFINITY;
/** Paths whose connections are dropped a set number of times, then served
 *  normally. Two drops, because Chromium silently retries a request whose
 *  reused keep-alive connection closed, which would hide a single drop. */
let flakyDrops = new Map<string, number>();

const PAGE_COUNT = 20;
const links = Array.from({ length: PAGE_COUNT }, (_, index) => `<a href="/p${index + 1}">P</a>`);

function listen(target: Server): Promise<number> {
  return new Promise((resolve) => {
    target.listen(0, '127.0.0.1', () => {
      const address = target.address();
      if (address === null || typeof address === 'string') throw new Error('Expected TCP server.');
      resolve(address.port);
    });
  });
}

describe('crawl stop when the host stops answering', () => {
  beforeAll(async () => {
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
      pageRequests.push(url);
      const servedPages = new Set(pageRequests).size;
      const drops = flakyDrops.get(url) ?? 0;
      if (drops > 0) flakyDrops.set(url, drops - 1);
      if (servedPages > answeredBeforeBan || drops > 0) {
        // Closing the socket without writing a status line is what a host
        // that bans an IP address does; Chromium reports ERR_EMPTY_RESPONSE.
        request.socket.destroy();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(
        `<html><body><p>Hotel page ${url}</p>${url === '/' ? links.join('') : ''}</body></html>`,
      );
    });
    origin = `http://127.0.0.1:${await listen(server)}`;
    ({ browser } = await launchBrowser());
  }, 30_000);

  beforeEach(() => {
    pageRequests = [];
    answeredBeforeBan = Number.POSITIVE_INFINITY;
    flakyDrops = new Map();
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('stops requesting pages once the host drops a run of connections', async () => {
    answeredBeforeBan = 3;

    const result = await crawlSite(`${origin}/`, {
      browser,
      maxPages: 100,
      maxDepth: 2,
      delayMs: 0,
    });

    expect(result.hostStoppedAnswering).toEqual({
      answeredNavigationCount: 3,
      refusedNavigationCount: HOST_REFUSAL_STOP_THRESHOLD,
      errorCode: 'ERR_EMPTY_RESPONSE',
    });
    expect(result.pages.filter((page) => page.status === 'visited')).toHaveLength(3);
    expect(result.pages.filter((page) => page.status === 'error')).toHaveLength(
      HOST_REFUSAL_STOP_THRESHOLD,
    );
    // Nothing past the refusal run was requested: the rest of the queue was
    // abandoned rather than spent on a host that had stopped answering.
    expect(new Set(pageRequests).size).toBe(3 + HOST_REFUSAL_STOP_THRESHOLD);
  }, 60_000);

  it('keeps crawling through connections dropped one at a time', async () => {
    const flakyPaths = ['/p2', '/p4', '/p6', '/p8', '/p10', '/p12'];
    flakyDrops = new Map(flakyPaths.map((flakyPath) => [flakyPath, 2]));

    const result = await crawlSite(`${origin}/`, {
      browser,
      maxPages: 100,
      maxDepth: 2,
      delayMs: 0,
    });

    expect(result.hostStoppedAnswering).toBeUndefined();
    expect(result.pages).toHaveLength(PAGE_COUNT + 1);
    expect(result.pages.filter((page) => page.status === 'error')).toHaveLength(flakyPaths.length);
  }, 60_000);
});
