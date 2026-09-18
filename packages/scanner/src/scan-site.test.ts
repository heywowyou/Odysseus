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
vi.mock('./mobile-surface.js', async () => {
  // The real identity error class, so the refusal path is exercised against
  // the actual fail-closed contract rather than a stand-in.
  const { SurfaceIdentityError } = await import('./evidence-surfaces.js');
  return {
    SurfaceIdentityError,
    runMobileSurfaceAnalysis: vi.fn(),
  };
});
vi.mock('./checks/llms-txt.js', () => ({ checkLlmsTxt: vi.fn() }));
vi.mock('./checks/security-headers.js', () => ({ checkSecurityHeaders: vi.fn() }));
vi.mock('./checks/cookie-consent.js', () => ({ checkCookieConsent: vi.fn() }));
vi.mock('./checks/accessibility-statement.js', () => ({
  checkAccessibilityStatement: vi.fn(() => ({ found: false })),
}));
vi.mock('./crux.js', () => ({ fetchCruxFieldDataAcquisition: vi.fn() }));
vi.mock('./config.js', () => ({
  getCrawlerUserAgent: vi.fn(() => 'OdysseusBot/1.0 (+https://odysseusaudit.com/bot)'),
  getCruxApiKey: vi.fn(() => undefined),
  getPageTimeoutMs: vi.fn(() => 30_000),
  getScanConcurrency: vi.fn(() => 3),
  getCrawlDelayMs: vi.fn(() => 333),
}));

import { crawlSite } from './crawl.js';
import { scanPage, runRenderedAnalysis, runLighthouseAnalysis } from './scan-page.js';
import { runMobileSurfaceAnalysis } from './mobile-surface.js';
import { checkLlmsTxt } from './checks/llms-txt.js';
import { checkSecurityHeaders } from './checks/security-headers.js';
import { checkCookieConsent } from './checks/cookie-consent.js';
import { scanSite, withPageWatchdog, type ScanProgressEvent } from './scan-site.js';
import { readPageScanJson } from './artifacts/page-scan-io.js';
import { createPageWorkGuard } from './page-work-guard.js';
import { mobileSurface } from './evidence-surfaces.js';
import type { RenderedAnalysisResult } from './scan-page.js';
import type { RenderedReadinessObservation } from './page-readiness.js';

let writtenTempDirs: string[] = [];

async function makeTempAuditDir(prefix: string): Promise<{ auditDir: string; pagesDir: string }> {
  const auditDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  writtenTempDirs.push(auditDir);
  return { auditDir, pagesDir: path.join(auditDir, 'pages') };
}

