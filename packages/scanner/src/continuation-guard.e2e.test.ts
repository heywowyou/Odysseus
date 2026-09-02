import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { crawlSite } from './crawl.js';

function startStaticServer(routes: Record<string, { body: string; contentType: string }>): Promise<{
  server: Server;
  origin: string;
}> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const route = routes[req.url ?? '/'];
      if (route === undefined) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': route.contentType }).end(route.body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

let browser: Browser;

beforeAll(async () => {
  ({ browser } = await launchBrowser());
}, 30_000);

afterAll(async () => {
  await browser?.close();
});

/** Plan 021 Step 6's only real-browser claims: rel tokens and
 *  numbered-pagination-control membership are readable per anchor from
 *  real markup, and the crawl wiring actually bounds a real pagination
 *  nav. Threshold, family-key, and classification logic are unit-tested in
 *  continuation-guard.test.ts; this file deliberately stays small. */
describe('continuation guard against real pages', () => {
  it('reads rel and pagination-control membership per anchor from real markup', async () => {
    const { server, origin } = await startStaticServer({
      '/': {
        contentType: 'text/html; charset=utf-8',
        body: `<body>
          <nav class="pagination">
            <a href="/page/2/">2</a>
            <a href="/about">About</a>
          </nav>
          <a rel="next" href="/page/3/">Next</a>
          <a rel="prev" href="/page/1/">Prev</a>
          <a href="/plain">Plain</a>
        </body>`,
      },
    });
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(origin);
      // Same extraction shape as crawl.ts's link-discovery block; the
      // pagination selector must stay byte-identical to the one there and
      // in page-audit-profile.ts.
      const anchors = await page.$$eval('a[href]', (anchorEls) =>
        anchorEls.map((a) => ({
          href: a.getAttribute('href'),
          relNext: (a.getAttribute('rel') ?? '').split(/\s+/).includes('next'),
          isNumberedPaginationControl:
            a.matches('nav[class*="pag" i] a, [class*="pagination" i] a') &&
            /^\d+$/.test((a.textContent ?? '').trim()),
        })),
      );
      const byHref = new Map(anchors.map((anchor) => [anchor.href, anchor]));
      expect(byHref.get('/page/2/')).toMatchObject({
        relNext: false,
        isNumberedPaginationControl: true,
      });
      // Same nav, but non-numeric text: evidence requires both conditions.
      expect(byHref.get('/about')).toMatchObject({
        relNext: false,
        isNumberedPaginationControl: false,
      });
      expect(byHref.get('/page/3/')).toMatchObject({
        relNext: true,
        isNumberedPaginationControl: false,
      });
      // A prev link must never read as next evidence.
      expect(byHref.get('/page/1/')).toMatchObject({ relNext: false });
      expect(byHref.get('/plain')).toMatchObject({
        relNext: false,
        isNumberedPaginationControl: false,
      });
    } finally {
      await context.close();
      server.close();
    }
  });

  it('bounds a real crawled pagination nav past the threshold and reports the omissions', async () => {
    const paginationLinks = Array.from(
      { length: 61 },
      (_, i) => `<a href="/page/${i + 2}/">${i + 2}</a>`,
    ).join('\n');
    const { server, origin } = await startStaticServer({
      '/robots.txt': {
        contentType: 'text/plain; charset=utf-8',
        body: 'User-agent: *\nAllow: /\n',
      },
      '/': {
        contentType: 'text/html; charset=utf-8',
        body: `<body><nav class="pagination">${paginationLinks}</nav></body>`,
      },
      '/page/2': {
        contentType: 'text/html; charset=utf-8',
        body: '<body>second page</body>',
      },
    });
    try {
      const result = await crawlSite(origin, {
        browser,
        maxPages: 2,
        maxDepth: 5,
        delayMs: 0,
      });

      // 61 targets discovered from the one listing page: 60 admitted, the
      // 62nd page's link omitted; maxPages then stops the visits.
      expect(result.visitedCount).toBe(2);
      const summary = result.continuationGuardSummary;
      expect(summary).toBeDefined();
      expect(summary!.families).toHaveLength(1);
      const family = summary!.families[0]!;
      expect(family.familyKey).toBe('path:/page/{n}');
      expect(family.basis).toBe('numbered-pagination-control');
      expect(family.enqueuedCount).toBe(60);
      expect(family.omittedCount).toBe(1);
      expect(family.omittedExampleUrls).toEqual([`${origin}/page/62`]);
      expect(summary!.totalOmittedUrlCount).toBe(1);
    } finally {
      server.close();
    }
  });
}, 60_000);
