import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from 'playwright';
import {
  crawlSite,
  isNonHtmlContentType,
  isSameSiteHostname,
  type CrawlProgressEvent,
} from './crawl.js';

describe('isNonHtmlContentType', () => {
  it('treats a missing Content-Type as HTML', () => {
    expect(isNonHtmlContentType(undefined)).toBe(false);
  });

  it('treats text/html, including with a charset, as HTML', () => {
    expect(isNonHtmlContentType('text/html')).toBe(false);
    expect(isNonHtmlContentType('text/html; charset=utf-8')).toBe(false);
  });

  it('flags an image Content-Type as non-HTML', () => {
    expect(isNonHtmlContentType('image/jpeg')).toBe(true);
  });

  it('flags a PDF Content-Type as non-HTML', () => {
    expect(isNonHtmlContentType('application/pdf')).toBe(true);
  });
});

describe('isSameSiteHostname', () => {
  it('treats an exact hostname match as the same site', () => {
    expect(isSameSiteHostname('lacoorniche.com', 'lacoorniche.com')).toBe(true);
  });

  it('treats a www prefix difference either direction as the same site', () => {
    expect(isSameSiteHostname('www.lacoorniche.com', 'lacoorniche.com')).toBe(true);
    expect(isSameSiteHostname('lacoorniche.com', 'www.lacoorniche.com')).toBe(true);
  });

  it('rejects a genuinely different domain, even one that shares a substring', () => {
    // Real case: haaitza.com/carte-cadeaux forwards to a third-party
    // booking platform on a completely different domain.
    expect(isSameSiteHostname('haaitza.com', 'haaitza-lacoorniche.diadabox.fr')).toBe(false);
  });

  it('rejects a social platform landing', () => {
    expect(isSameSiteHostname('client.example', 'facebook.com')).toBe(false);
  });

  it('rejects a subdomain that is not a www prefix', () => {
    expect(isSameSiteHostname('client.example', 'shop.client.example')).toBe(false);
  });
});

/** Plan 021 Step 6 wiring tests: the continuation-family guard inside the
 *  real crawlSite loop, exercised against a fake Playwright browser. No
 *  real network: global fetch serves robots.txt (and the sitemap where a
 *  test needs one), and each fake page runs crawl.ts's own $$eval anchor
 *  callback against synthetic anchor descriptors, so the per-anchor
 *  extraction under test is the production code itself. The profile
 *  extraction throws in this mock (no DOM), which exercises the crawl's
 *  empty-facts fallback; no source page therefore qualifies as a confirmed
 *  listing here, so the query-key-family basis stays inactive by design -
 *  it is fully covered in continuation-guard.test.ts. */

interface FakeAnchorSpec {
  href: string | null;
  rel?: string;
  paginationControl?: boolean;
}

function fakeAnchorElement(spec: FakeAnchorSpec): Record<string, unknown> {
  return {
    getAttribute: (name: string): string | null => {
      if (name === 'href') return spec.href;
      if (name === 'rel') return spec.rel ?? null;
      return null;
    },
    matches: (selector: string): boolean =>
      spec.paginationControl === true && selector.includes('pagination'),
    textContent: spec.paginationControl === true ? '2' : null,
  };
}

function makeFakeBrowser(anchorsFor: (url: string) => FakeAnchorSpec[]): Browser {
  const context = {
    setDefaultTimeout: () => {},
    setDefaultNavigationTimeout: () => {},
    newPage: async () => {
      let currentUrl = 'about:blank';
      return {
        goto: async (url: string) => {
          currentUrl = url;
          return {
            status: () => 200,
            headers: () => ({ 'content-type': 'text/html; charset=utf-8' }),
          };
        },
        url: () => currentUrl,
        $$eval: async (_selector: string, fn: (elements: unknown[]) => unknown) =>
          fn(anchorsFor(currentUrl).map(fakeAnchorElement)),
        evaluate: async () => {
          throw new Error('no DOM in unit mock');
        },
        close: async () => {},
      };
    },
    close: async () => {},
  };
  return { newContext: async () => context } as unknown as Browser;
}