afterEach(async () => {
  // Restored here rather than at the end of each fake-timer test: a failing
  // assertion skips the in-test restore, and every later test then waits on
  // the shared host scheduler's setTimeout, which fake timers never fire.
  // One real failure became ten indistinguishable 20s timeouts that way.
  vi.useRealTimers();
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
    mentionsLegalesSearchedUrls: [startUrl, `${startUrl}a`, `${startUrl}legal`],
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

    // Plan 059 decision 18: request starts are spaced by the run's one host
    // scheduler, not by a per-lane stagger. The site-level checks take the
    // first slots, so at t=0 exactly one request has started and no page
    // lane has begun, whatever the concurrency.
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(checkLlmsTxt)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(checkSecurityHeaders)).not.toHaveBeenCalled();
    expect(vi.mocked(scanPage)).not.toHaveBeenCalled();
    // Generous enough to cover every remaining paced start (4 pages plus the
    // site-level checks at the crawl's 100ms effective delay) without pinning
    // the assertion to an exact number of scheduler sleeps.
    const [result] = await Promise.all([pending, vi.advanceTimersByTimeAsync(5_000)]);

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

  it('threads the mentions-legales checked-page list to the resolved page, not the homepage fallback (plan 036)', async () => {
    await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 4,
    });
    const legalOptions = vi
      .mocked(scanPage)
      .mock.calls.find((call) => call[2] === `${startUrl}legal`)?.[3];
    expect(legalOptions).toMatchObject({
      mentionsLegalesUrl: `${startUrl}legal`,
      mentionsLegalesSearchedUrls: [startUrl, `${startUrl}a`, `${startUrl}legal`],
    });
    expect(legalOptions?.mentionsLegalesHomepageFallback).toBeFalsy();
  });

  it('marks the homepage fallback when no URL matched the mentions-legales heuristic (plan 036)', async () => {
    vi.mocked(crawlSite).mockResolvedValue({
      startUrl,
      pages: [visited(startUrl), visited(`${startUrl}a`)],
      effectiveDelayMs: 100,
      visitedCount: 2,
      maxPages: 10,
      maxDepth: 2,
      robotsTxtFound: true,
      robotsDisallowMatches: [],
      aiCrawlerBlocks: [],
      mentionsLegalesSearchedUrls: [startUrl, `${startUrl}a`],
      linkDiscoveredUrls: [`${startUrl}a`],
    } as never);

    await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 4,
    });
    const homeOptions = vi.mocked(scanPage).mock.calls.find((call) => call[2] === startUrl)?.[3];
    expect(homeOptions).toMatchObject({
      mentionsLegalesUrl: startUrl,
      mentionsLegalesSearchedUrls: [startUrl, `${startUrl}a`],
      mentionsLegalesHomepageFallback: true,
    });
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

  it('stops a full audit before content scans when the crawl is mass-rejected', async () => {
    vi.mocked(crawlSite).mockResolvedValue({
      startUrl,
      pages: [
        ...Array.from({ length: 3 }, (_, index) => visited(`${startUrl}ok-${index}`)),
        ...Array.from({ length: 7 }, (_, index) => ({
          url: `${startUrl}rejected-${index}`,
          status: 'http-error-status',
          httpStatus: 503,
          discoveryMethod: 'link',
        })),
      ],
      effectiveDelayMs: 100,
      visitedCount: 10,
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
    ).rejects.toThrow(/coverage is too incomplete/i);

    expect(scanPage).not.toHaveBeenCalled();
    expect(runRenderedAnalysis).not.toHaveBeenCalled();
    expect(checkLlmsTxt).not.toHaveBeenCalled();
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
        'placeholder-labels': 'completed',
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
      { type: 'content-scan-start', totalPages: 3, alreadyCompleted: 0, concurrency: 3 },
      {
        type: 'content-scan-page',
        completed: 1,
        totalPages: 3,
        url: startUrl,
        durationMs: expect.any(Number),
      },
      {
        type: 'content-scan-page',
        completed: 2,
        totalPages: 3,
        url: pageA,
        durationMs: expect.any(Number),
      },
      {
        type: 'content-scan-page',
        completed: 3,
        totalPages: 3,
        url: pageB,
        durationMs: expect.any(Number),
      },
    ]);
    expect(events.filter((event) => event.type === 'select-performance')).toEqual([
      { type: 'select-performance' },
    ]);
    expect(events.filter((event) => event.type.startsWith('lighthouse'))).toEqual([
      { type: 'lighthouse-start', totalPages: 2, alreadyCompleted: 0 },
      {
        type: 'lighthouse-page',
        completed: 1,
        totalPages: 2,
        url: startUrl,
        durationMs: expect.any(Number),
      },
      {
        type: 'lighthouse-page',
        completed: 2,
        totalPages: 2,
        url: pageA,
        durationMs: expect.any(Number),
      },
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
    // Plan 035: the staged lanes persist checkOutcomes and the rendered
    // cost profile alongside the content, so a resumed run can rebuild
    // every finalizeLighthousePlan input from disk.
    vi.mocked(runRenderedAnalysis).mockImplementation(async (_browser, url) => ({
      url,
      renderedCostProfile: {
        url,
        domNodeCount: 10,
        imageCount: 1,
        resourceCount: 5,
        knownTransferBytes: 1_000,
        unknownTransferSizeCount: 0,
      },
      checkOutcomes: { 'render-diff': 'completed', axe: 'completed' },
    }));

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
      expect(written?.checkOutcomes).toEqual({ 'render-diff': 'completed', axe: 'completed' });
      expect(written?.renderedCostProfile?.url).toBeDefined();
    }
  });
});

