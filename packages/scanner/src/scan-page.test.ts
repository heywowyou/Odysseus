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
vi.mock('./checks/alt-text.js', () => ({
  extractAltTextFacts: vi.fn(async () => ({ images: [] })),
}));
vi.mock('./checks/nap-consistency.js', () => ({ checkNapConsistency: vi.fn() }));
vi.mock('./checks/reflow.js', () => ({ checkReflow: vi.fn() }));
vi.mock('./checks/html-validity.js', () => ({ checkHtmlValidity: vi.fn() }));
vi.mock('./checks/structured-data.js', () => ({ checkStructuredData: vi.fn() }));
vi.mock('./config.js', () => ({ getPageTimeoutMs: vi.fn(() => 30_000) }));

import { runAxe } from './axe.js';
import { runLighthouseIsolated } from './lighthouse-isolated.js';
import { renderDiff } from './render-diff.js';
import { extractMentionsLegales } from './checks/mentions-legales.js';
import { scanPage } from './scan-page.js';

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
