import { describe, expect, it } from 'vitest';
import {
  extractSitemapCandidates,
  SITEMAP_MISSING_RULE_ID,
  SITEMAP_STALE_RULE_ID,
  type SitemapCheckInput,
} from './normalize-sitemap.js';

const PAGE_URL = 'https://example.com/';

function baseInput(overrides: Partial<SitemapCheckInput> = {}): SitemapCheckInput {
  return {
    pageUrl: PAGE_URL,
    found: true,
    isSitemapIndex: false,
    entries: [
      { url: 'https://example.com/' },
      { url: 'https://example.com/about' },
      { url: 'https://example.com/contact' },
    ],
    crawledUrls: ['https://example.com/', 'https://example.com/about', 'https://example.com/contact'],
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
        entries: [{ url: 'https://example.com/old-page-1' }, { url: 'https://example.com/old-page-2' }],
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
        baseInput({ isSitemapIndex: true, entries: [{ url: 'https://example.com/sitemap-a.xml' }] }),
      ),
    ).toEqual([]);
  });

  it('does not fire when there are no crawled URLs to compare against', () => {
    expect(extractSitemapCandidates(baseInput({ crawledUrls: [] }))).toEqual([]);
  });
});