describe('scanSite Plan 059 attempt recording and targeted recovery', () => {
  const pageA = `${startUrl}a`;
  const scopeDigest = `sha256:${'a'.repeat(64)}`;
  const everyPageCheck = (overrides: Record<string, string> = {}) => ({
    'render-diff': 'completed',
    axe: 'completed',
    'mentions-legales': 'not-applicable',
    'transactional-flow-evidence': 'completed',
    'transactional-flow-redirect-checks': 'completed',
    'transactional-flow-ambiguities': 'completed',
    'head-metadata': 'completed',
    'canonical-target': 'not-applicable',
    'mixed-content': 'completed',
    'keyboard-navigation': 'completed',
    'form-error-handling': 'completed',
    'video-captions': 'completed',
    'placeholder-labels': 'completed',
    'alt-text': 'completed',
    'nap-consistency': 'not-applicable',
    reflow: 'completed',
    'html-validity': 'completed',
    'structured-data': 'completed',
    ...overrides,
  });

  beforeEach(() => {
    vi.mocked(crawlSite).mockResolvedValue({
      startUrl,
      pages: [
        {
          url: startUrl,
          status: 'visited',
          discoveryMethod: 'link',
          auditProfile: {
            url: startUrl,
            profileVersion: 'v1',
            roleSignals: [{ kind: 'homepage-url', detail: startUrl }],
          },
        },
        {
          url: pageA,
          status: 'visited',
          discoveryMethod: 'link',
          auditProfile: { url: pageA, profileVersion: 'v1', roleSignals: [] },
        },
      ],
      effectiveDelayMs: 0,
      visitedCount: 2,
      maxPages: 10,
      maxDepth: 2,
      robotsTxtFound: true,
      robotsDisallowMatches: [],
      aiCrawlerBlocks: [],
      linkDiscoveredUrls: [pageA],
    } as never);
    vi.mocked(runLighthouseAnalysis).mockResolvedValue({ lighthouse: { categories: {} } as never });
  });

  it('retries only the failed check in a fresh context and keeps every attempt', async () => {
    let pageARuns = 0;
    vi.mocked(runRenderedAnalysis).mockImplementation(async (_browser, url, options) => {
      if (url !== pageA) return { url, checkOutcomes: everyPageCheck() } as never;
      pageARuns += 1;
      if (pageARuns === 1) {
        return {
          url,
          headMetadata: { title: 'first' },
          keyboardNavigationError: 'keyboard probe threw',
          checkOutcomes: everyPageCheck({ 'keyboard-navigation': 'failed' }),
        } as never;
      }
      expect(options.screenshotDir).toBe(path.join('/tmp', 'recovery', 'isolated-retry'));
      return {
        url,
        headMetadata: { title: 'second' },
        keyboardNavigation: { focusableCount: 3 },
        checkOutcomes: everyPageCheck(),
      } as never;
    });

    const result = await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 1,
      fullAuditPlanning: true,
      skipLighthouse: true,
      scopeDigest,
    });

    expect(pageARuns).toBe(2);
    const a = result.pages.find((page) => page.url === pageA)!;
    // The retried check takes the retry's result; everything that already
    // succeeded keeps its first observation.
    expect(a.keyboardNavigation).toEqual({ focusableCount: 3 });
    expect(a.keyboardNavigationError).toBeUndefined();
    expect(a.headMetadata).toEqual({ title: 'first' });
    const keyboardAttempts = a.acquisitionAttempts!.filter(
      (attempt) => attempt.checkId === 'keyboard-navigation',
    );
    expect(keyboardAttempts.map((attempt) => [attempt.executionProfile, attempt.outcome])).toEqual([
      ['normal', 'failed'],
      ['isolated-retry', 'succeeded'],
    ]);
    expect(
      a.acquisitionAttempts!.filter((attempt) => attempt.checkId === 'head-metadata'),
    ).toHaveLength(1);
    expect(result.analysisCoverageByUrl?.get(pageA)?.passes.extended).toEqual({
      outcome: 'completed',
    });
  });

  it('never retries a definitive site answer', async () => {
    vi.mocked(runRenderedAnalysis).mockImplementation(async (_browser, url) =>
      url === pageA
        ? ({
            url,
            renderDiffError: 'navigation answered HTTP 404',
            checkOutcomes: { 'render-diff': 'failed', axe: 'not-applicable' },
          } as never)
        : ({ url, checkOutcomes: everyPageCheck() } as never),
    );

    const result = await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 1,
      fullAuditPlanning: true,
      skipLighthouse: true,
      scopeDigest,
    });

    expect(
      vi.mocked(runRenderedAnalysis).mock.calls.filter((call) => call[1] === pageA),
    ).toHaveLength(1);
    const a = result.pages.find((page) => page.url === pageA)!;
    const axe = a.acquisitionAttempts!.find((attempt) => attempt.checkId === 'axe')!;
    // axe reported not-applicable because the navigation never happened;
    // the ledger records why, instead of a check that simply did not apply.
    expect(axe).toMatchObject({
      outcome: 'failed',
      failureClass: 'site-http-state',
      diagnosticCode: 'navigation-failed',
    });
  });

  it('runs a timed-out page again in a fresh browser with a doubled bound, and closes it', async () => {
    const recoveryBrowser = { close: vi.fn(async () => undefined) };
    const launchRecoveryBrowser = vi.fn(async () => ({
      browser: recoveryBrowser as never,
      debugPort: 9333,
    }));
    let pageARuns = 0;
    vi.mocked(runRenderedAnalysis).mockImplementation(async (browser, url, options) => {
      if (url !== pageA) return { url, checkOutcomes: everyPageCheck() } as never;
      pageARuns += 1;
      if (pageARuns === 1) {
        return {
          url,
          renderDiffError: 'page.goto: Timeout 30000ms exceeded',
          checkOutcomes: { 'render-diff': 'failed', axe: 'not-applicable' },
        } as never;
      }
      expect(browser).toBe(recoveryBrowser);
      expect(options.timeoutMs).toBe(60_000);
      return { url, checkOutcomes: everyPageCheck() } as never;
    });

    const result = await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 1,
      fullAuditPlanning: true,
      skipLighthouse: true,
      scopeDigest,
      launchRecoveryBrowser,
    });

    expect(launchRecoveryBrowser).toHaveBeenCalledTimes(1);
    expect(recoveryBrowser.close).toHaveBeenCalledTimes(1);
    const a = result.pages.find((page) => page.url === pageA)!;
    const renderDiff = a.acquisitionAttempts!.filter(
      (attempt) => attempt.checkId === 'render-diff',
    );
    expect(renderDiff.map((attempt) => attempt.executionProfile)).toEqual([
      'normal',
      'diagnostic-retry',
    ]);
    expect(a.renderDiffError).toBeUndefined();
  });

  it('leaves a timeout as a recorded gap when no fresh browser can be launched', async () => {
    vi.mocked(runRenderedAnalysis).mockImplementation(async (_browser, url) =>
      url === pageA
        ? ({
            url,
            renderDiffError: 'page.goto: Timeout 30000ms exceeded',
            checkOutcomes: { 'render-diff': 'failed', axe: 'not-applicable' },
          } as never)
        : ({ url, checkOutcomes: everyPageCheck() } as never),
    );

    const result = await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 1,
      fullAuditPlanning: true,
      skipLighthouse: true,
      scopeDigest,
    });

    expect(
      vi.mocked(runRenderedAnalysis).mock.calls.filter((call) => call[1] === pageA),
    ).toHaveLength(1);
    const a = result.pages.find((page) => page.url === pageA)!;
    expect(
      a.acquisitionAttempts!.find((attempt) => attempt.checkId === 'render-diff'),
    ).toMatchObject({ outcome: 'failed', failureClass: 'scanner-timeout' });
  });

  it('records Lighthouse as a performance target and site checks against the origin', async () => {
    const { auditDir, pagesDir } = await makeTempAuditDir('scan-site-attempts-');
    vi.mocked(runRenderedAnalysis).mockImplementation(
      async (_browser, url) => ({ url, checkOutcomes: everyPageCheck() }) as never,
    );
    vi.mocked(checkLlmsTxt).mockResolvedValue({ found: false, fetchError: 'HTTP 404' } as never);
    vi.mocked(checkSecurityHeaders).mockResolvedValue({ fetched: true } as never);

    await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: pagesDir,
      auditDir,
      writePagesAsScanned: true,
      concurrency: 1,
      fullAuditPlanning: true,
      scopeDigest,
    });

    const home = readPageScanJson(pagesDir, startUrl)!;
    expect(
      home.acquisitionAttempts!.find((attempt) => attempt.checkId === 'lighthouse'),
    ).toMatchObject({
      outcome: 'succeeded',
      target: { kind: 'performance', url: startUrl, performanceProfile: 'lab-run-1' },
    });
    const siteAttempts = JSON.parse(
      await fs.readFile(path.join(auditDir, 'evidence', 'site-acquisition-attempts.json'), 'utf8'),
    ) as Array<{ checkId: string; outcome: string; target: unknown }>;
    // A 404 llms.txt is the site's answer, so it is usable evidence.
    expect(siteAttempts.find((attempt) => attempt.checkId === 'llms-txt-check')).toMatchObject({
      outcome: 'succeeded',
      target: { kind: 'site', origin: 'https://example.com' },
    });
    expect(siteAttempts.map((attempt) => attempt.checkId).sort()).toEqual(
      ['accessibility-statement', 'cookie-consent', 'llms-txt-check', 'security-headers'].sort(),
    );
  });
});

