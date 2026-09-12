/**
 * Real browser, real HTTP, for issue #202: the homepage settling on a
 * redirect interstitial instead of the site itself. This is a separate,
 * self-contained fixture from prescan-site.e2e.test.ts's shared
 * fixtures/hotel-demo server, so a scenario built for this defect cannot
 * disturb that suite's own page-selection assertions.
 *
 * Two servers, both loopback, bound to different addresses (127.0.0.1 and
 * 127.0.0.2) so the "off the hotel's own site" case has a hostname that
 * genuinely differs and is genuinely reachable - no real DNS, no reliance
 * on an unresolvable host's browser error-page behaviour, which is not
 * predictable enough to assert against.
 */

import { createServer, type Server } from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../browser.js';
import { prescanSite } from './prescan-site.js';

let browser: Browser;
let scratchDir: string;

function startHtmlServer(
  host: string,
  routes: Record<string, string>,
): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const created = createServer((req, res) => {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      const body = routes[pathname];
      if (body === undefined) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
    });
    created.listen(0, host, () => {
      const address = created.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve({ server: created, baseUrl: `http://${host}:${port}` });
    });
  });
}

function closeServer(server: Server | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (server === undefined) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

describe('prescanSite following a redirect interstitial (issue #202)', () => {
  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
  });

  afterEach(async () => {
    if (scratchDir) await fs.rm(scratchDir, { recursive: true, force: true });
  });

  async function run(startUrl: string) {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-prescan-interstitial-'));
    return prescanSite(startUrl, {
      browser,
      artifactsDir: scratchDir,
      delayMs: 0,
      settleTimeoutMs: 2_000,
    });
  }

  it('follows a same-host redirect interstitial and scores the real content it lands on, not the interstitial', async () => {
    const { server, baseUrl } = await startHtmlServer('127.0.0.1', {
      '/': `<html><head><script>location.replace('/real/');</script></head>
            <body>Access is temporarily restricted</body></html>`,
      '/real/': `<html><body>
            <h1>Hotel Real Content</h1>
            <a href="/booking">Book now</a>
          </body></html>`,
      '/booking': `<html><body><h1>Booking</h1></body></html>`,
    });
    try {
      const result = await run(`${baseUrl}/`);

      expect(result.status).toBe('complete');
      // The interstitial's own text ("Access is temporarily restricted")
      // is never in the returned pages: 1924 HOTEL's defect was exactly
      // this content reaching a score.
      const homepage = result.pages.find((page) => page.role === 'homepage');
      expect(homepage?.url).toBe(`${baseUrl}/real/`);
      // Page selection continued from the landed page's own links, not
      // the interstitial's - the booking page it names.
      expect(result.pages.map((page) => page.role)).toContain('booking');
    } finally {
      await closeServer(server);
    }
  }, 60_000);

  it("reports homepage-interstitial-unresolved without scoring anything when the landed page is off the hotel's own site", async () => {
    const { server: offsiteServer, baseUrl: offsiteBaseUrl } = await startHtmlServer('127.0.0.2', {
      '/': `<html><body>a different site entirely</body></html>`,
    });
    const { server, baseUrl } = await startHtmlServer('127.0.0.1', {
      '/': `<html><head><script>location.href = ${JSON.stringify(`${offsiteBaseUrl}/`)};</script></head>
            <body>Access is temporarily restricted</body></html>`,
    });
    try {
      const result = await run(`${baseUrl}/`);

      expect(result.status).toBe('homepage-interstitial-unresolved');
      // The interstitial's own measured page stays visible, the same
      // forensic-visibility shape 'homepage-unreachable' already has (a
      // reader can see what was actually attempted) - but this status is
      // exactly what score-hotels.ts now refuses to score (see
      // score-hotels.test.ts's "skips a candidate whose prescan pointer is
      // not complete" for that half of the guarantee).
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0]?.url).toBe(`${baseUrl}/`);
    } finally {
      await closeServer(server);
      await closeServer(offsiteServer);
    }
  }, 60_000);

  it('stays complete when the homepage never redirects', async () => {
    const { server, baseUrl } = await startHtmlServer('127.0.0.1', {
      '/': `<html><body><h1>Hotel Real Content</h1></body></html>`,
    });
    try {
      const result = await run(`${baseUrl}/`);
      expect(result.status).toBe('complete');
      expect(result.pages[0]?.url).toBe(`${baseUrl}/`);
    } finally {
      await closeServer(server);
    }
  }, 60_000);
});
