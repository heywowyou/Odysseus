import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./crawl.js', () => ({ crawlSite: vi.fn() }));
vi.mock('./scan-page.js', () => ({ scanPage: vi.fn() }));
vi.mock('./checks/llms-txt.js', () => ({ checkLlmsTxt: vi.fn() }));
vi.mock('./checks/security-headers.js', () => ({ checkSecurityHeaders: vi.fn() }));
vi.mock('./checks/cookie-consent.js', () => ({ checkCookieConsent: vi.fn() }));
vi.mock('./checks/accessibility-statement.js', () => ({
  checkAccessibilityStatement: vi.fn(() => ({ found: false })),
}));
vi.mock('./crux.js', () => ({ fetchCruxFieldData: vi.fn() }));
vi.mock('./config.js', () => ({
  getCruxApiKey: vi.fn(() => undefined),
  getPageTimeoutMs: vi.fn(() => 30_000),
  getScanConcurrency: vi.fn(() => 3),
}));

import { crawlSite } from './crawl.js';
import { scanPage } from './scan-page.js';
import { checkLlmsTxt } from './checks/llms-txt.js';
import { checkSecurityHeaders } from './checks/security-headers.js';
import { checkCookieConsent } from './checks/cookie-consent.js';
import { scanSite, type ScanProgressEvent } from './scan-site.js';

const startUrl = 'https://example.com/';
const visited = (url: string, discoveryMethod = 'link') => ({
  url,
  status: 'visited',
  discoveryMethod,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(crawlSite).mockResolvedValue({
    startUrl,
    pages: [
      visited(startUrl),
      visited(`${startUrl}a`),
      { url: `${startUrl}blocked`, status: 'robots-disallowed', discoveryMethod: 'link' },
      visited(`${startUrl}b`, 'sitemap-only'),
      visited(`${startUrl}legal`),
    ],
    effectiveDelayMs: 100,
    visitedCount: 4,
    maxPages: 10,
    maxDepth: 2,
    robotsTxtFound: true,
    robotsDisallowMatches: [],
    aiCrawlerBlocks: [],
    mentionsLegalesPageUrl: `${startUrl}legal`,
    linkDiscoveredUrls: [`${startUrl}a`, `${startUrl}legal`],
    sitemap: { available: true },
  } as never);
  vi.mocked(scanPage).mockImplementation(async (_browser, _port, url) => ({ url }));
  vi.mocked(checkLlmsTxt).mockResolvedValue({ available: false } as never);
  vi.mocked(checkSecurityHeaders).mockResolvedValue({ status: 200 } as never);
  vi.mocked(checkCookieConsent).mockResolvedValue({ consentRequired: false } as never);
});

describe('scanSite characterization', () => {
  it('selects visited pages, distributes lanes, forwards options and emits progress', async () => {
    vi.useFakeTimers();
    const events: ScanProgressEvent[] = [];
    const pending = scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 2,
      timeoutMs: 12_000,
      userAgent: 'test-agent',
      bookingEngineUrl: 'https://booking.example/',
      skipLighthouse: true,
      seeds: [`${startUrl}seed`],
      exclusions: [`${startUrl}skip`],
      sitemapMode: 'inspect',
      onProgress: (event) => events.push(event),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(scanPage).mock.calls.map((call) => call[2])).toEqual([startUrl]);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;
    vi.useRealTimers();

    expect(result.pages).toHaveLength(4);
    expect(
      vi
        .mocked(scanPage)
        .mock.calls.map((call) => call[2])
        .sort(),
    ).toEqual([startUrl, `${startUrl}a`, `${startUrl}b`, `${startUrl}legal`].sort());
    const homeOptions = vi.mocked(scanPage).mock.calls.find((call) => call[2] === startUrl)?.[3];
    expect(homeOptions).toMatchObject({
      timeoutMs: 12_000,
      userAgent: 'test-agent',
      bookingEngineUrl: 'https://booking.example/',
      skipLighthouse: true,
      homepageUrl: startUrl,
    });
    expect(homeOptions?.sitemapCheck).toMatchObject({
      crawledUrls: [startUrl, `${startUrl}a`, `${startUrl}legal`],
      discoveredUrls: [`${startUrl}a`, `${startUrl}legal`],
    });
    expect(vi.mocked(crawlSite).mock.calls[0]?.[1]).toMatchObject({
      seeds: [`${startUrl}seed`],
      exclusions: [`${startUrl}skip`],
      sitemapMode: 'inspect',
    });
    expect(events.filter((event) => event.type === 'scan-start')).toEqual([
      { type: 'scan-start', totalPages: 4 },
    ]);
    expect(events.filter((event) => event.type === 'scan-page')).toHaveLength(4);
  });

  it('fetches each site-level check once', async () => {
    await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 4,
    });
    expect(checkLlmsTxt).toHaveBeenCalledOnce();
    expect(checkSecurityHeaders).toHaveBeenCalledOnce();
    expect(checkCookieConsent).toHaveBeenCalledOnce();
  });
});
