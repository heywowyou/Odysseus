import { describe, expect, it } from 'vitest';
import {
  extractSitemapCandidates,
  SITEMAP_LISTS_REDIRECTS_RULE_ID,
  SITEMAP_MISSING_RULE_ID,
  SITEMAP_STALE_RULE_ID,
  SITEMAP_ORPHAN_PAGE_RULE_ID,
  type SitemapCheckInput,
} from './normalize-sitemap.js';

const PAGE_URL = 'https://example.com/';

/** discoveredUrls defaults to every entries + crawledUrls URL (from
 *  whichever overrides supplied them), so no existing test accidentally
 *  trips the orphan check by omission - tests exercising
 *  sitemap-orphan-page pass a narrower discoveredUrls explicitly. */
function baseInput(overrides: Partial<SitemapCheckInput> = {}): SitemapCheckInput {
  const entries = overrides.entries ?? [
    { url: 'https://example.com/' },
    { url: 'https://example.com/about' },
    { url: 'https://example.com/contact' },
  ];
  const crawledUrls = overrides.crawledUrls ?? [
    'https://example.com/',
    'https://example.com/about',
    'https://example.com/contact',
  ];
  return {
    pageUrl: PAGE_URL,
    found: true,
    isSitemapIndex: false,
    entries,
    crawledUrls,
    discoveredUrls: [...crawledUrls, ...entries.map((entry) => entry.url)],
    ...overrides,
  };
}

describe('sitemap-missing', () => {
  it('fires when no sitemap was found', () => {
    const candidates = extractSitemapCandidates(
      baseInput({ found: false, entries: [], fetchError: 'HTTP 404' }),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ruleId).toBe(SITEMAP_MISSING_RULE_ID);
    expect(candidates[0]?.category).toBe('seo');
    expect(candidates[0]?.severity).toBe('moderate');
    expect(candidates[0]?.element).toBeNull();
  });

  it('does not fire when a sitemap was found', () => {
    expect(extractSitemapCandidates(baseInput())).toEqual([]);
  });

  it('fires missing (not stale) when the sitemap URL responds but lists no pages at all', () => {
    // Confirmed against a real SPA dev server: a catch-all route served
    // index.html at /sitemap.xml, a 200 response with zero real <loc>
    // entries. That is functionally "no sitemap", not "out of date".
    const candidates = extractSitemapCandidates(
      baseInput({ entries: [], sitemapUrl: 'https://example.com/sitemap.xml' }),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ruleId).toBe(SITEMAP_MISSING_RULE_ID);
  });
});