describe('scanSite mobile surfaces (plan 059 step 10)', () => {
  const pageA = `${startUrl}a`;
  const scopeDigest = `sha256:${'b'.repeat(64)}`;
  const everyPageCheck = () => ({
    'render-diff': 'completed',
    axe: 'completed',
    'mentions-legales': 'not-applicable',
    'transactional-flow-evidence': 'completed',
    'transactional-flow-redirect-checks': 'completed',
    'transactional-flow-ambiguities': 'completed',
    'head-metadata': 'completed',
    'canonical-target': 'not-applicable',
    'mixed-content': 'completed',
    'keyboard-navigation': 'completed',
    'form-error-handling': 'completed',
    'video-captions': 'completed',
    'placeholder-labels': 'completed',
    'alt-text': 'completed',
    'nap-consistency': 'not-applicable',
    reflow: 'completed',
    'html-validity': 'completed',
    'structured-data': 'completed',
  });
  const mobileRecordFor = (url: string, links: string[]) => ({
    surface: mobileSurface({
      evidenceEpoch: 1,
      pageIdentity: url,
      userAgent: 'OdysseusBot/1.0 (+https://odysseusaudit.com/bot)',
      crawlerUserAgent: 'OdysseusBot/1.0 (+https://odysseusaudit.com/bot)',
      readinessOutcome: 'ready',
    }),
    readiness: {
      navigationMilestone: 'load',
      httpStatus: 200,
      domReady: true,
      fontsReady: true,
      networkQuiet: true,
      mutationQuiescent: true,
      significantResourceFailures: [],
      outcome: 'ready',
    } satisfies RenderedReadinessObservation,
    axeViolations: [{ ruleId: 'target-size', impact: 'serious', nodeCount: 2 }],
    uaVerified: true,
    links,
  });

  beforeEach(() => {
    vi.mocked(crawlSite).mockResolvedValue({
      startUrl,
      pages: [
        {
          url: startUrl,
          depth: 0,
          status: 'visited',
          discoveryMethod: 'link',
          auditProfile: {
            url: startUrl,
            profileVersion: 'v1',
            roleSignals: [{ kind: 'homepage-url', detail: startUrl }],
          },
        },
        {
          url: pageA,
          depth: 1,
          status: 'visited',
          discoveryMethod: 'link',
          auditProfile: { url: pageA, profileVersion: 'v1', roleSignals: [] },
        },
      ],
      effectiveDelayMs: 0,
      visitedCount: 2,
      maxPages: 10,
      maxDepth: 5,
      robotsTxtFound: true,
      robotsDisallowMatches: [],
      aiCrawlerBlocks: [],
      linkDiscoveredUrls: [pageA],
    } as never);
    vi.mocked(runRenderedAnalysis).mockImplementation(async (_browser, url) => ({
      url,
      checkOutcomes: everyPageCheck(),
    }));
    vi.mocked(runLighthouseAnalysis).mockResolvedValue({
      lighthouse: { categories: {} } as never,
    });
  });

  it('runs the mobile surface after the baseline capture of the same page, in lane order', async () => {
    const order: string[] = [];
    vi.mocked(runRenderedAnalysis).mockImplementation(async (_browser, url) => {
      order.push(`baseline:${url}`);
      return { url, checkOutcomes: everyPageCheck() } as never;
    });
    vi.mocked(runMobileSurfaceAnalysis).mockImplementation(async (_browser, url) => {
      order.push(`mobile:${url}`);
      return mobileRecordFor(url, [`${url}mobile-only`] as string[]) as never;
    });

    const result = await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 1,
      fullAuditPlanning: true,
      skipLighthouse: true,
      scopeDigest,
    });

    expect(order).toEqual([
      `baseline:${startUrl}`,
      `mobile:${startUrl}`,
      `baseline:${pageA}`,
      `mobile:${pageA}`,
    ]);
    for (const url of [startUrl, pageA]) {
      const page = result.pages.find((candidate) => candidate.url === url)!;
      expect(page.mobileSurface?.uaVerified).toBe(true);
      expect(page.mobileSurface?.axeViolations).toEqual([
        { ruleId: 'target-size', impact: 'serious', nodeCount: 2 },
      ]);
      expect(page.surfaces?.map((surface) => surface.surfaceId)).toEqual([
        page.mobileSurface!.surface.surfaceId,
      ]);
      expect(page.surfaceLinks).toEqual([
        {
          url: `${url}mobile-only`,
          source: 'rendered-link',
          surfaceId: page.mobileSurface!.surface.surfaceId,
        },
      ]);
    }
  });

  it('never runs the mobile surface outside the Plan 059 scoped path', async () => {
    vi.mocked(runMobileSurfaceAnalysis).mockResolvedValue(mobileRecordFor(startUrl, []) as never);
    await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 2,
      fullAuditPlanning: true,
      skipLighthouse: true,
    });
    expect(runMobileSurfaceAnalysis).not.toHaveBeenCalled();
  });

  it('persists the mobile surface, its surface record and its discovered links on scan.json', async () => {
    const { auditDir, pagesDir } = await makeTempAuditDir('scan-site-mobile-');
    vi.mocked(runMobileSurfaceAnalysis).mockImplementation(
      async (_browser, url) => mobileRecordFor(url, [`${url}mobile-only`]) as never,
    );

    await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: pagesDir,
      auditDir,
      writePagesAsScanned: true,
      concurrency: 1,
      fullAuditPlanning: true,
      skipLighthouse: true,
      scopeDigest,
    });

    const home = readPageScanJson(pagesDir, startUrl)!;
    expect(home.mobileSurface?.surface.hasTouch).toBe(true);
    expect(home.surfaces).toHaveLength(1);
    expect(home.surfaceLinks).toEqual([
      {
        url: `${startUrl}mobile-only`,
        source: 'rendered-link',
        surfaceId: home.mobileSurface!.surface.surfaceId,
      },
    ]);
  });

  it('discloses a refused mobile surface instead of impersonating when the identity cannot be proven', async () => {
    const { SurfaceIdentityError } = await import('./evidence-surfaces.js');
    vi.mocked(runMobileSurfaceAnalysis).mockRejectedValue(
      new SurfaceIdentityError(
        'mobileSurface: the mobile surface must keep the published crawler user agent.',
      ),
    );

    const result = await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 1,
      fullAuditPlanning: true,
      skipLighthouse: true,
      scopeDigest,
    });

    const home = result.pages.find((candidate) => candidate.url === startUrl)!;
    expect(home.mobileSurface).toBeUndefined();
    expect(home.surfaceLimitations).toEqual([
      expect.objectContaining({ code: 'mobile-ua-identity-refused' }),
    ]);
  });

  it('records a crashed mobile pass as a disclosed scanner limitation, never as site evidence', async () => {
    vi.mocked(runMobileSurfaceAnalysis).mockRejectedValue(new Error('browser context died'));

    const result = await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 1,
      fullAuditPlanning: true,
      skipLighthouse: true,
      scopeDigest,
    });

    const home = result.pages.find((candidate) => candidate.url === startUrl)!;
    expect(home.mobileSurface).toBeUndefined();
    expect(home.surfaceLimitations).toEqual([
      expect.objectContaining({
        code: 'mobile-surface-unavailable',
        detail: 'browser context died',
      }),
    ]);
    // The page's baseline evidence is untouched by the surface failure
    // (checkOutcomes live on the analysis coverage in the in-memory path).
    expect(result.analysisCoverageByUrl?.get(startUrl)?.passes.rendered).toEqual({
      outcome: 'completed',
    });
  });
});

