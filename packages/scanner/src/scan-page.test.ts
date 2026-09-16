import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./render-diff.js', () => ({ renderDiff: vi.fn() }));
vi.mock('./axe.js', () => ({ runAxe: vi.fn() }));
vi.mock('./lighthouse-isolated.js', () => ({ runLighthouseIsolated: vi.fn() }));
vi.mock('./checks/mentions-legales.js', () => ({ extractMentionsLegales: vi.fn() }));
vi.mock('./checks/transactional-flow.js', () => ({
  detectTransactionalFlow: vi.fn(async () => []),
  findDelegatedBookingRedirectChecks: vi.fn(async () => []),
}));
vi.mock('./checks/head-metadata.js', () => ({
  extractHeadMetadata: vi.fn(async () => ({ canonicalUrls: [], jsonLdBlocks: [] })),
}));
vi.mock('./checks/canonical-target.js', () => ({ checkCanonicalTarget: vi.fn() }));
vi.mock('./checks/mixed-content.js', () => ({
  extractMixedContentResources: vi.fn(async () => ({ resources: [] })),
}));
vi.mock('./checks/keyboard-navigation.js', () => ({
  walkKeyboardNavigation: vi.fn(async () => ({ stops: [] })),
}));
vi.mock('./checks/form-error-handling.js', () => ({
  checkFormErrorHandling: vi.fn(async () => ({ forms: [] })),
}));
vi.mock('./checks/video-captions.js', () => ({
  checkVideoCaptions: vi.fn(async () => ({ videos: [] })),
}));
vi.mock('./checks/placeholder-labels.js', () => ({
  checkPlaceholderLabels: vi.fn(async () => ({ controls: [] })),
}));
vi.mock('./checks/alt-text.js', () => ({
  extractAltTextFacts: vi.fn(async () => ({ images: [] })),
}));
vi.mock('./checks/nap-consistency.js', () => ({ checkNapConsistency: vi.fn() }));
vi.mock('./checks/reflow.js', () => ({ checkReflow: vi.fn() }));
vi.mock('./checks/html-validity.js', () => ({ checkHtmlValidity: vi.fn() }));
vi.mock('./checks/structured-data.js', () => ({ checkStructuredData: vi.fn() }));
vi.mock('./checks/rendered-cost-profile.js', () => ({
  recordRenderedResourceTotals: vi.fn(() => async () => ({
    resourceCount: 4,
    knownTransferBytes: 1000,
    unknownTransferSizeCount: 0,
  })),
  extractRenderedDomCostFacts: vi.fn(async () => ({ domNodeCount: 42, imageCount: 3 })),
}));
vi.mock('./config.js', () => ({ getPageTimeoutMs: vi.fn(() => 30_000) }));

import { runAxe } from './axe.js';
import { runLighthouseIsolated } from './lighthouse-isolated.js';
import { renderDiff } from './render-diff.js';
import { extractMentionsLegales } from './checks/mentions-legales.js';
import { scanPage, runRenderedAnalysis, runLighthouseAnalysis } from './scan-page.js';

const page = { evaluate: vi.fn(async () => 'SIREN 732829320') };
const browser = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runAxe).mockResolvedValue({ violations: [] } as never);
  vi.mocked(runLighthouseIsolated).mockResolvedValue({ lhr: {} } as never);
  vi.mocked(extractMentionsLegales).mockReturnValue({ siren: '732829320' } as never);
  vi.mocked(renderDiff).mockImplementation(async (_browser, _url, options) => {
    await options.onRenderedPage?.(page as never);
    return { rawTextLength: 1, renderedTextLength: 2 } as never;
  });
});

