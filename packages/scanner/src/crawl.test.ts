import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from 'playwright';
import { ContinuationGuard, CONTINUATION_FAMILY_MAX_ENQUEUED } from './continuation-guard.js';
import {
  crawlSite,
  isNonHtmlContentType,
  isSameSiteHostname,
  restoreCrawlFrontierLoopState,
  type CrawlFrontierSnapshot,
  type CrawlProgressEvent,
} from './crawl.js';
import type { PageAuditProfile } from './page-audit-profile.js';
import type { SitemapCheckResult } from './checks/sitemap.js';

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

function makeFakeBrowser(
  anchorsFor: (url: string) => FakeAnchorSpec[],
  redirects: Record<string, string> = {},
): Browser {
  const context = {
    setDefaultTimeout: () => {},
    setDefaultNavigationTimeout: () => {},
    newPage: async () => {
      let currentUrl = 'about:blank';
      return {
        goto: async (url: string) => {
          currentUrl = redirects[url] ?? url;
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

/** Issue #39 harness: the same fake browser as makeFakeBrowser above, but
 *  each URL can answer its own HTTP status, so the crawl loop's status
 *  assignment is exercised against a real navigation sequence. Anchors are
 *  only read for pages the loop reaches link discovery on, which after the
 *  fix never includes a non-2xx response. */
function makeStatusFakeBrowser(
  statusFor: (url: string) => number,
  anchorsFor: (url: string) => FakeAnchorSpec[] = () => [],
): Browser {
  const context = {
    setDefaultTimeout: () => {},
    setDefaultNavigationTimeout: () => {},
    newPage: async () => {
      let currentUrl = 'about:blank';
      return {
        goto: async (url: string) => {
          currentUrl = url;
          return {
            status: () => statusFor(url),
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
    // Issue #102: the seed's trailing slash is page identity, not part of
    // it, so the visited page is recorded under the bare spelling.
    const seedPage = result.pages.find((page) => page.url === 'https://example.com/page/999');
    expect(seedPage?.status).toBe('visited');
    expect(seedPage?.discoveryMethod).toBe('seed');
    const summary = result.continuationGuardSummary;
    expect(summary).toBeDefined();
    expect(summary!.families[0]!.omittedExampleUrls).not.toContain('https://example.com/page/999');
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

/** Issue #39 (Villas Foch): a real page linked bare domain and mailbox
 *  hrefs without a scheme, the crawler resolved them relative to the
 *  current path, the server answered 404, and those four URLs were then
 *  presented in the delivered report as pages analysed, complete with
 *  findings emitted against them. The crawl fact is real and stays
 *  inventoried; the page status must say so. */
describe('crawlSite robots.txt enforcement', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies a rule that matches the query string', async () => {
    installFetchStub({ 'https://example.com/robots.txt': 'User-agent: *\nDisallow: /*?sort=\n' });
    const result = await crawlSite('https://example.com', {
      browser: makeFakeBrowser((url) =>
        url === 'https://example.com/' ? [{ href: 'https://example.com/rooms?sort=price' }] : [],
      ),
      maxPages: 10,
      maxDepth: 5,
      delayMs: 0,
    });

    const sorted = result.pages.find((page) => page.url.includes('sort=price'));
    expect(sorted?.status).toBe('skipped-robots');
  });

  it('obeys a group written for the published bot name when no user agent is passed', async () => {
    installFetchStub({
      'https://example.com/robots.txt': 'User-agent: OdysseusBot\nDisallow: /\n',
    });
    const result = await crawlSite('https://example.com', {
      browser: makeFakeBrowser(() => []),
      maxPages: 10,
      maxDepth: 5,
      delayMs: 0,
    });

    expect(result.pages.find((page) => page.url === 'https://example.com/')?.status).toBe(
      'skipped-robots',
    );
    expect(result.visitedCount).toBe(0);
  });

  it('skips a page whose redirect lands on a disallowed path', async () => {
    installFetchStub({ 'https://example.com/robots.txt': 'User-agent: *\nDisallow: /private\n' });
    const result = await crawlSite('https://example.com', {
      browser: makeFakeBrowser(
        (url) => (url === 'https://example.com/' ? [{ href: '/old' }] : []),
        { 'https://example.com/old': 'https://example.com/private/new' },
      ),
      maxPages: 10,
      maxDepth: 5,
      delayMs: 0,
    });

    const old = result.pages.find((page) => page.url === 'https://example.com/old');
    expect(old?.status).toBe('skipped-robots');
    expect(old?.httpStatus).toBe(200);
  });
});

describe('crawlSite non-2xx responses (issue #39)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records a 404 as http-error-status with its failure reason, not as visited', async () => {
    installFetchStub({ 'https://example.com/robots.txt': ROBOTS_BODY });
    const result = await crawlSite('https://example.com', {
      browser: makeStatusFakeBrowser(
        (url) => (url === 'https://example.com/back-office/www.staffcom.fr' ? 404 : 200),
        (url) => (url === 'https://example.com/' ? [{ href: '/back-office/www.staffcom.fr' }] : []),
      ),
      maxPages: 10,
      maxDepth: 5,
      delayMs: 0,
    });

    const notFound = result.pages.find(
      (page) => page.url === 'https://example.com/back-office/www.staffcom.fr',
    );
    expect(notFound?.status).toBe('http-error-status');
    expect(notFound?.httpStatus).toBe(404);
    expect(notFound?.discoveredFrom).toBe('https://example.com/');
  });

  it('excludes the 404 from the visited page population and the visitedCount denominator', async () => {
    installFetchStub({ 'https://example.com/robots.txt': ROBOTS_BODY });
    const result = await crawlSite('https://example.com', {
      browser: makeStatusFakeBrowser(
        (url) => (url === 'https://example.com/back-office/bienvenue@villasfoch.fr' ? 404 : 200),
        (url) =>
          url === 'https://example.com/' ? [{ href: '/back-office/bienvenue@villasfoch.fr' }] : [],
      ),
      maxPages: 10,
      maxDepth: 5,
      delayMs: 0,
    });

    expect(result.pages.filter((page) => page.status === 'visited')).toHaveLength(1);
    expect(result.visitedCount).toBe(2);
  });

  it('does not follow links found on a non-2xx page', async () => {
    installFetchStub({ 'https://example.com/robots.txt': ROBOTS_BODY });
    const result = await crawlSite('https://example.com', {
      browser: makeStatusFakeBrowser(
        (url) => (url === 'https://example.com/dead' ? 500 : 200),
        (url) => {
          if (url === 'https://example.com/') return [{ href: '/dead' }];
          if (url === 'https://example.com/dead') return [{ href: '/only-via-dead' }];
          return [];
        },
      ),
      maxPages: 10,
      maxDepth: 5,
      delayMs: 0,
    });

    const dead = result.pages.find((page) => page.url === 'https://example.com/dead');
    expect(dead?.status).toBe('http-error-status');
    expect(dead?.httpStatus).toBe(500);
    expect(
      result.pages.find((page) => page.url === 'https://example.com/only-via-dead'),
    ).toBeUndefined();
    expect(result.linkDiscoveredUrls).not.toContain('https://example.com/only-via-dead');
  });

  it('never hands a 404 mentions-legales URL to the SIREN extraction', async () => {
    installFetchStub({ 'https://example.com/robots.txt': ROBOTS_BODY });
    const result = await crawlSite('https://example.com', {
      browser: makeStatusFakeBrowser(
        (url) => (url === 'https://example.com/mentions-legales' ? 404 : 200),
        (url) => (url === 'https://example.com/' ? [{ href: '/mentions-legales' }] : []),
      ),
      maxPages: 10,
      maxDepth: 5,
      delayMs: 0,
    });

    const notFound = result.pages.find(
      (page) => page.url === 'https://example.com/mentions-legales',
    );
    expect(notFound?.status).toBe('http-error-status');
    expect(result.mentionsLegalesPageUrl).toBeUndefined();
  });

  it('still records a 2xx page as visited', async () => {
    installFetchStub({ 'https://example.com/robots.txt': ROBOTS_BODY });
    const result = await crawlSite('https://example.com', {
      browser: makeStatusFakeBrowser(() => 204),
      maxPages: 10,
      maxDepth: 5,
      delayMs: 0,
    });

    expect(result.pages[0]?.status).toBe('visited');
    expect(result.pages[0]?.httpStatus).toBe(204);
  });
});

/**
 * Issue #102: a trailing-slash spelling of a page is the same page as the
 * bare form. The crawl now applies that identity rule to its own start URL
 * and to operator seeds (discovered links and sitemap entries already had
 * it through normalizePageUrl), so the duplicate variant is never enqueued
 * and never costs a second crawl - a real Briketenia audit content-checked
 * /fr and /fr/ as two pages and counted both in every analyzed-page
 * denominator. The recording fake below proves the prevention at the
 * navigation level, not just in the manifest.
 */
describe('crawlSite trailing-slash page identity (issue #102)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeRecordingFakeBrowser(anchorsFor: (url: string) => FakeAnchorSpec[]): {
    browser: Browser;
    navigated: string[];
  } {
    const navigated: string[] = [];
    const context = {
      setDefaultTimeout: () => {},
      setDefaultNavigationTimeout: () => {},
      newPage: async () => {
        let currentUrl = 'about:blank';
        return {
          goto: async (url: string) => {
            navigated.push(url);
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
    return { browser: { newContext: async () => context } as unknown as Browser, navigated };
  }

  it('never fetches the bare variant of a trailing-slash start URL it links to', async () => {
    installFetchStub({ 'https://example.com/robots.txt': ROBOTS_BODY });
    const { browser, navigated } = makeRecordingFakeBrowser((url) =>
      url === 'https://example.com/hotel' ? [{ href: '/hotel' }, { href: '/chambres' }] : [],
    );
    const result = await crawlSite('https://example.com/hotel/', {
      browser,
      maxPages: 10,
      maxDepth: 5,
      delayMs: 0,
    });

    expect(navigated).toEqual(['https://example.com/hotel', 'https://example.com/chambres']);
    expect(result.startUrl).toBe('https://example.com/hotel');
    expect(result.pages.filter((page) => page.status === 'visited')).toHaveLength(2);
    expect(result.visitedCount).toBe(2);
  });

  it('collapses a trailing-slash seed onto the start page already enqueued', async () => {
    installFetchStub({ 'https://example.com/robots.txt': ROBOTS_BODY });
    const { browser, navigated } = makeRecordingFakeBrowser(() => []);
    const result = await crawlSite('https://example.com/hotel', {
      browser,
      seeds: ['https://example.com/hotel/'],
      maxPages: 10,
      maxDepth: 5,
      delayMs: 0,
    });

    expect(navigated).toEqual(['https://example.com/hotel']);
    expect(result.startUrl).toBe('https://example.com/hotel');
    expect(result.visitedCount).toBe(1);
  });

  it('leaves the bare root start URL unchanged, the one spelling with no shorter form', async () => {
    installFetchStub({ 'https://example.com/robots.txt': ROBOTS_BODY });
    const { browser, navigated } = makeRecordingFakeBrowser(() => []);
    const result = await crawlSite('https://example.com/', {
      browser,
      maxPages: 10,
      maxDepth: 5,
      delayMs: 0,
    });

    expect(navigated).toEqual(['https://example.com/']);
    expect(result.startUrl).toBe('https://example.com/');
    expect(result.visitedCount).toBe(1);
  });
});

/** Plan 035 crawl-frontier resume: pure serialization contract for the
 *  loop state crawl.ts owns. A snapshot must survive a JSON round trip
 *  and rebuild structures a resumed crawl cannot tell from the live ones,
 *  including the enqueued invariant (every dequeued URL is recorded, every
 *  enqueued URL is queued or recorded, so enqueued is exactly pages
 *  union queue; a guard-omitted URL is discovered but in neither). */
describe('crawl frontier state round trip', () => {
  const relNextClassification = { basis: 'rel-next' as const, familyKey: 'path:/blog/page/{n}' };

  function guardAtCap(): ContinuationGuard {
    const guard = new ContinuationGuard();
    for (let i = 1; i <= CONTINUATION_FAMILY_MAX_ENQUEUED; i++) {
      guard.admit(relNextClassification, `https://example.com/blog/page/${i}`);
    }
    guard.admit(relNextClassification, 'https://example.com/blog/page/61');
    return guard;
  }

  function midCrawlState(): CrawlFrontierSnapshot {
    return {
      startUrlIdentity: 'https://example.com',
      robotsText: 'User-agent: *\nDisallow: /private\nSitemap: https://example.com/sitemap.xml\n',
      supplementalPhaseStarted: true,
      queue: [
        {
          url: 'https://example.com/p2',
          depth: 2,
          discoveredFrom: 'https://example.com/p1',
          discoveryMethod: 'link',
        },
        { url: 'https://example.com/sitemap-only', depth: 0, discoveryMethod: 'sitemap-only' },
      ],
      visited: ['https://example.com', 'https://example.com/p1'],
      pages: [
        {
          url: 'https://example.com',
          depth: 0,
          status: 'visited',
          httpStatus: 200,
          discoveryMethod: 'link',
          auditProfile: {
            url: 'https://example.com',
            profileVersion: 'v1',
            roleSignals: [{ kind: 'homepage-url', detail: 'https://example.com' }],
            templateFamilyId: 'v1:abcd1234abcd1234',
          } satisfies PageAuditProfile,
        },
        {
          url: 'https://example.com/p1',
          depth: 1,
          status: 'visited',
          httpStatus: 200,
          discoveredFrom: 'https://example.com',
          discoveryMethod: 'link',
          auditProfile: {
            url: 'https://example.com/p1',
            profileVersion: 'v1',
            language: 'fr',
            roleSignals: [],
          } satisfies PageAuditProfile,
        },
      ],
      // /blog/page/61 was discovered but omitted by the guard: it is in
      // neither pages nor queue, so it must not land in the rebuilt
      // enqueued set.
      linkDiscoveredUrls: [
        'https://example.com',
        'https://example.com/p1',
        'https://example.com/p2',
        'https://example.com/sitemap-only',
        'https://example.com/blog/page/61',
      ],
      linkDiscoveredFrom: [
        ['https://example.com/p1', 'https://example.com'],
        ['https://example.com/p2', 'https://example.com/p1'],
        ['https://example.com/blog/page/61', 'https://example.com/blog'],
      ],
      guard: guardAtCap().snapshot(),
      sitemap: {
        sitemapUrl: 'https://example.com/sitemap.xml',
        found: true,
        isSitemapIndex: false,
        entries: [{ url: 'https://example.com/sitemap-only' }],
        pageEntries: [{ url: 'https://example.com/sitemap-only' }],
        fetchedDocuments: [
          {
            url: 'https://example.com/sitemap.xml',
            isRoot: true,
            isSitemapIndex: false,
            entryCount: 1,
          },
        ],
        fetchedSitemapUrls: ['https://example.com/sitemap.xml'],
        fetchErrors: [],
      } satisfies SitemapCheckResult,
      eligibleSitemapUrls: ['https://example.com/sitemap-only'],
      filteredSitemapPageCount: 1,
    };
  }

  it('rebuilds identical structures from a JSON-serialized mid-crawl state', () => {
    const state = midCrawlState();
    const serialized = JSON.parse(JSON.stringify(state)) as CrawlFrontierSnapshot;

    const restored = restoreCrawlFrontierLoopState(serialized);

    expect(restored.pages).toEqual(state.pages);
    expect(restored.queue).toEqual(state.queue);
    expect(restored.visited).toEqual(new Set(state.visited));
    expect(restored.linkDiscoveredUrls).toEqual(new Set(state.linkDiscoveredUrls));
    expect(restored.linkDiscoveredFrom).toEqual(new Map(state.linkDiscoveredFrom));
    expect(restored.guard.summary()).toEqual(guardAtCap().summary());
    // The restored family is still at its cap: the next admit is omitted.
    expect(restored.guard.admit(relNextClassification, 'https://example.com/blog/page/62')).toBe(
      false,
    );
    // Copies, not aliases: mutating the rebuild must not touch the
    // snapshot the caller holds.
    expect(restored.pages[0]).not.toBe(state.pages[0]);
    expect(restored.queue[0]).not.toBe(state.queue[0]);
  });

  it('rebuilds enqueued as exactly recorded pages union queued URLs', () => {
    const state = midCrawlState();
    const restored = restoreCrawlFrontierLoopState(
      JSON.parse(JSON.stringify(state)) as CrawlFrontierSnapshot,
    );

    const union = [...state.pages.map((page) => page.url), ...state.queue.map((q) => q.url)];
    expect([...restored.enqueued].sort()).toEqual([...union].sort());
    // A guard-omitted URL was discovered but never enqueued.
    expect(restored.enqueued.has('https://example.com/blog/page/61')).toBe(false);
    // A discovered-only sitemap URL that was already queued stays queued
    // with its sitemap-only method intact.
    expect(restored.queue.some((item) => item.url === 'https://example.com/sitemap-only')).toBe(
      true,
    );
  });
});

/** Plan 035 crawl-frontier resume against the real loop: a capped fresh
 *  crawl snapshots every page (everyPages 1, minIntervalMs 0), the resumed
 *  crawl drains the queue without re-visiting or re-fetching robots.txt,
 *  and its visited inventory equals a control uninterrupted crawl's. */
describe('crawlSite frontier snapshots and resume', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Plain same-origin chain (no rel=next, no pagination controls), so
   *  the continuation guard never fires and every link is enqueued. */
  function linkChain(pageCount: number): (url: string) => FakeAnchorSpec[] {
    return (url) => {
      if (url === 'https://example.com/') return [{ href: '/p1' }];
      const match = url.match(/\/p(\d+)$/);
      if (match === null) return [];
      const next = Number(match[1]) + 1;
      if (next > pageCount) return [];
      return [{ href: `/p${next}` }];
    };
  }

  function installCountingFetchStub(routes: Record<string, string>): { calls: string[] } {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = routes[url];
        if (body === undefined) throw new Error(`unexpected fetch in test: ${url}`);
        calls.push(url);
        return new Response(body, { status: 200 });
      }),
    );
    return { calls };
  }

  function makeRecordingChainBrowser(anchorsFor: (url: string) => FakeAnchorSpec[]): {
    browser: Browser;
    navigated: string[];
  } {
    const navigated: string[] = [];
    const context = {
      setDefaultTimeout: () => {},
      setDefaultNavigationTimeout: () => {},
      newPage: async () => {
        let currentUrl = 'about:blank';
        return {
          goto: async (url: string) => {
            navigated.push(url);
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
    return { browser: { newContext: async () => context } as unknown as Browser, navigated };
  }

  it('snapshots at the cadence, resumes without re-visiting, and matches a control crawl', async () => {
    const { calls } = installCountingFetchStub({
      'https://example.com/robots.txt': ROBOTS_BODY,
    });
    const chain = linkChain(6);

    const firstRun = makeRecordingChainBrowser(chain);
    const firstSnapshots: CrawlFrontierSnapshot[] = [];
    const first = await crawlSite('https://example.com', {
      browser: firstRun.browser,
      maxPages: 2,
      maxDepth: 100,
      delayMs: 0,
      frontier: {
        writeState: (state) => firstSnapshots.push(state),
        everyPages: 1,
        minIntervalMs: 0,
      },
    });

    expect(first.visitedCount).toBe(2);
    expect(firstSnapshots).toHaveLength(2);
    const lastSnapshot = firstSnapshots.at(-1);
    expect(lastSnapshot?.visited).toEqual(['https://example.com/', 'https://example.com/p1']);
    expect(lastSnapshot?.queue.map((item) => item.url)).toEqual(['https://example.com/p2']);

    // The resume input goes through a real serialization round trip, the
    // same path a frontier file on disk takes.
    const resumeState = JSON.parse(JSON.stringify(lastSnapshot)) as CrawlFrontierSnapshot;

    const secondRun = makeRecordingChainBrowser(chain);
    const resumedSnapshots: CrawlFrontierSnapshot[] = [];
    const second = await crawlSite('https://example.com', {
      browser: secondRun.browser,
      maxDepth: 100,
      delayMs: 0,
      frontier: {
        resumeState,
        writeState: (state) => resumedSnapshots.push(state),
        everyPages: 1,
        minIntervalMs: 0,
      },
    });

    expect(second.visitedCount).toBe(7);
    // The resumed crawl fetched exactly the five pages still queued, in
    // order: not one URL re-visited, robots.txt re-fetched only once in
    // total (by the first crawl).
    expect(secondRun.navigated).toEqual([
      'https://example.com/p2',
      'https://example.com/p3',
      'https://example.com/p4',
      'https://example.com/p5',
      'https://example.com/p6',
    ]);
    expect(calls).toEqual(['https://example.com/robots.txt']);
    expect(second.robotsTxtFound).toBe(true);
    // No URL appears twice in the combined visited inventory.
    const combined = [...firstRun.navigated, ...secondRun.navigated];
    expect(new Set(combined).size).toBe(combined.length);
    // The resumed result carries the complete inventory, restored records
    // included, so a downstream consumer cannot tell it from a fresh run.
    expect(second.pages.map((page) => page.url)).toHaveLength(7);

    const controlRun = makeRecordingChainBrowser(chain);
    const control = await crawlSite('https://example.com', {
      browser: controlRun.browser,
      maxDepth: 100,
      delayMs: 0,
    });
    const visitedOf = (result: typeof control): string[] =>
      result.pages
        .filter((page) => page.status === 'visited')
        .map((page) => page.url)
        .sort();
    expect(visitedOf(second)).toEqual(visitedOf(control));
    expect(second.visitedCount).toBe(control.visitedCount);

    // Snapshotting continued to completion on the resumed crawl, then
    // stopped: the last snapshot holds the fully drained frontier, and no
    // snapshot fires past it.
    const finalSnapshot = resumedSnapshots.at(-1);
    expect(finalSnapshot?.visited).toHaveLength(7);
    expect(finalSnapshot?.queue).toEqual([]);
    expect(second.continuationGuardSummary).toBeUndefined();
  });

  it('refuses to resume a snapshot that belongs to a different start URL', async () => {
    installCountingFetchStub({ 'https://example.com/robots.txt': ROBOTS_BODY });
    const snapshots: CrawlFrontierSnapshot[] = [];
    await crawlSite('https://example.com', {
      browser: makeFakeBrowser(linkChain(2)),
      maxPages: 1,
      maxDepth: 100,
      delayMs: 0,
      frontier: { writeState: (state) => snapshots.push(state), everyPages: 1, minIntervalMs: 0 },
    });

    await expect(
      crawlSite('https://example.org', {
        browser: makeFakeBrowser(() => []),
        maxDepth: 100,
        delayMs: 0,
        frontier: {
          resumeState: snapshots.at(-1)!,
          writeState: () => {},
          everyPages: 1,
          minIntervalMs: 0,
        },
      }),
    ).rejects.toThrow(/different start URL/);
  });
});