describe('withPageWatchdog', () => {
  it('resolves work normally when it settles before the deadline', async () => {
    const result: RenderedAnalysisResult = { url: 'https://example.test/', checkOutcomes: {} };
    const guard = createPageWorkGuard();
    const closeAllSpy = vi.spyOn(guard, 'closeAll');

    const outcome = await withPageWatchdog(
      'https://example.test/',
      Promise.resolve(result),
      1000,
      guard,
    );

    expect(outcome).toBe(result);
    expect(closeAllSpy).not.toHaveBeenCalled();
  });

  it('force-closes the guard and returns a synthesized failure once the deadline fires', async () => {
    // Issue #200: a work promise that never settles must not leave its
    // tracked contexts open forever - the watchdog has to force-close
    // them itself once it gives up waiting.
    const guard = createPageWorkGuard();
    const closeAllSpy = vi.spyOn(guard, 'closeAll');
    const neverSettles = new Promise<RenderedAnalysisResult>(() => {});

    const outcome = await withPageWatchdog('https://example.test/', neverSettles, 20, guard);

    expect(closeAllSpy).toHaveBeenCalledTimes(1);
    expect(outcome.url).toBe('https://example.test/');
    expect(outcome.checkOutcomes).toEqual({});
    expect(outcome.renderDiffError).toMatch(/watchdog/);
  });

  it('never surfaces an unhandled rejection once the abandoned work later rejects', async () => {
    // The forced close above typically makes the abandoned promise reject
    // shortly after the deadline branch has already resolved; that later
    // rejection must be swallowed, not thrown into the process.
    let rejectWork: (error: Error) => void = () => {};
    const work = new Promise<RenderedAnalysisResult>((_resolve, reject) => {
      rejectWork = reject;
    });

    const outcome = await withPageWatchdog('https://example.test/', work, 10);
    expect(outcome.renderDiffError).toMatch(/watchdog/);

    rejectWork(new Error('target closed'));
    // Let the swallowed .catch() run; a failure here would show up as an
    // unhandled rejection in the test run rather than a normal assertion.
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});
