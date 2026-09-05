import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./crawl.js', () => ({ crawlSite: vi.fn() }));
vi.mock('./scan-page.js', () => ({
  scanPage: vi.fn(),
  runRenderedAnalysis: vi.fn(),
  runLighthouseAnalysis: vi.fn(),
}));
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
import { scanPage, runRenderedAnalysis, runLighthouseAnalysis } from './scan-page.js';
import { checkLlmsTxt } from './checks/llms-txt.js';
import { checkSecurityHeaders } from './checks/security-headers.js';
import { checkCookieConsent } from './checks/cookie-consent.js';
import { scanSite, type ScanProgressEvent } from './scan-site.js';
import { readPageScanJson } from './artifacts/page-scan-io.js';

let writtenTempDirs: string[] = [];

async function makeTempAuditDir(prefix: string): Promise<{ auditDir: string; pagesDir: string }> {
  const auditDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  writtenTempDirs.push(auditDir);
  return { auditDir, pagesDir: path.join(auditDir, 'pages') };
}

afterEach(async () => {
  await Promise.all(writtenTempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  writtenTempDirs = [];
});

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

  it('issue #64: writes each page scan.json to disk as it completes and keeps result.pages empty when writePagesAsScanned is set', async () => {
    const { auditDir, pagesDir } = await makeTempAuditDir('scan-site-legacy-');
    vi.mocked(scanPage).mockImplementation(async (_browser, _port, url) => ({
      url,
      axe: {
        violations: [],
        passes: [],
        testEngine: { name: 'axe-core', version: '4.0.0' },
      } as never,
    }));

    const result = await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: pagesDir,
      auditDir,
      writePagesAsScanned: true,
      concurrency: 4,
    });

    expect(result.pages).toHaveLength(0);

    for (const url of [startUrl, `${startUrl}a`, `${startUrl}b`, `${startUrl}legal`]) {
      const written = readPageScanJson(pagesDir, url);
      expect(written).toBeDefined();
      expect(written?.url).toBe(url);
      expect(written?.axe?.testEngine.version).toBe('4.0.0');
    }
  });

  it('issue #64: requires auditDir when writePagesAsScanned is set', async () => {
    await expect(
      scanSite(startUrl, {
        browser: {} as never,
        debugPort: 9222,
        screenshotDir: '/tmp/pages',
        writePagesAsScanned: true,
      }),
    ).rejects.toThrow(/auditDir/);
  });
});

