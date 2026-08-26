import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { crawlSite, type CrawlProgressEvent } from './crawl.js';

const TEST_PORT = 5187;
const TEST_URL = `http://localhost:${TEST_PORT}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const spaDemoDir = path.resolve(__dirname, '../../../fixtures/spa-demo');
const viteBin = path.join(spaDemoDir, 'node_modules', '.bin', 'vite');

let devServer: ChildProcess;
let browser: Browser;

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url} to respond`);
}

describe('crawlSite against fixtures/spa-demo', () => {
  beforeAll(async () => {
    devServer = spawn(viteBin, ['--port', String(TEST_PORT), '--strictPort'], {
      cwd: spaDemoDir,
      stdio: 'ignore',
    });
    await waitForServer(TEST_URL, 30_000);
    ({ browser } = await launchBrowser());
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
    devServer?.kill();
  });

  it('follows internal links, respects robots.txt, and stays within the caps', async () => {
    const result = await crawlSite(TEST_URL, {
      browser,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
    });

    expect(result.robotsTxtFound).toBe(true);
    expect(result.visitedCount).toBe(3);
    expect(result.sitemap).toBeUndefined();

    const byUrl = new Map(result.pages.map((page) => [new URL(page.url).pathname, page]));

    const home = byUrl.get('/');
    expect(home?.status).toBe('visited');
    expect(home?.depth).toBe(0);
    expect(home?.httpStatus).toBe(200);

    const about = byUrl.get('/about.html');
    expect(about?.status).toBe('visited');
    expect(about?.depth).toBe(1);
    expect(about?.discoveredFrom).toBe(`${TEST_URL}/`);

    const mentionsLegales = byUrl.get('/mentions-legales.html');
    expect(mentionsLegales?.status).toBe('visited');
    expect(mentionsLegales?.depth).toBe(1);
    expect(result.mentionsLegalesPageUrl).toBe(`${TEST_URL}/mentions-legales.html`);

    const privatePage = byUrl.get('/private.html');
    expect(privatePage?.status).toBe('skipped-robots');

    // Dropped by links.ts's extension filter before ever being enqueued,
    // so it never costs a visited slot and never appears in pages at all.
    expect(byUrl.get('/vineyard.svg')).toBeUndefined();
  }, 45_000);

  it('stops discovering new links once maxDepth is reached', async () => {
    const result = await crawlSite(TEST_URL, {
      browser,
      maxPages: 10,
      maxDepth: 0,
      delayMs: 0,
    });

    expect(result.visitedCount).toBe(1);
    expect(result.pages.every((page) => page.depth === 0)).toBe(true);
  }, 45_000);

  it('stops visiting once maxPages is reached', async () => {
    const result = await crawlSite(TEST_URL, {
      browser,
      maxPages: 1,
      maxDepth: 3,
      delayMs: 0,
    });

    expect(result.visitedCount).toBe(1);
  }, 45_000);

  it('emits crawl-start once and crawl-page once per visited page', async () => {
    const events: CrawlProgressEvent[] = [];

    const result = await crawlSite(TEST_URL, {
      browser,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
      onProgress: (event) => events.push(event),
    });

    const starts = events.filter((event) => event.type === 'crawl-start');
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({ maxPages: 10, robotsTxtFound: true });

    const pageEvents = events.filter((event) => event.type === 'crawl-page');
    expect(pageEvents).toHaveLength(result.visitedCount);
    expect(
      pageEvents.map((event) => (event.type === 'crawl-page' ? event.visited : undefined)),
    ).toEqual([1, 2, 3]);
  }, 45_000);

  it('inspects a sitemap without adding its orphan page to the link crawl', async () => {
    const result = await crawlSite(TEST_URL, {
      browser,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
      sitemapMode: 'inspect',
    });

    expect(result.visitedCount).toBe(3);
    expect(result.sitemap?.pageEntries).toHaveLength(4);
    expect(result.pages.some((page) => page.discoveryMethod === 'sitemap-only')).toBe(false);
    expect(result.sitemapCoverage).toMatchObject({
      declaredPageCount: 4,
      eligiblePageCount: 4,
      scannedPageCount: 3,
      capOmittedPageCount: 0,
    });
  }, 45_000);

  it('supplements only after the link frontier and records cap omissions', async () => {
    const uncapped = await crawlSite(TEST_URL, {
      browser,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
      sitemapMode: 'supplement',
    });
    expect(
      uncapped.pages.find((page) => new URL(page.url).pathname === '/sitemap-only.html'),
    ).toMatchObject({ status: 'visited', discoveryMethod: 'sitemap-only' });

    const capped = await crawlSite(TEST_URL, {
      browser,
      maxPages: 3,
      maxDepth: 3,
      delayMs: 0,
      sitemapMode: 'supplement',
    });
    expect(capped.pages.some((page) => page.discoveryMethod === 'sitemap-only')).toBe(false);
    expect(capped.sitemapCoverage?.capOmittedPageCount).toBeGreaterThan(0);
  }, 90_000);
});
