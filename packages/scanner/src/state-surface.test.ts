import { describe, expect, it, vi } from 'vitest';
import type { Browser, Page } from 'playwright';
import { runConsentSurfaceAnalysis, runLocalStateExploration } from './state-surface.js';
import type { AxeResults } from './axe.js';

/** DOM-summary shape collectStateControlCandidates extracts. */
interface FakeSummary {
  selector: string;
  tag: string;
  role: string | null;
  type: string | null;
  identityTokens: string[];
  insideForm: boolean;
  isNavigation: boolean;
  controlsId: string | null;
  controlsIdExists: boolean;
}

const summary = (overrides: Partial<FakeSummary> = {}): FakeSummary => ({
  selector: '#cmp .cmp-reject-all',
  tag: 'button',
  role: null,
  type: 'button',
  identityTokens: ['cmp', 'cmp-reject-all'],
  insideForm: false,
  isNavigation: false,
  controlsId: null,
  controlsIdExists: false,
  ...overrides,
});

const detailsSummary = (nth: number): FakeSummary => ({
  selector: `main > details:nth-of-type(${nth})`,
  tag: 'details',
  role: null,
  type: null,
  identityTokens: [],
  insideForm: false,
  isNavigation: false,
  controlsId: null,
  controlsIdExists: false,
});

interface FakePageSpec {
  consentSummaries?: FakeSummary[];
  localSummaries?: FakeSummary[];
  hrefs?: string[];
  visibleAfterClick?: boolean;
  navigatingSelector?: string;
  dismissRejects?: boolean;
}

function makeFakeBrowser(spec: FakePageSpec = {}): {
  browser: Browser;
  contextOptions: Record<string, unknown>[];
  clicked: string[];
  pageUrl: () => string;
} {
  const contextOptions: Record<string, unknown>[] = [];
  const clicked: string[] = [];
  let currentUrl = 'https://example.com/';
  const context = {
    setDefaultTimeout: () => {},
    setDefaultNavigationTimeout: () => {},
    newPage: async () => {
      const makeLocator = (selector: string) => {
        const locator = {
          first: () => locator,
          click: async () => {
            clicked.push(selector);
            if (spec.navigatingSelector === selector) currentUrl = 'https://example.com/left';
          },
          isVisible: async () => spec.visibleAfterClick ?? false,
          evaluate: async (fn: (el: unknown) => unknown) =>
            fn({ open: clicked.includes(selector) }),
          getAttribute: async (name: string) =>
            name === 'aria-expanded' ? (clicked.includes(selector) ? 'true' : 'false') : null,
        };
        return locator;
      };
      return {
        listeners: {} as Record<string, (...args: never[]) => void>,
        on: (event: string, handler: (...args: never[]) => void) => {
          if (event === 'dialog') {
            handler({
              dismiss: async () => {
                if (spec.dismissRejects)
                  throw new Error('Target page, context or browser has been closed');
              },
            } as never);
          }
        },
        goto: async () => ({ status: () => 200 }),
        waitForLoadState: async () => {},
        waitForTimeout: async () => {},
        url: () => currentUrl,
        evaluate: async (fn: (...args: unknown[]) => unknown, _arg?: unknown) => {
          const source = fn.toString();
          if (source.includes('querySelectorAll')) {
            return {
              consent: spec.consentSummaries ?? [],
              localState: spec.localSummaries ?? [],
              containerRef: (spec.consentSummaries?.length ?? 0) > 0 ? '#cmp' : null,
            };
          }
          // observeRenderedReadiness passes the quiet window.
          return { domReady: true, fontsReady: true, mutationQuiescent: true };
        },
        $$eval: async (_selector: string, fn: (anchors: unknown[]) => unknown) =>
          fn(
            (spec.hrefs ?? []).map((href) => ({
              getAttribute: (name: string) => (name === 'href' ? href : null),
            })),
          ),
        locator: makeLocator,
        close: async () => {},
      } as unknown as Page;
    },
    close: async () => {},
  };
  return {
    browser: {
      newContext: async (options: Record<string, unknown>) => {
        contextOptions.push(options);
        return context;
      },
    } as unknown as Browser,
    contextOptions,
    clicked,
    pageUrl: () => currentUrl,
  };
}

const baseOptions = {
  evidenceEpoch: 1,
  timeoutMs: 5_000,
  axeAnalyze: vi.fn(async () => ({ violations: [] }) as unknown as AxeResults),
};

