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
vi.mock('./state-surface.js', () => ({
  observeBaselineConsentState: vi.fn(),
  runConsentSurfaceAnalysis: vi.fn(),
  runLocalStateExploration: vi.fn(),
}));
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
import { runConsentSurfaceAnalysis, runLocalStateExploration } from './state-surface.js';
import { consentSurface } from './evidence-surfaces.js';
import { checkLlmsTxt } from './checks/llms-txt.js';
import { checkSecurityHeaders } from './checks/security-headers.js';
import { checkCookieConsent } from './checks/cookie-consent.js';
import { scanSite, withPageWatchdog, type ScanProgressEvent } from './scan-site.js';
import { readPageScanJson } from './artifacts/page-scan-io.js';
import { createPageWorkGuard } from './page-work-guard.js';
import { mobileSurface } from './evidence-surfaces.js';
import type { RenderedAnalysisResult } from './scan-page.js';
import type { RenderedReadinessObservation } from './page-readiness.js';
import { InventoryLedger } from './inventory-ledger.js';
import { buildRobotsPolicySnapshot, type RobotsPolicySnapshot } from './robots-policy-snapshot.js';
import { PUBLIC_SITE_NETWORK_POLICY } from './network-target-policy.js';
import { HostRequestScheduler } from './host-request-scheduler.js';
import type { HydrationSweepRecord } from './hydration-sweep.js';

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
  const pageC = `${startUrl}c`;
  const scopeDigest = `sha256:${'e'.repeat(64)}`;

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

  it('skips mobile and consent surfaces on family-sampled pages and records the plan omission', async () => {
    vi.mocked(crawlSite).mockResolvedValue({
      startUrl,
      pages: [
        withProfile(startUrl, [{ kind: 'homepage-url', detail: startUrl }]),
        withProfile(pageA, [{ kind: 'content-json-ld-type', detail: 'Article' }], 'family-1'),
        withProfile(pageB, [{ kind: 'content-json-ld-type', detail: 'Article' }], 'family-1'),
        withProfile(pageC, [{ kind: 'content-json-ld-type', detail: 'Article' }], 'family-1'),
      ],
      effectiveDelayMs: 0,
      visitedCount: 4,
      maxPages: 10,
      maxDepth: 2,
      robotsTxtFound: true,
      robotsDisallowMatches: [],
      aiCrawlerBlocks: [],
      linkDiscoveredUrls: [pageA, pageB, pageC],
    } as never);
    vi.mocked(runRenderedAnalysis).mockImplementation(
      async (_browser, url) =>
        ({
          url,
          checkOutcomes: { 'render-diff': 'completed', axe: 'completed' },
          ...(url === pageC
            ? { consentBaseline: { state: 'consent-controls-detected', controlCount: 2 } }
            : {}),
        }) as never,
    );
    vi.mocked(runMobileSurfaceAnalysis).mockImplementation(
      async (_browser, url) =>
        ({
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
          },
          axeViolations: [],
          uaVerified: true,
          links: [],
        }) as never,
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

    const sampledOut = result.pages.find((page) => page.url === pageC)!;
    expect(vi.mocked(runMobileSurfaceAnalysis).mock.calls.map(([, url]) => url)).not.toContain(
      pageC,
    );
    expect(vi.mocked(runConsentSurfaceAnalysis).mock.calls.map(([, url]) => url)).not.toContain(
      pageC,
    );
    expect(sampledOut.mobileSurface).toBeUndefined();
    expect(sampledOut.surfaceSkipped).toBe('family-sampled');
    expect(sampledOut.plannedOutOfScopeSurfaceIds).toHaveLength(2);
    expect(result.fullAuditPlan?.surfaceSampling.find((sample) => sample.url === pageC)).toEqual({
      url: pageC,
      selected: false,
      reason: 'family-sampled',
    });
    expect(result.analysisCoverageByUrl?.get(pageC)?.surfaceSample).toEqual({
      selected: false,
      reason: 'family-sampled',
    });
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
    expect(events.filter((event) => event.type.startsWith('content-scan'))).toMatchObject([
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
    expect(events.filter((event) => event.type.startsWith('lighthouse'))).toMatchObject([
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
    vi.mocked(runRenderedAnalysis).mockImplementation(
      async (_browser, url) =>
        ({
          url,
          checkOutcomes: everyPageCheck(),
        }) as never,
    );
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
      // No links discovered here: this test pins lane ordering, not the
      // discovery fixed point (covered by the step 11 tests).
      return mobileRecordFor(url, []) as never;
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
      async (_browser, url) =>
        // Only the crawl's own pages discover a mobile-only link, so the
        // discovery fixed point converges after one bounded wave.
        mobileRecordFor(
          url,
          url === startUrl || url === pageA ? [`${url}mobile-only`] : [],
        ) as never,
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

describe('scanSite hydration sweep and discovery waves (plan 059 step 11)', () => {
  const scopeDigest = `sha256:${'c'.repeat(64)}`;
  const crawlerUa = 'OdysseusBot/1.0 (+https://odysseusaudit.com/bot)';

  const hydrationSweep = (links: string[]): HydrationSweepRecord => ({
    startScrollHeight: 800,
    endScrollHeight: 1600,
    startDomNodeCount: 200,
    endDomNodeCount: 400,
    startResourceCount: 10,
    endResourceCount: 10,
    steps: 3,
    quiescent: true,
    continuedExpansionAtBound: false,
    progress: 'bounded-expansion',
    discoveredLinks: links,
  });

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

  const initialCrawl = (overrides: Record<string, unknown> = {}) => {
    const ledger = new InventoryLedger({ evidenceEpoch: 1, scopeDigest });
    ledger.recordDiscovery({ url: startUrl, source: 'start', discoveredAt: new Date() });
    return {
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
      ],
      effectiveDelayMs: 0,
      visitedCount: 1,
      maxPages: 10,
      maxDepth: 5,
      robotsTxtFound: true,
      robotsPolicyChain: [
        buildRobotsPolicySnapshot({
          evidenceEpoch: 1,
          revision: 0,
          origin: 'https://example.com',
          userAgent: crawlerUa,
          robotsText: 'User-agent: *\nAllow: /',
          retrievedAt: new Date(),
          rules: { found: true, disallow: [], allow: ['/'], sitemapUrls: [] },
          configuredDelayMs: 0,
        }),
      ],
      inventoryLedger: ledger.snapshot(),
      robotsDisallowMatches: [],
      aiCrawlerBlocks: [],
      linkDiscoveredUrls: [],
      ...overrides,
    } as never;
  };

  beforeEach(() => {
    vi.mocked(crawlSite).mockReset();
    vi.mocked(runLighthouseAnalysis).mockResolvedValue({
      lighthouse: { categories: {} } as never,
    });
  });

  const scan = async () =>
    scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 2,
      fullAuditPlanning: true,
      skipLighthouse: true,
      scopeDigest,
    });

  it('scans a hydrated-only link and enters it in the inventory with provenance', async () => {
    vi.mocked(crawlSite).mockResolvedValue(initialCrawl());
    vi.mocked(runRenderedAnalysis).mockImplementation(
      async (_browser, url) =>
        ({
          url,
          checkOutcomes: everyPageCheck(),
          readiness: {
            navigationMilestone: 'load',
            httpStatus: 200,
            domReady: true,
            fontsReady: true,
            networkQuiet: true,
            mutationQuiescent: true,
            significantResourceFailures: [],
            outcome: 'ready',
            hydrationProgress: 'bounded-expansion',
          },
          hydrationSweep: hydrationSweep(
            url === startUrl ? ['https://example.com/hydrated-only'] : [],
          ),
        }) as never,
    );

    const result = await scan();

    const scannedUrls = vi.mocked(runRenderedAnalysis).mock.calls.map((call) => call[1]);
    expect(scannedUrls).toEqual([startUrl, 'https://example.com/hydrated-only']);
    const candidate = result.inventoryLedger?.candidates.find(
      (entry) => entry.url === 'https://example.com/hydrated-only',
    );
    expect(candidate?.discoveries).toHaveLength(1);
    expect(candidate?.discoveries[0]).toMatchObject({
      source: 'hydrated-link',
      referrer: startUrl,
    });
    expect(candidate?.discoveries[0]?.surfaceId).toMatch(/^surface:/);
    expect(candidate?.disposition?.disposition).toBe('scanned');
    // The page that ran the sweep keeps real hydration readiness.
    const home = result.pages.find((page) => page.url === startUrl);
    expect(home?.readiness?.hydrationProgress).toBe('bounded-expansion');
  });

  it('recovers a visited page missing from an older inventory checkpoint', async () => {
    const recoveredUrl = 'https://example.com/recovered-from-checkpoint';
    vi.mocked(crawlSite).mockResolvedValue(
      initialCrawl({
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
            url: recoveredUrl,
            depth: 1,
            status: 'visited',
            discoveryMethod: 'link',
            auditProfile: {
              url: recoveredUrl,
              profileVersion: 'v1',
              roleSignals: [{ kind: 'homepage-url', detail: recoveredUrl }],
            },
          },
        ],
        visitedCount: 2,
      }),
    );
    vi.mocked(runRenderedAnalysis).mockImplementation(
      async (_browser, url) =>
        ({
          url,
          checkOutcomes: everyPageCheck(),
          hydrationSweep: hydrationSweep([]),
        }) as never,
    );

    const result = await scan();

    const candidate = result.inventoryLedger?.candidates.find(
      (entry) => entry.url === recoveredUrl,
    );
    expect(candidate?.discoveries).toEqual([
      expect.objectContaining({ source: 'visited-page-recovery' }),
    ]);
    expect(candidate?.disposition?.disposition).toBe('scanned');
  });

  it('inventories a depth-bound hydrated link instead of scanning it', async () => {
    vi.mocked(crawlSite).mockResolvedValue(initialCrawl({ maxDepth: 0 }));
    vi.mocked(runRenderedAnalysis).mockImplementation(
      async (_browser, url) =>
        ({
          url,
          checkOutcomes: everyPageCheck(),
          hydrationSweep: hydrationSweep(
            url === startUrl ? ['https://example.com/below-the-bound'] : [],
          ),
        }) as never,
    );

    const result = await scan();

    expect(vi.mocked(runRenderedAnalysis).mock.calls.map((call) => call[1])).toEqual([startUrl]);
    const candidate = result.inventoryLedger?.candidates.find(
      (entry) => entry.url === 'https://example.com/below-the-bound',
    );
    expect(candidate?.disposition?.disposition).toBe('depth-bound');
  });

  it('keeps the page cap truthful for hydrated links and disposes the surplus', async () => {
    vi.mocked(crawlSite).mockResolvedValue(initialCrawl({ maxPages: 1 }));
    vi.mocked(runRenderedAnalysis).mockImplementation(
      async (_browser, url) =>
        ({
          url,
          checkOutcomes: everyPageCheck(),
          hydrationSweep: hydrationSweep(
            url === startUrl
              ? ['https://example.com/would-fit', 'https://example.com/never-scanned']
              : [],
          ),
        }) as never,
    );

    const result = await scan();

    expect(vi.mocked(runRenderedAnalysis).mock.calls.map((call) => call[1])).toEqual([startUrl]);
    const dispositionOf = (url: string) =>
      result.inventoryLedger?.candidates.find((entry) => entry.url === url)?.disposition
        ?.disposition;
    expect(dispositionOf('https://example.com/would-fit')).toBe('page-cap');
    expect(dispositionOf('https://example.com/never-scanned')).toBe('page-cap');
  });

  it('honors the robots policy for a hydrated link', async () => {
    const disallowingChain: RobotsPolicySnapshot[] = [
      buildRobotsPolicySnapshot({
        evidenceEpoch: 1,
        revision: 0,
        origin: 'https://example.com',
        userAgent: crawlerUa,
        robotsText: 'User-agent: *\nDisallow: /admin',
        retrievedAt: new Date(),
        rules: { found: true, disallow: ['/admin'], allow: [], sitemapUrls: [] },
        configuredDelayMs: 0,
      }),
    ];
    vi.mocked(crawlSite).mockResolvedValue(initialCrawl({ robotsPolicyChain: disallowingChain }));
    vi.mocked(runRenderedAnalysis).mockImplementation(
      async (_browser, url) =>
        ({
          url,
          checkOutcomes: everyPageCheck(),
          hydrationSweep: hydrationSweep(
            url === startUrl ? ['https://example.com/admin/secret'] : [],
          ),
        }) as never,
    );

    const result = await scan();

    expect(vi.mocked(runRenderedAnalysis).mock.calls.map((call) => call[1])).toEqual([startUrl]);
    const candidate = result.inventoryLedger?.candidates.find(
      (entry) => entry.url === 'https://example.com/admin/secret',
    );
    expect(candidate?.disposition?.disposition).toBe('robots');
  });

  it('disposes a private-address hydrated link as network-unsafe, never scans it', async () => {
    vi.mocked(crawlSite).mockResolvedValue(initialCrawl());
    vi.mocked(runRenderedAnalysis).mockImplementation(
      async (_browser, url) =>
        ({
          url,
          checkOutcomes: everyPageCheck(),
          hydrationSweep: hydrationSweep(
            url === startUrl ? ['http://127.0.0.1:8080/metadata'] : [],
          ),
        }) as never,
    );

    const result = await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 1,
      fullAuditPlanning: true,
      skipLighthouse: true,
      scopeDigest,
      networkPolicy: PUBLIC_SITE_NETWORK_POLICY,
    });

    expect(vi.mocked(runRenderedAnalysis).mock.calls.map((call) => call[1])).toEqual([startUrl]);
    const candidate = result.inventoryLedger?.candidates.find(
      (entry) => entry.url === 'http://127.0.0.1:8080/metadata',
    );
    expect(candidate?.disposition?.disposition).toBe('network-safety');
  });

  it('reaches the fixed point when a wave discovers nothing new', async () => {
    vi.mocked(crawlSite).mockResolvedValue(initialCrawl());
    vi.mocked(runRenderedAnalysis).mockImplementation(
      async (_browser, url) =>
        ({
          url,
          checkOutcomes: everyPageCheck(),
          hydrationSweep: hydrationSweep(
            url === startUrl ? ['https://example.com/terminal-link'] : [],
          ),
        }) as never,
    );

    const result = await scan();

    expect(
      vi
        .mocked(runRenderedAnalysis)
        .mock.calls.map((call) => call[1])
        .sort(),
    ).toEqual([startUrl, 'https://example.com/terminal-link'].sort());
    const candidate = result.inventoryLedger?.candidates.find(
      (entry) => entry.url === 'https://example.com/terminal-link',
    );
    expect(candidate?.disposition?.disposition).toBe('scanned');
    expect(result.inventoryLedger?.candidates.every((entry) => entry.disposition)).toBe(true);
  });

  it('bounds cascading discovery at the wave budget and discloses the bound', async () => {
    vi.mocked(crawlSite).mockResolvedValue(initialCrawl());
    vi.mocked(runRenderedAnalysis).mockImplementation(async (_browser, url) => {
      const match = url.match(/cascade-(\d+)/);
      const next = match === null ? 1 : Number(match[1]) + 1;
      return {
        url,
        checkOutcomes: everyPageCheck(),
        hydrationSweep: hydrationSweep(
          match !== null && Number(match[1]) >= 4 ? [] : [`https://example.com/cascade-${next}`],
        ),
      } as never;
    });

    const result = await scan();

    const dispositionOf = (url: string) =>
      result.inventoryLedger?.candidates.find((entry) => entry.url === url)?.disposition
        ?.disposition;
    // Three waves are admitted and scanned; the fourth-level link the last
    // wave discovered is bounded, disclosed, never silently dropped.
    expect(dispositionOf('https://example.com/cascade-1')).toBe('scanned');
    expect(dispositionOf('https://example.com/cascade-2')).toBe('scanned');
    expect(dispositionOf('https://example.com/cascade-3')).toBe('scanned');
    expect(dispositionOf('https://example.com/cascade-4')).toBe('continuation-guard');
    // Every scanned wave page is listed with the crawl's pages, which is
    // what the manifest is written from; the bounded one is not.
    const listed = result.crawl.pages.filter((page) => page.url.includes('cascade-'));
    expect(listed.map((page) => [page.url, page.depth, page.status])).toEqual([
      ['https://example.com/cascade-1', 1, 'visited'],
      ['https://example.com/cascade-2', 2, 'visited'],
      ['https://example.com/cascade-3', 3, 'visited'],
    ]);
    expect(
      vi
        .mocked(runRenderedAnalysis)
        .mock.calls.some((call) => call[1] === 'https://example.com/cascade-4'),
    ).toBe(false);
  });

  it('persists the sweep and real hydration readiness on scan.json', async () => {
    const { auditDir, pagesDir } = await makeTempAuditDir('scan-site-hydration-');
    vi.mocked(crawlSite).mockResolvedValue(initialCrawl());
    vi.mocked(runRenderedAnalysis).mockImplementation(
      async (_browser, url) =>
        ({
          url,
          checkOutcomes: everyPageCheck(),
          readiness: {
            navigationMilestone: 'load',
            httpStatus: 200,
            domReady: true,
            fontsReady: true,
            networkQuiet: true,
            mutationQuiescent: true,
            significantResourceFailures: [],
            outcome: 'ready',
            hydrationProgress: 'bounded-expansion',
          },
          hydrationSweep: hydrationSweep([]),
        }) as never,
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
    expect(home.hydrationSweep?.progress).toBe('bounded-expansion');
    expect(home.readiness?.hydrationProgress).toBe('bounded-expansion');
  });
});

