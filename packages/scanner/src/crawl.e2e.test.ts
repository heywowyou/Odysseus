import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { crawlSite, type CrawlProgressEvent } from './crawl.js';

// Origin of the shared fixtures/spa-demo dev server started once per e2e
// run by scripts/vitest-e2e-global-setup.mjs.
const TEST_URL = inject('spaDemoOrigin');

let browser: Browser;

describe('crawlSite against fixtures/spa-demo', () => {
  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
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

    const setups = events.filter((event) => event.type === 'crawl-setup');
    expect(setups).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'crawl-setup', maxPages: 10, delayMs: 0 });

    const starts = events.filter((event) => event.type === 'crawl-start');
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({ maxPages: 10, robotsTxtFound: true });

    const pageEvents = events.filter((event) => event.type === 'crawl-page');
    expect(pageEvents).toHaveLength(result.visitedCount);
    expect(
      pageEvents.map((event) => (event.type === 'crawl-page' ? event.visited : undefined)),
    ).toEqual([1, 2, 3]);
  }, 45_000);

  it('extracts an audit profile for every visited page, from the existing navigation only', async () => {
    const result = await crawlSite(TEST_URL, {
      browser,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
    });

    const visitedPages = result.pages.filter((page) => page.status === 'visited');
    expect(visitedPages.length).toBeGreaterThan(0);
    for (const page of visitedPages) {
      expect(page.auditProfile).toBeDefined();
      expect(page.auditProfile?.profileVersion).toBe('v2');
      expect(page.auditProfile?.url).toBe(page.url);
    }

    const nonVisitedPages = result.pages.filter((page) => page.status !== 'visited');
    for (const page of nonVisitedPages) {
      expect(page.auditProfile).toBeUndefined();
    }

    const home = result.pages.find((page) => page.url === TEST_URL || page.url === `${TEST_URL}/`);
    expect(home?.auditProfile?.roleSignals[0]).toMatchObject({ kind: 'homepage-url' });
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
