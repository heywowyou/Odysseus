import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../browser.js';
import { extractMixedContentResources } from './mixed-content.js';

/** Same startStaticServer shape as the other check e2e tests. A page
 *  cannot honestly claim to be "https" from a plain http test server, so
 *  isPageSecure is exercised directly against the constructed pageUrl
 *  argument (which extractMixedContentResources reads via new URL(...),
 *  independent of what protocol Playwright actually navigated with) -
 *  the resource-collection half is what genuinely needs a real browser. */
function startStaticServer(routes: Record<string, string>): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const body = routes[req.url ?? '/'];
      if (body === undefined) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

describe('extractMixedContentResources against real pages', () => {
  let browser: Browser;
  let destination: { server: Server; origin: string };

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
    destination = await startStaticServer({ '/style.css': 'body { color: red; }' });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    destination?.server.close();
  });

  it('returns no insecure resources when the page URL itself is not https, regardless of what it loads', async () => {
    const { server, origin } = await startStaticServer({
      '/': `<link rel="stylesheet" href="${destination.origin}/style.css"><body>hi</body>`,
    });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(origin);
      const result = await extractMixedContentResources(page, origin);
      await context.close();

      expect(result.isPageSecure).toBe(false);
      expect(result.insecureResourceUrls).toEqual([]);
    } finally {
      server.close();
    }
  });

  it('collects real http:// resource URLs actually loaded by the page, deduplicated', async () => {
    const { server, origin } = await startStaticServer({
      '/': `<link rel="stylesheet" href="${destination.origin}/style.css">
        <link rel="stylesheet" href="${destination.origin}/style.css">
        <body>hi</body>`,
    });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(origin);
      // Claim an https pageUrl to exercise the "secure page" branch,
      // independent of what Playwright actually navigated to - the
      // function reads pageUrl's protocol via new URL(), not the page's
      // real navigation history.
      const result = await extractMixedContentResources(page, 'https://example.com/');
      await context.close();

      expect(result.isPageSecure).toBe(true);
      expect(result.insecureResourceUrls).toEqual([`${destination.origin}/style.css`]);
    } finally {
      server.close();
    }
  });
});