describe('scanSite with fullAuditPlanning', () => {
  const pageA = `${startUrl}a`;
  const pageB = `${startUrl}b`;

  const withProfile = (
    url: string,
    roleSignals: { kind: string; detail: string }[],
    templateFamilyId?: string,
  ) => ({
    url,
    status: 'visited',
    discoveryMethod: 'link',
    auditProfile: {
      url,
      profileVersion: 'v1',
      roleSignals,
      ...(templateFamilyId !== undefined ? { templateFamilyId } : {}),
    },
  });

  beforeEach(() => {
    vi.mocked(crawlSite).mockResolvedValue({
      startUrl,
      pages: [
        withProfile(startUrl, [{ kind: 'homepage-url', detail: startUrl }]),
        withProfile(pageA, [{ kind: 'content-json-ld-type', detail: 'Article' }], 'family-1'),
        withProfile(pageB, [{ kind: 'content-json-ld-type', detail: 'Article' }], 'family-1'),
      ],
      effectiveDelayMs: 0,
      visitedCount: 3,
      maxPages: 10,
      maxDepth: 2,
      robotsTxtFound: true,
      robotsDisallowMatches: [],
      aiCrawlerBlocks: [],
      linkDiscoveredUrls: [pageA, pageB],
    } as never);
    vi.mocked(runRenderedAnalysis).mockImplementation(async (_browser, url) => ({
      url,
      checkOutcomes: {
        'render-diff': 'completed',
        axe: 'completed',
        'transactional-flow-evidence': 'completed',
        'transactional-flow-redirect-checks': 'completed',
        'head-metadata': 'completed',
        'canonical-target': 'not-applicable',
        'mixed-content': 'completed',
        'keyboard-navigation': url === pageB ? 'failed' : 'completed',
        'form-error-handling': 'completed',
        'video-captions': 'completed',
        'alt-text': 'completed',
        'nap-consistency': 'completed',
        reflow: 'completed',
        'html-validity': 'completed',
        'structured-data': 'completed',
      },
    }));
    vi.mocked(runLighthouseAnalysis).mockImplementation(async (url) => ({
      lighthouse: { finalUrl: url } as never,
    }));
  });

  it('runs rendered analysis for every visited page and Lighthouse only for the planner-selected ones', async () => {
    const events: ScanProgressEvent[] = [];
    const result = await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 3,
      fullAuditPlanning: true,
      onProgress: (event) => events.push(event),
    });

    expect(
      vi
        .mocked(runRenderedAnalysis)
        .mock.calls.map((call) => call[1])
        .sort(),
    ).toEqual([startUrl, pageA, pageB].sort());

    // The homepage is mandatory; of the two same-family content pages,
    // only the stable representative (page A, first by URL) is selected
    // in the absence of any rendered-cost outlier data - page B never
    // runs Lighthouse.
    expect(
      vi
        .mocked(runLighthouseAnalysis)
        .mock.calls.map((call) => call[0])
        .sort(),
    ).toEqual([startUrl, pageA].sort());

    expect(result.fullAuditPlan?.decisions).toHaveLength(3);
    const bDecision = result.fullAuditPlan?.decisions.find((d) => d.url === pageB);
    expect(bDecision?.plannedPasses).not.toContain('lighthouse');
    const aDecision = result.fullAuditPlan?.decisions.find((d) => d.url === pageA);
    expect(aDecision?.plannedPasses).toContain('lighthouse');

    for (const pageResult of result.pages) {
      expect(pageResult).not.toHaveProperty('checkOutcomes');
      expect(pageResult).not.toHaveProperty('renderedCostProfile');
    }
    const homeResult = result.pages.find((p) => p.url === startUrl);
    expect(homeResult?.lighthouse).toBeDefined();
    const bResult = result.pages.find((p) => p.url === pageB);
    expect(bResult?.lighthouse).toBeUndefined();

    expect(result.analysisCoverageByUrl?.get(startUrl)?.passes).toEqual({
      rendered: { outcome: 'completed' },
      axe: { outcome: 'completed' },
      extended: { outcome: 'completed' },
      lighthouse: { outcome: 'completed' },
    });
    expect(result.analysisCoverageByUrl?.get(pageB)?.passes).toEqual({
      rendered: { outcome: 'completed' },
      axe: { outcome: 'completed' },
      extended: { outcome: 'partial', failedCheckIds: ['keyboard-navigation'] },
      lighthouse: { outcome: 'not-planned' },
    });
    expect(events.filter((event) => event.type.startsWith('content-scan'))).toEqual([
      { type: 'content-scan-start', totalPages: 3 },
      { type: 'content-scan-page', completed: 1, totalPages: 3, url: startUrl },
      { type: 'content-scan-page', completed: 2, totalPages: 3, url: pageA },
      { type: 'content-scan-page', completed: 3, totalPages: 3, url: pageB },
    ]);
    expect(events.filter((event) => event.type === 'select-performance')).toEqual([
      { type: 'select-performance' },
    ]);
    expect(events.filter((event) => event.type.startsWith('lighthouse'))).toEqual([
      { type: 'lighthouse-start', totalPages: 2 },
      { type: 'lighthouse-page', completed: 1, totalPages: 2, url: startUrl },
      { type: 'lighthouse-page', completed: 2, totalPages: 2, url: pageA },
    ]);
    expect(events.at(-1)).toEqual({ type: 'analysis-complete' });
  });

  it('never calls Lighthouse when skipLighthouse is set, even for planner-selected pages', async () => {
    const result = await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 3,
      fullAuditPlanning: true,
      skipLighthouse: true,
    });

    expect(runLighthouseAnalysis).not.toHaveBeenCalled();
    // The plan itself still records the selection, for provenance, even
    // though it was never acted on.
    const homeDecision = result.fullAuditPlan?.decisions.find((d) => d.url === startUrl);
    expect(homeDecision?.plannedPasses).toContain('lighthouse');
    expect(result.pages.every((p) => p.lighthouse === undefined)).toBe(true);
    expect(result.analysisCoverageByUrl?.get(startUrl)?.passes.lighthouse).toEqual({
      outcome: 'not-planned',
    });
  });

  it('throws if a visited page has no audit profile, rather than silently skipping it', async () => {
    vi.mocked(crawlSite).mockResolvedValue({
      startUrl,
      pages: [{ url: startUrl, status: 'visited', discoveryMethod: 'seed' }],
      effectiveDelayMs: 0,
      visitedCount: 1,
      maxPages: 10,
      maxDepth: 2,
      robotsTxtFound: true,
      robotsDisallowMatches: [],
      aiCrawlerBlocks: [],
      linkDiscoveredUrls: [],
    } as never);

    await expect(
      scanSite(startUrl, {
        browser: {} as never,
        debugPort: 9222,
        screenshotDir: '/tmp/pages',
        fullAuditPlanning: true,
      }),
    ).rejects.toThrow(/audit profile/);
  });

  it('issue #64: writes each page scan.json to disk during the staged content-scan/Lighthouse phases and keeps result.pages empty when writePagesAsScanned is set', async () => {
    const { auditDir, pagesDir } = await makeTempAuditDir('scan-site-staged-');

    const result = await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: pagesDir,
      auditDir,
      writePagesAsScanned: true,
      concurrency: 3,
      fullAuditPlanning: true,
    });

    expect(result.pages).toHaveLength(0);

    const home = readPageScanJson(pagesDir, startUrl);
    const a = readPageScanJson(pagesDir, pageA);
    const b = readPageScanJson(pagesDir, pageB);

    expect(home).toBeDefined();
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    // Content is written for every page; only the planner-selected pages
    // (home and page A) end up with a lighthouse result merged in.
    expect(home?.lighthouse).toBeDefined();
    expect(a?.lighthouse).toBeDefined();
    expect(b?.lighthouse).toBeUndefined();

    for (const written of [home, a, b]) {
      expect(written).not.toHaveProperty('checkOutcomes');
      expect(written).not.toHaveProperty('renderedCostProfile');
    }
  });
});
