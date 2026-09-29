import { describe, expect, it, vi } from 'vitest';
import type { Browser, Page } from 'playwright';
import { ODYSSEUS_USER_AGENT } from './browser.js';
import {
  MOBILE_SURFACE_PROFILE,
  MOBILE_UA_NEGOTIATION_LIMITATION,
  buildScanSurface,
  mobileSurface,
  SurfaceIdentityError,
} from './evidence-surfaces.js';
import {
  runMobileSurfaceAnalysis,
  summarizeAxeViolations,
  type MobileSurfaceRecord,
} from './mobile-surface.js';
import type { AxeResults } from './axe.js';

const CRAWLER_UA = ODYSSEUS_USER_AGENT;

describe('mobileSurface identity contract', () => {
  it('builds a mobile-profile surface that keeps the published crawler identity', () => {
    const surface = mobileSurface({
      evidenceEpoch: 1,
      pageIdentity: 'https://example.com/',
      userAgent: CRAWLER_UA,
      crawlerUserAgent: CRAWLER_UA,
      readinessOutcome: 'ready',
    });

    expect(surface.viewport).toEqual(MOBILE_SURFACE_PROFILE.viewport);
    expect(surface.deviceScaleFactor).toBe(MOBILE_SURFACE_PROFILE.deviceScaleFactor);
    expect(surface.hasTouch).toBe(true);
    expect(surface.userAgent).toBe(CRAWLER_UA);
    expect(surface.interactionState).toBe('baseline');
    expect(surface.storageIsolationGroup).toBe('fresh-context-per-page');
    expect(surface.surfaceId).toMatch(/^surface:/);
  });

  it('refuses to build the surface when the run user agent differs from the published one', () => {
    // Plan 059 section 3.8 / section 22: impersonating a mobile browser is a
    // rejected alternative, so the refusal must happen before any navigation.
    expect(() =>
      mobileSurface({
        evidenceEpoch: 1,
        pageIdentity: 'https://example.com/',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        crawlerUserAgent: CRAWLER_UA,
        readinessOutcome: 'ready',
      }),
    ).toThrow(SurfaceIdentityError);
  });

  it('gives the mobile surface a distinct identity from the desktop baseline of the same page', () => {
    const desktop = buildScanSurface({
      evidenceEpoch: 1,
      pageIdentity: 'https://example.com/',
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      hasTouch: false,
      media: { colorScheme: 'light', reducedMotion: 'no-preference' },
      userAgent: CRAWLER_UA,
      interactionState: 'baseline',
      storageIsolationGroup: 'fresh-context-per-page',
      readinessOutcome: 'ready',
    });
    const mobile = mobileSurface({
      evidenceEpoch: 1,
      pageIdentity: 'https://example.com/',
      userAgent: CRAWLER_UA,
      crawlerUserAgent: CRAWLER_UA,
      readinessOutcome: 'ready',
    });
    expect(mobile.surfaceId).not.toBe(desktop.surfaceId);
  });

  it('states the UA-negotiated-variant limitation in both languages', () => {
    expect(MOBILE_UA_NEGOTIATION_LIMITATION.code).toBe('mobile-ua-negotiated-variant-untested');
    expect(MOBILE_UA_NEGOTIATION_LIMITATION.fr).toMatch(/user-agent/);
    expect(MOBILE_UA_NEGOTIATION_LIMITATION.en).toMatch(/user agent/);
  });
});

describe('summarizeAxeViolations', () => {
  it('keeps a mobile-only defect as a bounded, identifying summary', () => {
    const axe = {
      violations: [
        {
          id: 'target-size',
          impact: 'serious',
          nodes: [{ html: '<a></a>' }, { html: '<button></button>' }, { html: '<span></span>' }],
        },
        {
          id: 'button-name',
          impact: 'critical',
          nodes: [{ html: '<button></button>' }],
        },
      ],
    } as unknown as AxeResults;

    expect(summarizeAxeViolations(axe)).toEqual([
      { ruleId: 'button-name', impact: 'critical', nodeCount: 1 },
      { ruleId: 'target-size', impact: 'serious', nodeCount: 3 },
    ]);
  });

  it('maps a clean mobile rendering to no violations', () => {
    expect(summarizeAxeViolations({ violations: [] } as unknown as AxeResults)).toEqual([]);
  });
});

/** Offline runner harness: a fake browser whose single context records the
 *  options it was created with, and whose page answers readiness, identity
 *  and anchor reads without any network. */
interface FakePageSpec {
  userAgentSeen?: string;
  hrefs?: string[];
  ready?: boolean;
}

function makeFakeBrowser(spec: FakePageSpec = {}): {
  browser: Browser;
  contextOptions: Record<string, unknown>[];
  closed: boolean[];
} {
  const contextOptions: Record<string, unknown>[] = [];
  const closed: boolean[] = [];
  const context = {
    setDefaultTimeout: () => {},
    setDefaultNavigationTimeout: () => {},
    newPage: async () => {
      const page = {
        listeners: {} as Record<string, (...args: never[]) => void>,
        on: (event: string, handler: (...args: never[]) => void) => {
          page.listeners[event] = handler;
        },
        goto: async () => ({ status: () => 200 }),
        waitForLoadState: async () => {},
        url: () => 'https://example.com/',
        // observeRenderedReadiness passes the quiet window (arity 1); the
        // identity probe takes no arguments (arity 0).
        evaluate: async (fn: (...args: unknown[]) => unknown) =>
          fn.length === 1
            ? { domReady: spec.ready ?? true, fontsReady: true, mutationQuiescent: true }
            : (spec.userAgentSeen ?? CRAWLER_UA),
        $$eval: async (
          _selector: string,
          fn: (anchors: unknown[], arg?: unknown) => unknown,
          arg?: unknown,
        ) =>
          fn(
            (spec.hrefs ?? []).map((href) => ({
              getAttribute: (name: string) => (name === 'href' ? href : null),
              matches: () => false,
              textContent: null,
            })),
            arg,
          ),
        close: async () => {},
      };
      return page as unknown as Page;
    },
    close: async () => {
      closed.push(true);
    },
  };
  return {
    browser: {
      newContext: async (options: Record<string, unknown>) => {
        contextOptions.push(options);
        return context;
      },
    } as unknown as Browser,
    contextOptions,
    closed,
  };
}