describe('scanPage characterization', () => {
  it('captures scanner failures independently and preserves completed results', async () => {
    vi.mocked(runAxe).mockRejectedValueOnce(new Error('axe failed'));
    vi.mocked(runLighthouseIsolated).mockRejectedValueOnce(new Error('lighthouse failed'));

    const result = await scanPage(browser, 9222, 'https://example.com/', {
      screenshotDir: '/tmp/pages',
    });

    expect(result.renderDiff).toBeDefined();
    expect(result.axeError).toBe('axe failed');
    expect(result.lighthouseError).toBe('lighthouse failed');
    expect(result.headMetadata).toBeDefined();
  });

  it('attaches site checks only to the homepage and gates legal extraction by URL', async () => {
    const sitemapCheck = { available: true, crawledUrls: [], discoveredUrls: [] } as never;
    const home = await scanPage(browser, 9222, 'https://example.com/', {
      screenshotDir: '/tmp/pages',
      homepageUrl: 'https://example.com/',
      mentionsLegalesUrl: 'https://example.com/legal',
      sitemapCheck,
      llmsTxtCheck: { available: false } as never,
      skipLighthouse: true,
    });
    expect(home.sitemapCheck).toMatchObject({ pageUrl: 'https://example.com/' });
    expect(home.llmsTxtCheck).toBeDefined();
    expect(home.mentionsLegales).toBeUndefined();

    const legal = await scanPage(browser, 9222, 'https://example.com/legal', {
      screenshotDir: '/tmp/pages',
      homepageUrl: 'https://example.com/',
      mentionsLegalesUrl: 'https://example.com/legal',
      sitemapCheck,
      skipLighthouse: true,
    });
    expect(legal.sitemapCheck).toBeUndefined();
    expect(legal.mentionsLegales).toMatchObject({ siren: '732829320' });
    expect(runLighthouseIsolated).not.toHaveBeenCalled();
  });

  it('attaches the checked-page list to the mentions-legales extraction result (plan 036)', async () => {
    const legal = await scanPage(browser, 9222, 'https://example.com/legal', {
      screenshotDir: '/tmp/pages',
      homepageUrl: 'https://example.com/',
      mentionsLegalesUrl: 'https://example.com/legal',
      mentionsLegalesSearchedUrls: ['https://example.com/', 'https://example.com/legal'],
      mentionsLegalesHomepageFallback: false,
      skipLighthouse: true,
    });
    expect(legal.mentionsLegales?.checkedPages).toEqual({
      resolvedUrl: 'https://example.com/legal',
      homepageFallback: false,
      searchedUrls: ['https://example.com/', 'https://example.com/legal'],
    });

    const fallback = await scanPage(browser, 9222, 'https://example.com/', {
      screenshotDir: '/tmp/pages',
      homepageUrl: 'https://example.com/',
      mentionsLegalesUrl: 'https://example.com/',
      skipLighthouse: true,
    });
    expect(fallback.mentionsLegales?.checkedPages).toEqual({
      resolvedUrl: 'https://example.com/',
      homepageFallback: false,
      searchedUrls: [],
    });
  });

  it('applies the pre-Lighthouse delay only when Lighthouse runs', async () => {
    vi.useFakeTimers();
    const pending = scanPage(browser, 9222, 'https://example.com/', {
      screenshotDir: '/tmp/pages',
      delayMs: 250,
    });
    await vi.advanceTimersByTimeAsync(249);
    expect(runLighthouseIsolated).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(runLighthouseIsolated).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe('runRenderedAnalysis', () => {
  it('populates checkOutcomes for every applicable and not-applicable check, and composes the cost profile', async () => {
    vi.mocked(renderDiff).mockImplementation(async (_browser, _url, options) => {
      await options.onRenderedPageCreated?.(page as never);
      await options.onRenderedPage?.(page as never);
      return { rawTextLength: 1, renderedTextLength: 2 } as never;
    });

    const result = await runRenderedAnalysis({} as never, 'https://example.com/', {
      screenshotDir: '/tmp/pages',
    });

    expect(result.checkOutcomes.axe).toBe('completed');
    expect(result.checkOutcomes['render-diff']).toBe('completed');
    expect(result.checkOutcomes['mentions-legales']).toBe('not-applicable');
    expect(result.checkOutcomes['sitemap-check']).toBe('not-applicable');
    expect(result.checkOutcomes['canonical-target']).toBe('not-applicable');
    expect(result.renderedCostProfile).toMatchObject({
      url: 'https://example.com/',
      domNodeCount: 42,
      imageCount: 3,
      resourceCount: 4,
      knownTransferBytes: 1000,
      unknownTransferSizeCount: 0,
    });
    expect(result).not.toHaveProperty('lighthouse');
  });

  it('marks every rendered-hook check not-applicable when the render diff navigation itself fails', async () => {
    vi.mocked(renderDiff).mockRejectedValueOnce(new Error('navigation failed'));

    const result = await runRenderedAnalysis({} as never, 'https://example.com/', {
      screenshotDir: '/tmp/pages',
    });

    expect(result.checkOutcomes['render-diff']).toBe('failed');
    expect(result.checkOutcomes.axe).toBe('not-applicable');
    expect(result.renderDiffError).toBe('navigation failed');
  });

  it('marks a per-check failure as failed in checkOutcomes without losing the others', async () => {
    vi.mocked(renderDiff).mockImplementation(async (_browser, _url, options) => {
      await options.onRenderedPage?.(page as never);
      return { rawTextLength: 1, renderedTextLength: 2 } as never;
    });
    vi.mocked(runAxe).mockRejectedValueOnce(new Error('axe failed'));

    const result = await runRenderedAnalysis({} as never, 'https://example.com/', {
      screenshotDir: '/tmp/pages',
    });

    expect(result.checkOutcomes.axe).toBe('failed');
    expect(result.axeError).toBe('axe failed');
    expect(result.checkOutcomes['head-metadata']).toBe('completed');
  });
});

describe('runLighthouseAnalysis', () => {
  it('applies the delay before calling Lighthouse and returns the result', async () => {
    vi.useFakeTimers();
    const pending = runLighthouseAnalysis('https://example.com/', 9222, { delayMs: 100 });
    await vi.advanceTimersByTimeAsync(99);
    expect(runLighthouseIsolated).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(runLighthouseIsolated).toHaveBeenCalledOnce();
    expect(result.lighthouse).toBeDefined();
    vi.useRealTimers();
  });

  it('returns lighthouseError instead of throwing', async () => {
    vi.mocked(runLighthouseIsolated).mockRejectedValueOnce(new Error('lighthouse failed'));
    const result = await runLighthouseAnalysis('https://example.com/', 9222, {});
    expect(result.lighthouseError).toBe('lighthouse failed');
    expect(result.lighthouse).toBeUndefined();
  });
});
