/**
 * Real browser, real HTTP, against fixtures/hotel-demo. The prescan's whole
 * contract is about what it does and does not load, which cannot be checked
 * without watching actual requests: a mocked page proves nothing about
 * whether the page budget or robots.txt were honoured.
 *
 * Uses Node's own static server rather than a fixture package with a build
 * step - the fixture is plain HTML and the prescan reads links, not a
 * rendered app.
 */

import { createServer, type Server } from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../browser.js';
import { prescanSite, type PrescanProgressEvent } from './prescan-site.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(__dirname, '../../../../fixtures/hotel-demo');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

let server: Server;
let baseUrl: string;
let browser: Browser;
let scratchDir: string;
/** Every path the fixture server was asked for, which is how the page budget
 *  and the robots skip are actually proven rather than inferred. */
let requestedPaths: string[] = [];

function startServer(): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const created = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      requestedPaths.push(url.pathname);
      const relative = url.pathname === '/' ? '/index.html' : url.pathname;
      const filePath = path.join(fixtureDir, relative);
      try {
        const body = await fs.readFile(filePath);
        res.writeHead(200, {
          'content-type': CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
        });
        res.end(body);
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
      }
    });
    created.listen(0, '127.0.0.1', () => {
      const address = created.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve({ server: created, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe('prescanSite against fixtures/hotel-demo', () => {
  beforeAll(async () => {
    ({ server, baseUrl } = await startServer());
    ({ browser } = await launchBrowser());
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(async () => {
    if (scratchDir) await fs.rm(scratchDir, { recursive: true, force: true });
    requestedPaths = [];
  });

  async function run(
    overrides: Parameters<typeof prescanSite>[1] extends never
      ? never
      : Partial<Parameters<typeof prescanSite>[1]> = {},
  ) {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-prescan-'));
    return prescanSite(`${baseUrl}/`, {
      browser,
      artifactsDir: scratchDir,
      delayMs: 0,
      settleTimeoutMs: 2_000,
      ...overrides,
    });
  }

  it('selects exactly the homepage, a booking page, and a rooms page', async () => {
    const result = await run();
    expect(result.status).toBe('complete');
    expect(result.pages.map((page) => page.role)).toEqual(['homepage', 'booking', 'content']);
    // The French pages, not their English translations: see pickStable in
    // page-roles.ts for why depth decides this.
    expect(result.pages.map((page) => new URL(page.url).pathname)).toEqual([
      '/',
      '/reservation.html',
      '/nos-chambres.html',
    ]);
  }, 90_000);

  it('never loads more than three distinct pages, whatever the site links to', async () => {
    await run();
    const htmlPaths = new Set(
      requestedPaths.filter((requested) => requested === '/' || requested.endsWith('.html')),
    );
    expect(htmlPaths.size).toBeLessThanOrEqual(3);
    // The site links to these, and the prescan must not spend its budget
    // on them.
    expect([...htmlPaths]).not.toContain('/mentions-legales.html');
    expect([...htmlPaths]).not.toContain('/contact.html');
  }, 90_000);

  it('never invokes Lighthouse', async () => {
    // Lighthouse's own navigation is what would make a fourth and fifth
    // load of the same page appear. Counting loads of the homepage is a
    // more honest check than stubbing a module the prescan does not import.
    await run();
    const homepageLoads = requestedPaths.filter((requested) => requested === '/').length;
    // Two: render-diff's raw pass and its rendered pass. A Lighthouse run
    // would add at least one more.
    expect(homepageLoads).toBe(2);
  }, 90_000);

  it('honours robots.txt for a disallowed page', async () => {
    await run();
    expect(requestedPaths).toContain('/robots.txt');
    expect(requestedPaths).not.toContain('/contact.html');
  }, 90_000);

  it('records the off-site OTA booking link as evidence without loading it', async () => {
    const result = await run();
    expect(result.offsiteBookingLinks).toContain('https://www.booking.com/hotel/fr/demo.html');
    expect(requestedPaths.some((requested) => requested.includes('booking.com'))).toBe(false);
  }, 90_000);

  it('measures the seeded metrics on the homepage', async () => {
    const result = await run();
    const homepage = result.pages[0]!;
    expect(homepage.metricsError).toBeUndefined();
    const metrics = homepage.metrics!;
    // The fixture seeds a 120ms block and a post-load shift.
    expect(metrics.mainThreadBlockingMs).toBeGreaterThan(0);
    expect(metrics.cumulativeLayoutShift).toBeGreaterThan(0);
    expect(metrics.requestCount).toBeGreaterThan(0);
    expect(metrics.transferBytes).toBeGreaterThan(0);
    expect(metrics.observationWindowMs).toBeGreaterThan(0);
    expect(metrics.failures).toEqual([]);
    // Everything is same-origin on this fixture.
    expect(metrics.thirdPartyRequestCount).toBe(0);
    expect(metrics.thirdPartyHosts).toEqual([]);
  }, 90_000);

  it('finds the seeded accessibility faults', async () => {
    const result = await run();
    const homepage = result.pages[0]!;
    expect(homepage.axeError).toBeUndefined();
    expect(homepage.axe!.ruleIds).toContain('image-alt');
    expect(homepage.axe!.violationCount).toBeGreaterThan(0);
    expect(homepage.axe!.affectedElementCount).toBeGreaterThan(0);
  }, 90_000);

  it('stores screenshot references relative to the prescan directory', async () => {
    const result = await run();
    for (const page of result.pages) {
      expect(page.rawScreenshotRef).toBeDefined();
      expect(path.isAbsolute(page.rawScreenshotRef!)).toBe(false);
      await expect(fs.stat(path.join(scratchDir, page.rawScreenshotRef!))).resolves.toBeDefined();
    }
  }, 90_000);

  it('returns no audit manifest, findings, or analysis fields', async () => {
    const result = await run();
    const keys = Object.keys(result);
    expect(keys).not.toContain('manifest');
    expect(keys).not.toContain('findings');
    expect(keys).not.toContain('analysis');
    for (const page of result.pages) {
      expect(Object.keys(page)).not.toContain('lighthouse');
    }
  }, 90_000);

  it('reports progress for every page it loads', async () => {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-prescan-'));
    const events: PrescanProgressEvent[] = [];
    const result = await prescanSite(`${baseUrl}/`, {
      browser,
      artifactsDir: scratchDir,
      delayMs: 0,
      settleTimeoutMs: 2_000,
      onProgress: (event) => events.push(event),
    });
    expect(events[0]).toMatchObject({ type: 'prescan-start' });
    expect(events.filter((event) => event.type === 'prescan-page')).toHaveLength(
      result.pages.length,
    );
  }, 90_000);

  it('returns homepage-unreachable rather than throwing when the site is down', async () => {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-prescan-'));
    const result = await prescanSite('http://127.0.0.1:9/', {
      browser,
      artifactsDir: scratchDir,
      delayMs: 0,
      timeoutMs: 3_000,
      settleTimeoutMs: 1_000,
    });
    expect(result.status).toBe('homepage-unreachable');
    expect(result.pages[0]!.error).toBeDefined();
  }, 60_000);
});