const baseOptions = {
  evidenceEpoch: 1,
  timeoutMs: 5_000,
  axeAnalyze: vi.fn(async () => ({ violations: [] }) as unknown as AxeResults),
};

describe('runMobileSurfaceAnalysis', () => {
  it('renders the page in the mobile profile with the crawler identity on the wire', async () => {
    const { browser, contextOptions, closed } = makeFakeBrowser();
    const record = await runMobileSurfaceAnalysis(browser, 'https://example.com/', {
      ...baseOptions,
    });

    expect(contextOptions[0]).toMatchObject({
      userAgent: CRAWLER_UA,
      viewport: MOBILE_SURFACE_PROFILE.viewport,
      deviceScaleFactor: MOBILE_SURFACE_PROFILE.deviceScaleFactor,
      hasTouch: true,
      colorScheme: 'light',
      reducedMotion: 'no-preference',
    });
    expect(record.uaVerified).toBe(true);
    expect(record.surface.readinessOutcome).toBe('ready');
    expect(record.readiness.outcome).toBe('ready');
    expect(record.axeViolations).toEqual([]);
    // The surface runs in a storage-fresh context that is closed afterwards.
    expect(closed).toEqual([true]);
  });

  it('summarizes a mobile-only axe defect on the surface record', async () => {
    const { browser } = makeFakeBrowser();
    const record = await runMobileSurfaceAnalysis(browser, 'https://example.com/', {
      ...baseOptions,
      axeAnalyze: async () =>
        ({
          violations: [{ id: 'target-size', impact: 'serious', nodes: [{}, {}] }],
        }) as unknown as AxeResults,
    });

    expect(record.axeViolations).toEqual([
      { ruleId: 'target-size', impact: 'serious', nodeCount: 2 },
    ]);
  });

  it('records a blocked surface, not a ready one, when the page does not observe the crawler identity', async () => {
    const { browser } = makeFakeBrowser({ userAgentSeen: 'SomeOtherBot/9.9' });
    const record = await runMobileSurfaceAnalysis(browser, 'https://example.com/', {
      ...baseOptions,
    });

    expect(record.uaVerified).toBe(false);
    expect(record.surface.readinessOutcome).toBe('blocked');
  });

  it('keeps only same-origin normalized anchors, dropping offsite and non-HTML links', async () => {
    const { browser } = makeFakeBrowser({
      hrefs: [
        '/chambres',
        'https://example.com/spa/',
        'https://booking.example.com/property',
        'mailto:hotel@example.com',
        '/menu.pdf',
      ],
    });
    const record = await runMobileSurfaceAnalysis(browser, 'https://example.com/', {
      ...baseOptions,
    });

    expect(record.links).toEqual([
      { url: 'https://example.com/chambres' },
      { url: 'https://example.com/spa' },
    ]);
  });

  it('survives an axe failure as a recorded gap on an otherwise complete record', async () => {
    const { browser } = makeFakeBrowser();
    const record = await runMobileSurfaceAnalysis(browser, 'https://example.com/', {
      ...baseOptions,
      axeAnalyze: async () => {
        throw new Error('axe injection refused');
      },
    });

    expect(record.axeError).toBe('axe injection refused');
    expect(record.surface.readinessOutcome).toBe('ready');
  });

  it('paces its navigation through the caller-provided hook', async () => {
    const { browser } = makeFakeBrowser();
    const beforeNavigation = vi.fn(async () => {});
    await runMobileSurfaceAnalysis(browser, 'https://example.com/', {
      ...baseOptions,
      beforeNavigation,
    });

    expect(beforeNavigation).toHaveBeenCalledOnce();
  });

  it('refuses to run at all when the configured user agent is not the published one', async () => {
    const { browser, contextOptions } = makeFakeBrowser();
    await expect(
      runMobileSurfaceAnalysis(browser, 'https://example.com/', {
        ...baseOptions,
        userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile',
      }),
    ).rejects.toThrow(SurfaceIdentityError);
    // No context was ever opened: the refusal precedes any navigation.
    expect(contextOptions).toHaveLength(0);
  });
});

describe('mobile surface record shape', () => {
  it('carries every field the evidence graph and inventory need', async () => {
    const { browser } = makeFakeBrowser({ hrefs: ['/rooms'] });
    const record: MobileSurfaceRecord = await runMobileSurfaceAnalysis(
      browser,
      'https://example.com/',
      { ...baseOptions },
    );

    expect(Object.keys(record).sort()).toEqual([
      'axeViolations',
      'links',
      'readiness',
      'surface',
      'uaVerified',
    ]);
  });
});