function installFetchStub(routes: Record<string, string>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = routes[url];
      if (body === undefined) throw new Error(`unexpected fetch in test: ${url}`);
      return new Response(body, { status: 200 });
    }),
  );
}

const ROBOTS_BODY = 'User-agent: *\nAllow: /\n';

/** A rel=next chain: the homepage links to /page/1/, each /page/k/ links
 *  to /page/k+1/ (raw hrefs keep the trailing slash a real site would
 *  have; normalizePageUrl strips it during discovery). */
function relNextChain(pageCount: number): (url: string) => FakeAnchorSpec[] {
  return (url) => {
    if (url === 'https://example.com/') return [{ href: '/page/1/', rel: 'next' }];
    const match = url.match(/\/page\/(\d+)\/?$/);
    if (match === null) return [];
    const next = Number(match[1]) + 1;
    if (next > pageCount) return [];
    return [{ href: `/page/${next}/`, rel: 'next' }];
  };
}

describe('crawlSite continuation-family guard wiring', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('truncates a rel=next chain the moment the family threshold is crossed', async () => {
    installFetchStub({ 'https://example.com/robots.txt': ROBOTS_BODY });
    const result = await crawlSite('https://example.com', {
      browser: makeFakeBrowser(relNextChain(64)),
      maxPages: 200,
      maxDepth: 100,
      delayMs: 0,
    });

    // Homepage + the 60 admitted chain members. Omitting /page/61/ also
    // ends discovery (page 62 is only linked from page 61), so exactly one
    // omission occurs and the frontier is cut, not sprayed.
    expect(result.visitedCount).toBe(61);
    const summary = result.continuationGuardSummary;
    expect(summary).toBeDefined();
    expect(summary!.guardVersion).toBe('v1');
    expect(summary!.familyMaxEnqueued).toBe(60);
    expect(summary!.families).toHaveLength(1);
    const family = summary!.families[0]!;
    expect(family.familyKey).toBe('path:/page/{n}');
    expect(family.basis).toBe('rel-next');
    expect(family.enqueuedCount).toBe(60);
    expect(family.omittedCount).toBe(1);
    expect(family.omittedExampleUrls).toEqual(['https://example.com/page/61']);
    expect(summary!.totalOmittedUrlCount).toBe(1);
    // Discovered-but-omitted URLs keep their discovery bookkeeping.
    expect(result.linkDiscoveredUrls).toContain('https://example.com/page/61');
    expect(result.pages.find((page) => page.url === 'https://example.com/page/61')).toBeUndefined();
    expect(result.pages.find((page) => page.url === 'https://example.com/page/60')).toBeDefined();
  });

  it('omits exactly the pagination targets past the threshold when one listing links them all', async () => {
    installFetchStub({ 'https://example.com/robots.txt': ROBOTS_BODY });
    const progress: CrawlProgressEvent[] = [];
    // The archive-index shape: one listing page whose pagination nav links
    // /page/1/ through /page/64/ at once, so all 64 are discovered (and
    // counted) from a single source page.
    const anchorsFor: (url: string) => FakeAnchorSpec[] = (url) => {
      if (url !== 'https://example.com/') return [];
      return Array.from({ length: 64 }, (_, i) => ({
        href: `/page/${i + 1}/`,
        paginationControl: true,
      }));
    };
    const result = await crawlSite('https://example.com', {
      browser: makeFakeBrowser(anchorsFor),
      maxPages: 200,
      maxDepth: 100,
      delayMs: 0,
      onProgress: (event) => progress.push(event),
    });

    expect(result.visitedCount).toBe(61);
    const summary = result.continuationGuardSummary;
    expect(summary).toBeDefined();
    expect(summary!.families).toHaveLength(1);
    const family = summary!.families[0]!;
    expect(family.familyKey).toBe('path:/page/{n}');
    expect(family.basis).toBe('numbered-pagination-control');
    expect(family.enqueuedCount).toBe(60);
    expect(family.omittedCount).toBe(4);
    expect(family.omittedExampleUrls).toEqual([
      'https://example.com/page/61',
      'https://example.com/page/62',
      'https://example.com/page/63',
    ]);
    expect(summary!.totalOmittedUrlCount).toBe(4);
    expect(progress.at(-1)).toEqual({
      type: 'continuation-guard',
      omittedUrlCount: 4,
      omittedFamilyCount: 1,
    });
  });

  it('never governs ordinary content links, even in the hundreds', async () => {
    installFetchStub({ 'https://example.com/robots.txt': ROBOTS_BODY });
    const anchorsFor: (url: string) => FakeAnchorSpec[] = (url) => {
      if (url !== 'https://example.com/') return [];
      return Array.from({ length: 100 }, (_, i) => ({ href: `/article-${i + 1}` }));
    };
    const result = await crawlSite('https://example.com', {
      browser: makeFakeBrowser(anchorsFor),
      maxPages: 3,
      maxDepth: 100,
      delayMs: 0,
    });

    expect(result.continuationGuardSummary).toBeUndefined();
    expect(result.visitedCount).toBe(3);
    const discoveredArticles = result.linkDiscoveredUrls.filter((url) =>
      url.startsWith('https://example.com/article-'),
    );
    expect(discoveredArticles).toHaveLength(100);
  });

  it('never truncates a finite pagination chain below the threshold', async () => {
    installFetchStub({ 'https://example.com/robots.txt': ROBOTS_BODY });
    const result = await crawlSite('https://example.com', {
      browser: makeFakeBrowser(relNextChain(10)),
      maxPages: 200,
      maxDepth: 100,
      delayMs: 0,
    });

    expect(result.visitedCount).toBe(11);
    expect(result.continuationGuardSummary).toBeUndefined();
    expect(result.pages.find((page) => page.url === 'https://example.com/page/10')).toBeDefined();
  });

  it('never omits an operator seed even when it resembles a continuation', async () => {
    installFetchStub({ 'https://example.com/robots.txt': ROBOTS_BODY });
    const result = await crawlSite('https://example.com', {
      browser: makeFakeBrowser(relNextChain(64)),
      maxPages: 200,
      maxDepth: 100,
      delayMs: 0,
      seeds: ['https://example.com/page/999/'],
    });

    // The seed was enqueued directly, never classified, never admitted -
    // so it is visited even though the /page/{n} family is over budget.
    const seedPage = result.pages.find((page) => page.url === 'https://example.com/page/999/');
    expect(seedPage?.status).toBe('visited');
    expect(seedPage?.discoveryMethod).toBe('seed');
    const summary = result.continuationGuardSummary;
    expect(summary).toBeDefined();
    expect(summary!.families[0]!.omittedExampleUrls).not.toContain('https://example.com/page/999/');
  });

  it('never governs an eligible sitemap-declared URL even one resembling a continuation', async () => {
    installFetchStub({
      'https://example.com/robots.txt': `User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n`,
      'https://example.com/sitemap.xml': [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url><loc>https://example.com/</loc></url>',
        '  <url><loc>https://example.com/page/500/</loc></url>',
        '</urlset>',
      ].join('\n'),
    });
    const result = await crawlSite('https://example.com', {
      browser: makeFakeBrowser(() => []),
      maxPages: 200,
      maxDepth: 100,
      delayMs: 0,
      sitemapMode: 'supplement',
    });

    const sitemapPage = result.pages.find((page) => page.url === 'https://example.com/page/500');
    expect(sitemapPage?.status).toBe('visited');
    expect(sitemapPage?.discoveryMethod).toBe('sitemap-only');
    // Nothing was link-discovered past the threshold, so there is no guard
    // summary at all - absent means nothing was omitted.
    expect(result.continuationGuardSummary).toBeUndefined();
  });
});
