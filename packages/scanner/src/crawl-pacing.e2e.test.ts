import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { crawlSite, type CrawlProgressEvent } from './crawl.js';
import { scanSite } from './scan-site.js';

/**
 * Behavior cover for the inter-request politeness delay, the invariant that
 * protects fragile client sites (the coverage gate literally tells operators
 * to "Slow the crawl" when a site pushes back). The rest of the e2e suite
 * sets delayMs: 0 for wall-time economy, so a regression that drops or
 * misreads the delay would pass everything green and first surface as a
 * client's site 429ing mid-audit. These tests are the only place the delay
 * is asserted as behavior, not option forwarding.
 *
 * Fake timers are not usable here: the sleeps sit between real Chromium
 * navigations, so virtual time would desynchronize from the browser. Every
 * assertion below is therefore a floor (40 ms for a 50 ms setting) or a
 * generous ceiling in the render-diff-settle style: it asserts the pacing is
 * bounded at all, never a precise duration.
 */

interface RecordedRequest {
  url: string;
  at: number;
}

interface RecordingServer {
  origin: string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
}

/**
 * Serves the given page paths with tiny script-free HTML (the first page
 * links the others so a crawl can discover them) and 404s everything else,
 * including the /robots.txt probe. Every request is timestamped so the
 * assertions below can measure the gaps the crawl itself produced.
 */