describe('runConsentSurfaceAnalysis', () => {
  it('clicks the one safe reject control, verifies dismissal and audits the underlying page', async () => {
    const { browser, clicked, contextOptions } = makeFakeBrowser({
      consentSummaries: [summary()],
      hrefs: ['/chambres', '/spa'],
    });
    const outcome = await runConsentSurfaceAnalysis(browser, 'https://example.com/', {
      ...baseOptions,
      axeAnalyze: async () =>
        ({
          violations: [{ id: 'button-name', impact: 'critical', nodes: [{}] }],
        }) as unknown as AxeResults,
    });

    expect(clicked).toEqual(['#cmp .cmp-reject-all']);
    expect(outcome.dismissed).toBe(true);
    expect(outcome.surface?.interactionState).toBe('consent-rejected');
    expect(outcome.surface?.hasTouch).toBe(false);
    expect(outcome.baseline.state).toBe('consent-controls-detected');
    expect(outcome.axeViolations).toEqual([
      { ruleId: 'button-name', impact: 'critical', nodeCount: 1 },
    ]);
    expect(outcome.links).toEqual(['https://example.com/chambres', 'https://example.com/spa']);
    expect(outcome.transition).toMatchObject({
      controlKey: expect.any(String),
      matchedPattern: 'cmp-reject-all',
    });
    // Storage-fresh desktop context under the run's identity, closed after.
    expect(contextOptions[0]?.hasTouch).toBe(false);
  });

  it('swallows a dialog dismissal that rejects because the context already closed', async () => {
    const { browser } = makeFakeBrowser({ consentSummaries: [summary()], dismissRejects: true });
    const outcome = await runConsentSurfaceAnalysis(browser, 'https://example.com/', baseOptions);
    // Vitest fails the run on an unhandled rejection; reaching here with a
    // settled outcome is the assertion.
    await new Promise((resolve) => setImmediate(resolve));
    expect(outcome.dismissed).toBeDefined();
  });

  it('never clicks when two CMP controls match: ambiguous is recorded, not guessed', async () => {
    const { browser, clicked } = makeFakeBrowser({
      consentSummaries: [
        summary(),
        summary({
          selector: '#onetrust .onetrust-reject-all-handler',
          identityTokens: ['onetrust', 'onetrust-reject-all-handler'],
        }),
      ],
    });
    const outcome = await runConsentSurfaceAnalysis(browser, 'https://example.com/', baseOptions);

    expect(clicked).toEqual([]);
    expect(outcome.dismissed).toBe(false);
    expect(outcome.surface).toBeUndefined();
    expect(outcome.limitation?.code).toBe('consent-interaction-ambiguous');
    expect(outcome.baseline.state).toBe('consent-controls-detected');
  });

  it('never clicks a reject control that could take a submission path', async () => {
    const { browser, clicked } = makeFakeBrowser({
      consentSummaries: [summary({ insideForm: true })],
    });
    const outcome = await runConsentSurfaceAnalysis(browser, 'https://example.com/', baseOptions);

    expect(clicked).toEqual([]);
    expect(outcome.surface).toBeUndefined();
    expect(outcome.limitation?.code).toBe('consent-interaction-unsafe');
  });

  it('aborts through the side-effect guard when the click navigates', async () => {
    const { browser } = makeFakeBrowser({
      consentSummaries: [summary()],
      navigatingSelector: '#cmp .cmp-reject-all',
    });
    const outcome = await runConsentSurfaceAnalysis(browser, 'https://example.com/', baseOptions);

    expect(outcome.dismissed).toBe(false);
    expect(outcome.transition?.abortedBySideEffectGuard).toBe(true);
    expect(outcome.surface?.readinessOutcome).toBe('blocked');
    expect(outcome.axeViolations).toEqual([]);
  });

  it('records the no-banner case without a surface and without clicking', async () => {
    const { browser, clicked } = makeFakeBrowser({ consentSummaries: [] });
    const outcome = await runConsentSurfaceAnalysis(browser, 'https://example.com/', baseOptions);

    expect(clicked).toEqual([]);
    expect(outcome.baseline.state).toBe('no-consent-controls');
    expect(outcome.surface).toBeUndefined();
    expect(outcome.limitation).toBeUndefined();
  });
});

describe('runLocalStateExploration', () => {
  it('toggles disclosures open and records every transition with links', async () => {
    const { browser, clicked } = makeFakeBrowser({
      localSummaries: [detailsSummary(1), detailsSummary(2)],
      hrefs: ['/after-toggle'],
    });
    // The runner takes a page, not a browser: grab the fake context's page.
    const page = await extractPage(browser);
    const record = await runLocalStateExploration(page, {});

    expect(clicked).toEqual(['main > details:nth-of-type(1)', 'main > details:nth-of-type(2)']);
    expect(record.transitions).toHaveLength(2);
    expect(record.transitions[0]).toMatchObject({
      kind: 'details',
      before: 'closed',
      after: 'open',
    });
    expect(record.links).toEqual(['https://example.com/after-toggle']);
    expect(record.guardAborted).toBeUndefined();
  });

  it('stops at the first side-effect violation and records the aborted transition', async () => {
    const { browser, clicked } = makeFakeBrowser({
      localSummaries: [detailsSummary(1), detailsSummary(2)],
      navigatingSelector: 'main > details:nth-of-type(1)',
    });
    const page = await extractPage(browser);
    const record = await runLocalStateExploration(page, {});

    expect(clicked).toEqual(['main > details:nth-of-type(1)']);
    expect(record.transitions).toHaveLength(1);
    expect(record.transitions[0]?.abortedBySideEffectGuard).toBe(true);
    expect(record.guardAborted).toBe(true);
  });

  it('is bounded by the per-page budget', async () => {
    const { browser, clicked } = makeFakeBrowser({
      localSummaries: Array.from({ length: 12 }, (_, index) => detailsSummary(index + 1)),
    });
    const page = await extractPage(browser);
    await runLocalStateExploration(page, {});

    expect(clicked).toHaveLength(8);
  });
});

/** Pulls the fake context's single page out of the fake browser. */
async function extractPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({});
  return context.newPage();
}