describe('sitemap-stale', () => {
  it('fires when most crawled pages are missing from the sitemap', () => {
    const candidates = extractSitemapCandidates(
      baseInput({
        entries: [
          { url: 'https://example.com/old-page-1' },
          { url: 'https://example.com/old-page-2' },
        ],
        crawledUrls: [
          'https://example.com/',
          'https://example.com/about',
          'https://example.com/contact',
          'https://example.com/blog',
        ],
      }),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ruleId).toBe(SITEMAP_STALE_RULE_ID);
    expect(candidates[0]?.category).toBe('seo');
    expect(candidates[0]?.severity).toBe('minor');
  });

  it('does not fire when most crawled pages are present in the sitemap', () => {
    expect(
      extractSitemapCandidates(
        baseInput({
          entries: [
            { url: 'https://example.com/' },
            { url: 'https://example.com/about' },
            { url: 'https://example.com/contact' },
            { url: 'https://example.com/extra-page-not-crawled' },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('treats a trailing slash as equivalent when matching', () => {
    expect(
      extractSitemapCandidates(
        baseInput({
          entries: [
            { url: 'https://example.com' },
            { url: 'https://example.com/about/' },
            { url: 'https://example.com/contact' },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('does not judge staleness for a sitemap index', () => {
    expect(
      extractSitemapCandidates(
        baseInput({
          isSitemapIndex: true,
          entries: [{ url: 'https://example.com/sitemap-a.xml' }],
        }),
      ),
    ).toEqual([]);
  });

  it('judges a newly flattened sitemap index from pageEntries', () => {
    const candidates = extractSitemapCandidates(
      baseInput({
        isSitemapIndex: true,
        entries: [{ url: 'https://example.com/pages.xml' }],
        pageEntries: [{ url: 'https://example.com/' }, { url: 'https://example.com/orphan' }],
        crawledUrls: ['https://example.com/', 'https://example.com/about'],
        discoveredUrls: ['https://example.com/', 'https://example.com/about'],
      }),
    );

    expect(candidates.map((candidate) => candidate.ruleId)).toContain(SITEMAP_ORPHAN_PAGE_RULE_ID);
  });

  it('does not fire when there are no crawled URLs to compare against', () => {
    expect(extractSitemapCandidates(baseInput({ crawledUrls: [] }))).toEqual([]);
  });
});

describe('sitemap-orphan-page', () => {
  it('fires when a sitemap entry was never discovered through any internal link', () => {
    const candidates = extractSitemapCandidates(
      baseInput({
        entries: [
          { url: 'https://example.com/' },
          { url: 'https://example.com/about' },
          { url: 'https://example.com/contact' },
          { url: 'https://example.com/orphan-promo' },
        ],
        discoveredUrls: [
          'https://example.com/',
          'https://example.com/about',
          'https://example.com/contact',
        ],
      }),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ruleId).toBe(SITEMAP_ORPHAN_PAGE_RULE_ID);
    expect(candidates[0]?.category).toBe('seo');
    expect(candidates[0]?.severity).toBe('minor');
    expect(candidates[0]?.rawEvidenceForPage).toEqual({
      orphanUrls: ['https://example.com/orphan-promo'],
    });
  });

  it('does not treat a page skipped-but-discovered (e.g. robots-blocked) as an orphan', () => {
    // discoveredUrls includes every URL the crawl found at all, not only
    // visited ones - a page found via a real link but skipped for
    // robots/non-HTML/error reasons is not an orphan.
    const candidates = extractSitemapCandidates(
      baseInput({
        entries: [
          { url: 'https://example.com/' },
          { url: 'https://example.com/about' },
          { url: 'https://example.com/contact' },
        ],
        crawledUrls: [
          'https://example.com/',
          'https://example.com/about',
          'https://example.com/contact',
        ],
        discoveredUrls: [
          'https://example.com/',
          'https://example.com/about',
          'https://example.com/contact',
        ],
      }),
    );
    expect(candidates).toEqual([]);
  });

  it('can fire alongside sitemap-stale, independently', () => {
    const candidates = extractSitemapCandidates(
      baseInput({
        entries: [{ url: 'https://example.com/old-page-1' }, { url: 'https://example.com/orphan' }],
        crawledUrls: [
          'https://example.com/',
          'https://example.com/about',
          'https://example.com/contact',
          'https://example.com/blog',
        ],
        discoveredUrls: [
          'https://example.com/',
          'https://example.com/about',
          'https://example.com/contact',
          'https://example.com/blog',
          'https://example.com/old-page-1',
        ],
      }),
    );
    expect(candidates.map((c) => c.ruleId).sort()).toEqual(
      [SITEMAP_ORPHAN_PAGE_RULE_ID, SITEMAP_STALE_RULE_ID].sort(),
    );
  });
});

describe('sitemap-lists-redirects', () => {
  it('reports redirected and off-site entries separately and excludes them from absence comparisons', () => {
    const candidates = extractSitemapCandidates(
      baseInput({
        entries: [
          { url: 'https://example.com/' },
          { url: 'https://example.com/old-home' },
          { url: 'https://other.example/landing' },
        ],
        crawledUrls: ['https://example.com/', 'https://example.com/current'],
        redirectedUrls: ['https://example.com/old-home'],
      }),
    );

    expect(candidates.map((candidate) => candidate.ruleId)).toEqual([
      SITEMAP_LISTS_REDIRECTS_RULE_ID,
    ]);
    expect(candidates[0]?.rawEvidenceForPage).toEqual({
      redirectedUrls: ['https://example.com/old-home'],
      externalUrls: ['https://other.example/landing'],
    });
  });

  // Plan 075 I1: grandhoteldesalpes's English pages were counted as
  // redirected sitemap URLs because WPML sent our French browser to their
  // translations. The scanner's redirected list can still carry them.
  it('counts another-language pages neither as redirects nor as sitemap drift', () => {
    const candidates = extractSitemapCandidates(
      baseInput({
        entries: [
          { url: 'https://example.com/fr/' },
          { url: 'https://example.com/en/legal-notices/' },
          { url: 'https://example.com/fr/chambres/' },
        ],
        crawledUrls: ['https://example.com/fr/'],
        discoveredUrls: ['https://example.com/fr/'],
        redirectedUrls: [
          'https://example.com/en/legal-notices/',
          'https://example.com/fr/chambres/',
        ],
        languageAlternateUrls: ['https://example.com/en/legal-notices/'],
      }),
    );

    expect(candidates.map((candidate) => candidate.ruleId)).toEqual([
      SITEMAP_LISTS_REDIRECTS_RULE_ID,
    ]);
    expect(candidates[0]?.description).toContain('1 redirected URL(s)');
    expect(candidates[0]?.rawEvidenceForPage).toEqual({
      redirectedUrls: ['https://example.com/fr/chambres'],
      externalUrls: [],
    });
  });
});