async function makeRecordingServer(pageNames: readonly string[]): Promise<RecordingServer> {
  const requests: RecordedRequest[] = [];
  const servedPages = new Set(pageNames);
  const homePath = pageNames[0] ?? '';
  const server = http.createServer((req, res) => {
    const url = req.url ?? '';
    requests.push({ url, at: Date.now() });
    if (!servedPages.has(url)) {
      res.writeHead(404);
      res.end();
      return;
    }
    // Only the homepage carries links; the others stay leaf pages so the
    // crawl visits exactly the paths the test names.
    const links =
      url === homePath
        ? pageNames
            .slice(1)
            .map((pagePath) => `<a href="${pagePath}">next</a>`)
            .join('')
        : '';
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><html><body><p>ok</p>${links}</body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('server did not bind a port');
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  };
}

/**
 * Only requests whose path exactly equals a served page path count as paced
 * crawl traffic. This excludes the /robots.txt probe (fetched before the
 * crawl loop, never paced) and browser probes such as /favicon.ico, none of
 * which the delay governs.
 */
function pageRequestTimesByUrl(
  requests: readonly RecordedRequest[],
  pagePaths: readonly string[],
): Map<string, number[]> {
  const timesByUrl = new Map<string, number[]>();
  for (const request of requests) {
    if (!pagePaths.includes(request.url)) continue;
    const times = timesByUrl.get(request.url) ?? [];
    times.push(request.at);
    timesByUrl.set(request.url, times);
  }
  for (const times of timesByUrl.values()) {
    times.sort((a, b) => a - b);
  }
  return timesByUrl;
}

let browser: Browser;
let debugPort: number;

beforeAll(async () => {
  ({ browser, debugPort } = await launchBrowser());
}, 45_000);

afterAll(async () => {
  await browser?.close();
});

describe('crawlSite paces requests by delayMs', () => {
  const PAGE_PATHS = ['/', '/b.html', '/c.html'];
  let recording: RecordingServer;

  beforeAll(async () => {
    recording = await makeRecordingServer(PAGE_PATHS);
  });

  afterAll(async () => {
    await recording.close();
  });

  it('keeps at least the requested delay between page requests and reports it as effectiveDelayMs', async () => {
    const startedAt = Date.now();
    const events: CrawlProgressEvent[] = [];
    const result = await crawlSite(recording.origin, {
      browser,
      maxPages: 3,
      maxDepth: 1,
      delayMs: 50,
      onProgress: (event) => events.push(event),
    });
    const elapsedMs = Date.now() - startedAt;

    expect(result.visitedCount).toBe(3);

    // No robots.txt was served, so the max with the robots crawl-delay
    // cannot have raised the effective delay above the requested 50 ms.
    const starts = events.filter((event) => event.type === 'crawl-start');
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({ type: 'crawl-start', effectiveDelayMs: 50 });

    // The first navigation pays no sleep, but the gap between the first and
    // second request contains the first 50 ms sleep, so the floor holds for
    // every consecutive gap.
    const timesByUrl = pageRequestTimesByUrl(recording.requests, PAGE_PATHS);
    const pageTimes: number[] = [];
    for (const pagePath of PAGE_PATHS) {
      const times = timesByUrl.get(pagePath);
      expect(times).toBeDefined();
      expect(times).toHaveLength(1);
      pageTimes.push(times![0]!);
    }
    pageTimes.sort((a, b) => a - b);
    for (let i = 1; i < pageTimes.length; i += 1) {
      // Floor 40 ms for a 50 ms setting: this asserts the politeness floor,
      // not a precise cadence.
      expect(pageTimes[i]! - pageTimes[i - 1]!).toBeGreaterThanOrEqual(40);
    }

    // Generous ceiling in the render-diff-settle style: three local pages
    // plus two 50 ms sleeps normally finish in well under 2 s standalone,
    // but the whole-project run shares the machine with Lighthouse-heavy
    // sibling suites, so the ceiling is calibrated for a loaded machine.
    expect(elapsedMs).toBeLessThan(15_000);
  }, 45_000);
});

describe('scanSite staggers lane starts by laneIndex * delayMs', () => {
  const PAGE_PATHS = ['/', '/p1.html', '/p2.html', '/p3.html'];
  let recording: RecordingServer;
  let screenshotDir: string;

  beforeAll(async () => {
    recording = await makeRecordingServer(PAGE_PATHS);
    screenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-pacing-'));
  });

  afterAll(async () => {
    await recording.close();
    if (screenshotDir) await fs.rm(screenshotDir, { recursive: true, force: true });
  });

  it("starts the two lanes' first requests at least one delay apart", async () => {
    const startedAt = Date.now();
    const result = await scanSite(recording.origin, {
      browser,
      debugPort,
      maxPages: 4,
      maxDepth: 1,
      delayMs: 250,
      concurrency: 2,
      skipLighthouse: true,
      screenshotDir,
    });
    const elapsedMs = Date.now() - startedAt;

    expect(result.crawl.visitedCount).toBe(4);
    expect(result.pages).toHaveLength(4);

    // Every page is requested at least three times: once by the internal
    // crawl, then twice inside its lane's scanPage call, where renderDiff
    // navigates a raw pass and a rendered pass. The site-level fetches (the
    // security-headers request and the cookie-consent navigation, which both
    // hit the start URL) all finish before the lanes start, so each path's
    // LAST two requests are always renderDiff's raw and rendered pair.
    const timesByUrl = pageRequestTimesByUrl(recording.requests, PAGE_PATHS);
    const lanePhaseTimes: number[] = [];
    for (const pagePath of PAGE_PATHS) {
      const times = timesByUrl.get(pagePath);
      // Fewer than three means the page-path filter upstream is wrong, not
      // that the site was scanned less.
      expect(times).toBeDefined();
      expect(times!.length).toBeGreaterThanOrEqual(3);
      lanePhaseTimes.push(...times!.slice(-2));
    }
    expect(lanePhaseTimes).toHaveLength(8);
    lanePhaseTimes.sort((a, b) => a - b);

    // The earliest lane-phase request is lane 0's first raw navigation; the
    // next is at least one 250 ms delay later, whether it is lane 1's own
    // first navigation (the lanes start laneIndex * effectiveDelayMs apart)
    // or lane 0's rendered pass (renderDiff sleeps delayMs between its two
    // navigations). A regression that drops the stagger collapses this gap
    // to near zero; that collapse is the failure this test exists to catch.
    // A 200 ms floor for a 250 ms setting leaves ordinary timer jitter while
    // remaining observable when the full suite heavily contends for CPU.
    expect(lanePhaseTimes[1]! - lanePhaseTimes[0]!).toBeGreaterThanOrEqual(200);

    // Generous ceiling: crawl phase plus scan phase, over a dozen
    // navigations plus paced sleeps. Standalone this run finishes in about
    // 5 s, but under the whole-project run it shares the machine with
    // Lighthouse-heavy sibling suites and was measured at 16.4 s once, so
    // the ceiling leaves headroom for that load rather than for the
    // standalone time. The floors above are the actual test; this only
    // catches pathological slowness.
    expect(elapsedMs).toBeLessThan(45_000);
  }, 60_000);
});
