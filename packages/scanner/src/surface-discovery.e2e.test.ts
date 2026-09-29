/**
 * Surface link discovery resolves relative links the way the crawl does
 * (issue #497): against the document's base URL, and never following a
 * relative href that repeats its own directory. A hotel site with
 * <base href="/"> and `en/rooms.html` links on its /en/ pages answered every
 * /en/en/... address, and the discovery waves scanned 559 nested copies.
 */
import http, { type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { collectSurfaceLinks } from './surface-discovery.js';

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

async function linksOf(path: string): Promise<{ path: string; nested: boolean }[]> {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}${path}`);
    const links = await collectSurfaceLinks(page, { baseUrl: page.url() });
    return links.map((link) => ({
      path: new URL(link.url).pathname,
      nested: link.nesting !== undefined,
    }));
  } finally {
    await page.close();
  }
}

describe('surface link resolution', () => {
  beforeAll(async () => {
    server = http.createServer((request, response) => {
      const url = request.url ?? '/';
      const pages: Record<string, string> = {
        '/en/webcam.html':
          '<head><base href="/"></head><body><a href="en/rooms.html">Rooms</a></body>',
        '/en/video.html':
          '<body><a href="en/rooms.html">Rooms</a><a href="spa.html">Spa</a></body>',
      };
      const body = pages[url];
      response.writeHead(body === undefined ? 404 : 200, { 'Content-Type': 'text/html' });
      response.end(body === undefined ? '' : `<html>${body}</html>`);
    });
    origin = `http://127.0.0.1:${await listen(server)}`;
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('resolves a relative link against <base href>', async () => {
    expect(await linksOf('/en/webcam.html')).toEqual([{ path: '/en/rooms.html', nested: false }]);
  }, 60_000);

  // Issue #566: kept with its evidence, so the discovery wave refuses it
  // and records the refusal as the crawl does, instead of dropping it.
  it('marks a relative link that nests its own directory and keeps the others', async () => {
    expect(await linksOf('/en/video.html')).toEqual([
      { path: '/en/en/rooms.html', nested: true },
      { path: '/en/spa.html', nested: false },
    ]);
  }, 60_000);
});
