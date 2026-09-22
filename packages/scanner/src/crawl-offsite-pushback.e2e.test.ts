import http, { type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { crawlSite } from './crawl.js';
import { HostRequestScheduler, type HostPushbackEvent } from './host-request-scheduler.js';

/**
 * A site's social link (/social/instagram) redirects to the platform, which
 * rate-limits crawler traffic. Its 429 belongs to the platform: charging it
 * to the audited host doubled that host's delay up to the cap and bought a
 * retry into the platform, on a site that never pushed back itself.
 */
const PORT_SITE = 5192;
const PORT_PLATFORM = 5193;

let siteServer: Server;
let platformServer: Server;
let platformHits = 0;
let browser: Browser;

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve) => server.listen(port, resolve));
}

function close(server: Server | undefined): Promise<void> {
  return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
}

describe('crawlSite following a link out to a platform that rate-limits', () => {
  beforeAll(async () => {
    siteServer = http.createServer((req, res) => {
      if (req.url === '/social/instagram') {
        res.writeHead(301, { Location: `http://127.0.0.1:${PORT_PLATFORM}/hotel/` });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><a href="/social/instagram">Instagram</a></body></html>');
    });
    platformServer = http.createServer((_req, res) => {
      platformHits += 1;
      res.writeHead(429, { 'Content-Type': 'text/html' });
      res.end('<html><body>Too many requests</body></html>');
    });
    await Promise.all([listen(siteServer, PORT_SITE), listen(platformServer, PORT_PLATFORM)]);
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await close(siteServer);
    await close(platformServer);
  });

  it('records the redirect without slowing the audited host or retrying the platform', async () => {
    const events: HostPushbackEvent[] = [];
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 0,
      maxConcurrency: 1,
      onPushback: (event) => events.push(event),
    });

    const result = await crawlSite(`http://localhost:${PORT_SITE}/`, {
      browser,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
      scheduler,
    });

    const socialPage = result.pages.find((page) => page.url.endsWith('/social/instagram'));
    expect(socialPage?.status).toBe('skipped-external-redirect');
    expect(events).toEqual([]);
    expect(scheduler.effectiveDelayMs).toBe(0);
    expect(platformHits).toBe(1);
  }, 30_000);
});