describe('scanSite consent and local-state surfaces (plan 059 step 13)', () => {
  const scopeDigest = `sha256:${'d'.repeat(64)}`;
  const crawlerUa = 'OdysseusBot/1.0 (+https://odysseusaudit.com/bot)';

  const singlePageCrawl = () => {
    const ledger = new InventoryLedger({ evidenceEpoch: 1, scopeDigest });
    ledger.recordDiscovery({ url: startUrl, source: 'start', discoveredAt: new Date() });
    return {
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
      ],
      effectiveDelayMs: 0,
      visitedCount: 1,
      maxPages: 10,
      maxDepth: 5,
      robotsTxtFound: true,
      inventoryLedger: ledger.snapshot(),
      robotsDisallowMatches: [],
      aiCrawlerBlocks: [],
      linkDiscoveredUrls: [],
    } as never;
  };

  beforeEach(() => {
    vi.mocked(crawlSite).mockReset();
    vi.mocked(crawlSite).mockResolvedValue(singlePageCrawl());
    vi.mocked(runRenderedAnalysis).mockImplementation(async (_browser, url) => ({
      url,
      checkOutcomes: { 'render-diff': 'completed', axe: 'completed' },
    }));
    vi.mocked(runLighthouseAnalysis).mockResolvedValue({
      lighthouse: { categories: {} } as never,
    });
    // The mobile pass runs on this path too; give it a bounded, link-free
    // record so these tests pin consent/local-state behavior only.
    vi.mocked(runMobileSurfaceAnalysis).mockReset();
    vi.mocked(runMobileSurfaceAnalysis).mockImplementation(async (_browser, url) => ({
      surface: mobileSurface({
        evidenceEpoch: 1,
        pageIdentity: url,
        userAgent: crawlerUa,
        crawlerUserAgent: crawlerUa,
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
      },
      axeViolations: [],
      uaVerified: true,
      links: [],
    }));
  });

  const scan = () =>
    scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 1,
      fullAuditPlanning: true,
      skipLighthouse: true,
      scopeDigest,
    });

  it('runs the consent-rejected surface where the delivered baseline carries consent controls', async () => {
    const surface = consentSurface({
      evidenceEpoch: 1,
      pageIdentity: startUrl,
      userAgent: crawlerUa,
    });
    // The baseline observation is produced inside the real
    // runRenderedAnalysis; the mock carries its result directly. Only the
    // crawl's own page carries a delivered banner, so the wave converges.
    vi.mocked(runRenderedAnalysis).mockImplementation(async (_browser, url) => ({
      url,
      checkOutcomes: { 'render-diff': 'completed', axe: 'completed' },
      ...(url === startUrl
        ? {
            consentBaseline: {
              state: 'consent-controls-detected',
              controlCount: 2,
              containerRef: '#cmp',
            },
          }
        : {}),
    }));
    vi.mocked(runConsentSurfaceAnalysis).mockResolvedValue({
      surface,
      baseline: { state: 'consent-controls-detected', controlCount: 2, containerRef: '#cmp' },
      dismissed: true,
      axeViolations: [{ ruleId: 'target-size', impact: 'serious', nodeCount: 1 }],
      links: ['https://example.com/post-consent'],
      transition: { controlKey: 'control:abcd', matchedPattern: 'cmp-reject-all' },
    } as never);
    vi.mocked(runLocalStateExploration).mockResolvedValue({ transitions: [], links: [] });

    const result = await scan();

    const home = result.pages.find((page) => page.url === startUrl)!;
    expect(runConsentSurfaceAnalysis).toHaveBeenCalledOnce();
    expect(home.consentSurface?.dismissed).toBe(true);
    expect(home.surfaces?.map((candidate) => candidate.interactionState)).toContain(
      'consent-rejected',
    );
    expect(home.surfaceLinks).toEqual([
      {
        url: 'https://example.com/post-consent',
        source: 'rendered-link',
        surfaceId: surface.surfaceId,
      },
    ]);
    // The post-consent link enters the inventory with the surface provenance.
    const candidate = result.inventoryLedger?.candidates.find(
      (entry) => entry.url === 'https://example.com/post-consent',
    );
    expect(candidate?.discoveries[0]).toMatchObject({
      source: 'rendered-link',
      surfaceId: surface.surfaceId,
    });
    expect(candidate?.disposition?.disposition).toBe('scanned');
  });

  it('spends one request slot per surface navigation, not one for the turn and another for the request', async () => {
    // At a 40-second host delay every extra slot costs 40 seconds a page, so
    // the consent and mobile passes must each pace their single navigation
    // exactly once against the run's scheduler.
    const pace = vi.spyOn(HostRequestScheduler.prototype, 'pace');
    let pacesAfterBaseline = -1;
    let pacesAfterSurfaces = -1;
    vi.mocked(runRenderedAnalysis).mockImplementation(async (_browser, url) => {
      if (pacesAfterBaseline < 0) pacesAfterBaseline = pace.mock.calls.length;
      return {
        url,
        checkOutcomes: { 'render-diff': 'completed', axe: 'completed' },
        consentBaseline: {
          state: 'consent-controls-detected',
          controlCount: 2,
          containerRef: '#cmp',
        },
      };
    });
    vi.mocked(runConsentSurfaceAnalysis).mockImplementation(async (_browser, _url, options) => {
      await options.beforeNavigation?.();
      return {
        baseline: { state: 'consent-controls-detected', controlCount: 2, containerRef: '#cmp' },
        dismissed: true,
        links: [],
      } as never;
    });
    const mobileRecord = vi.mocked(runMobileSurfaceAnalysis).getMockImplementation()!;
    vi.mocked(runMobileSurfaceAnalysis).mockImplementation(async (browser, url, options) => {
      await options.beforeNavigation?.();
      if (pacesAfterSurfaces < 0) pacesAfterSurfaces = pace.mock.calls.length;
      return mobileRecord(browser, url, options);
    });
    vi.mocked(runLocalStateExploration).mockResolvedValue({ transitions: [], links: [] });

    try {
      await scan();
    } finally {
      pace.mockRestore();
    }

    expect(pacesAfterSurfaces - pacesAfterBaseline).toBe(2);
  });

  it('discloses an ambiguous consent overlay instead of guessing, and never runs a surface', async () => {
    vi.mocked(runRenderedAnalysis).mockImplementation(async (_browser, url) => ({
      url,
      checkOutcomes: { 'render-diff': 'completed', axe: 'completed' },
      ...(url === startUrl
        ? {
            consentBaseline: {
              state: 'consent-controls-detected',
              controlCount: 4,
              containerRef: '#cmp',
            },
          }
        : {}),
    }));
    vi.mocked(runConsentSurfaceAnalysis).mockResolvedValue({
      baseline: { state: 'consent-controls-detected', controlCount: 4, containerRef: '#cmp' },
      dismissed: false,
      links: [],
      limitation: {
        code: 'consent-interaction-ambiguous',
        fr: 'fr',
        en: 'en',
        detail: '2 consent controls matched',
      },
    } as never);
    vi.mocked(runLocalStateExploration).mockResolvedValue({ transitions: [], links: [] });

    const result = await scan();

    const home = result.pages.find((page) => page.url === startUrl)!;
    expect(home.consentSurface?.surface).toBeUndefined();
    expect(home.consentSurface?.dismissed).toBe(false);
    expect(home.surfaceLimitations).toEqual([
      expect.objectContaining({ code: 'consent-interaction-ambiguous' }),
    ]);
  });

  it('registers the local-state surface when disclosure exploration ran', async () => {
    // localStates are attached inside the real runRenderedAnalysis; the
    // mock carries them on the crawl's own page only.
    vi.mocked(runRenderedAnalysis).mockImplementation(async (_browser, url) => ({
      url,
      checkOutcomes: { 'render-diff': 'completed', axe: 'completed' },
      ...(url === startUrl
        ? {
            localStates: {
              transitions: [
                {
                  kind: 'details',
                  controlKey: 'control:abcd',
                  selector: 'main > details:nth-of-type(1)',
                  before: 'closed',
                  after: 'open',
                },
              ],
              links: ['https://example.com/accordion-panel-link'],
            },
          }
        : {}),
    }));

    const result = await scan();

    const home = result.pages.find((page) => page.url === startUrl)!;
    expect(home.consentSurface).toBeUndefined();
    expect(home.surfaces?.map((candidate) => candidate.interactionState)).toContain(
      'local-state:disclosures',
    );
    expect(home.surfaceLinks).toEqual([
      {
        url: 'https://example.com/accordion-panel-link',
        source: 'rendered-link',
        surfaceId: home.surfaces![0]!.surfaceId,
      },
    ]);
    // A link visible only in an opened local state is a real page: it is
    // admitted by the fixed point and scanned like any other.
    const candidate = result.inventoryLedger?.candidates.find(
      (entry) => entry.url === 'https://example.com/accordion-panel-link',
    );
    expect(candidate?.discoveries[0]).toMatchObject({
      source: 'rendered-link',
      surfaceId: home.surfaces![0]!.surfaceId,
    });
    expect(candidate?.disposition?.disposition).toBe('scanned');
  });

  it('never runs state surfaces outside the Plan 059 scoped path, even with a delivered banner', async () => {
    vi.mocked(runRenderedAnalysis).mockImplementation(async (_browser, url) => ({
      url,
      checkOutcomes: { 'render-diff': 'completed', axe: 'completed' },
      consentBaseline: { state: 'consent-controls-detected', controlCount: 2 },
    }));
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
      ],
      effectiveDelayMs: 0,
      visitedCount: 1,
      maxPages: 10,
      maxDepth: 5,
      robotsTxtFound: true,
      robotsDisallowMatches: [],
      aiCrawlerBlocks: [],
      linkDiscoveredUrls: [],
    } as never);
    await scanSite(startUrl, {
      browser: {} as never,
      debugPort: 9222,
      screenshotDir: '/tmp/pages',
      concurrency: 1,
      fullAuditPlanning: true,
      skipLighthouse: true,
    });

    expect(runConsentSurfaceAnalysis).not.toHaveBeenCalled();
    expect(runLocalStateExploration).not.toHaveBeenCalled();
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
