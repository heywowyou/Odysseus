import { describe, expect, it } from 'vitest';
import {
  extractCrawlCandidates,
  ROBOTS_BLOCKS_INDEXING_RULE_ID,
  BROKEN_INTERNAL_LINK_RULE_ID,
  ROBOTS_DISALLOW_BROAD_RULE_ID,
  AI_CRAWLER_BLOCKED_RULE_ID,
  type NormalizeCrawlInput,
} from './normalize-crawl.js';

const START_URL = 'https://example.com/';

function baseInput(overrides: Partial<NormalizeCrawlInput> = {}): NormalizeCrawlInput {
  return {
    startUrl: START_URL,
    pages: [{ url: START_URL, status: 'visited', httpStatus: 200 }],
    ...overrides,
  };
}

describe('robots-blocks-indexing', () => {
  it('fires when the homepage itself is disallowed by robots.txt', () => {
    const candidates = extractCrawlCandidates(
      baseInput({ pages: [{ url: START_URL, status: 'skipped-robots' }] }),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ruleId).toBe(ROBOTS_BLOCKS_INDEXING_RULE_ID);
    expect(candidates[0]?.category).toBe('seo');
    expect(candidates[0]?.severity).toBe('critical');
    expect(candidates[0]?.pageUrl).toBe(START_URL);
    expect(candidates[0]?.element).toBeNull();
  });

  it('does not fire when the homepage was visited normally', () => {
    expect(extractCrawlCandidates(baseInput())).toEqual([]);
  });

  it('does not fire when a non-homepage page is robots-blocked', () => {
    const candidates = extractCrawlCandidates(
      baseInput({
        pages: [
          { url: START_URL, status: 'visited', httpStatus: 200 },
          {
            url: 'https://example.com/private',
            status: 'skipped-robots',
            discoveredFrom: START_URL,
          },
        ],
      }),
    );
    expect(candidates.filter((c) => c.ruleId === ROBOTS_BLOCKS_INDEXING_RULE_ID)).toEqual([]);
  });
});

describe('broken-internal-link', () => {
  it('fires for a target that returned an HTTP error status, attributed to the linking page', () => {
    const candidates = extractCrawlCandidates(
      baseInput({
        pages: [
          { url: START_URL, status: 'visited', httpStatus: 200 },
          {
            url: 'https://example.com/gone',
            status: 'visited',
            httpStatus: 404,
            discoveredFrom: START_URL,
          },
        ],
      }),
    );
    const broken = candidates.filter((c) => c.ruleId === BROKEN_INTERNAL_LINK_RULE_ID);
    expect(broken).toHaveLength(1);
    expect(broken[0]?.category).toBe('seo');
    expect(broken[0]?.severity).toBe('serious');
    expect(broken[0]?.pageUrl).toBe(START_URL);
    expect(broken[0]?.element?.selector).toBe('a[href="https://example.com/gone"]');
  });

  it('stays silent for a target the crawler got no answer from (status error)', () => {
    const candidates = extractCrawlCandidates(
      baseInput({
        pages: [
          { url: START_URL, status: 'visited', httpStatus: 200 },
          { url: 'https://example.com/timeout', status: 'error', discoveredFrom: START_URL },
        ],
      }),
    );
    const broken = candidates.filter((c) => c.ruleId === BROKEN_INTERNAL_LINK_RULE_ID);
    expect(broken).toHaveLength(0);
  });

  // Issue #39: the crawler now records a non-2xx target with its own
  // status instead of 'visited'. The link that led there is still broken.
  it('fires for a target recorded http-error-status, stating the HTTP status', () => {
    const candidates = extractCrawlCandidates(
      baseInput({
        pages: [
          { url: START_URL, status: 'visited', httpStatus: 200 },
          {
            url: 'https://example.com/back-office/www.staffcom.fr',
            status: 'http-error-status',
            httpStatus: 404,
            discoveredFrom: START_URL,
          },
        ],
      }),
    );
    const broken = candidates.filter((c) => c.ruleId === BROKEN_INTERNAL_LINK_RULE_ID);
    expect(broken).toHaveLength(1);
    expect(broken[0]?.pageUrl).toBe(START_URL);
    expect(broken[0]?.element?.selector).toBe(
      'a[href="https://example.com/back-office/www.staffcom.fr"]',
    );
    expect(broken[0]?.description).toContain('HTTP 404');
  });

  it('does not fire for a successfully visited target', () => {
    const candidates = extractCrawlCandidates(
      baseInput({
        pages: [
          { url: START_URL, status: 'visited', httpStatus: 200 },
          {
            url: 'https://example.com/about',
            status: 'visited',
            httpStatus: 200,
            discoveredFrom: START_URL,
          },
        ],
      }),
    );
    expect(candidates.filter((c) => c.ruleId === BROKEN_INTERNAL_LINK_RULE_ID)).toEqual([]);
  });

  it('does not fire for a broken target with no known referring page', () => {
    const candidates = extractCrawlCandidates(
      baseInput({
        pages: [
          { url: START_URL, status: 'visited', httpStatus: 200 },
          { url: 'https://example.com/gone', status: 'visited', httpStatus: 404 },
        ],
      }),
    );
    expect(candidates.filter((c) => c.ruleId === BROKEN_INTERNAL_LINK_RULE_ID)).toEqual([]);
  });

  it('gives two different broken targets distinct selectors so they do not dedupe into one finding', () => {
    const candidates = extractCrawlCandidates(
      baseInput({
        pages: [
          { url: START_URL, status: 'visited', httpStatus: 200 },
          {
            url: 'https://example.com/gone-a',
            status: 'visited',
            httpStatus: 404,
            discoveredFrom: START_URL,
          },
          {
            url: 'https://example.com/gone-b',
            status: 'visited',
            httpStatus: 500,
            discoveredFrom: START_URL,
          },
        ],
      }),
    );
    const broken = candidates.filter((c) => c.ruleId === BROKEN_INTERNAL_LINK_RULE_ID);
    expect(broken).toHaveLength(2);
    expect(broken[0]?.element?.selector).not.toBe(broken[1]?.element?.selector);
  });

  // Issue #85: a redirect-interstitial page is a resolved 200 whose
  // content belongs elsewhere, not a broken target - it must not be
  // flagged as a broken internal link.
  it('skips a page marked redirect-interstitial (never treated as broken)', () => {
    const candidates = extractCrawlCandidates(
      baseInput({
        pages: [
          { url: START_URL, status: 'visited', httpStatus: 200 },
          {
            url: 'https://example.com/fr',
            status: 'redirect-interstitial',
            httpStatus: 200,
            discoveredFrom: START_URL,
          },
        ],
      }),
    );
    expect(candidates.filter((c) => c.ruleId === BROKEN_INTERNAL_LINK_RULE_ID)).toEqual([]);
  });

  it('skips a page marked skipped-non-html (never treated as broken)', () => {
    const candidates = extractCrawlCandidates(
      baseInput({
        pages: [
          { url: START_URL, status: 'visited', httpStatus: 200 },
          {
            url: 'https://example.com/image.jpg',
            status: 'skipped-non-html',
            discoveredFrom: START_URL,
          },
        ],
      }),
    );
    expect(candidates.filter((c) => c.ruleId === BROKEN_INTERNAL_LINK_RULE_ID)).toEqual([]);
  });
});

describe('robots-disallow-broad', () => {
  it('fires when a Disallow pattern blocks 3 or more discovered pages', () => {
    const candidates = extractCrawlCandidates(
      baseInput({
        robotsDisallowMatches: [{ pattern: '/blog/', matchedPageCount: 5 }],
      }),
    );
    const broad = candidates.filter((c) => c.ruleId === ROBOTS_DISALLOW_BROAD_RULE_ID);
    expect(broad).toHaveLength(1);
    expect(broad[0]?.category).toBe('seo');
    expect(broad[0]?.severity).toBe('moderate');
    expect(broad[0]?.pageUrl).toBe(START_URL);
    expect(broad[0]?.element).toBeNull();
    expect(broad[0]?.rawEvidenceForPage).toEqual({ pattern: '/blog/', matchedPageCount: 5 });
  });

  it('does not fire below the threshold - a couple of targeted pages is ordinary', () => {
    const candidates = extractCrawlCandidates(
      baseInput({
        robotsDisallowMatches: [{ pattern: '/panier', matchedPageCount: 2 }],
      }),
    );
    expect(candidates.filter((c) => c.ruleId === ROBOTS_DISALLOW_BROAD_RULE_ID)).toEqual([]);
  });

  it('does not fire when there are no disallow matches at all', () => {
    expect(extractCrawlCandidates(baseInput())).toEqual([]);
  });

  it('emits one candidate per qualifying pattern', () => {
    const candidates = extractCrawlCandidates(
      baseInput({
        robotsDisallowMatches: [
          { pattern: '/blog/', matchedPageCount: 5 },
          { pattern: '/products/', matchedPageCount: 8 },
          { pattern: '/panier', matchedPageCount: 1 },
        ],
      }),
    );
    const broad = candidates.filter((c) => c.ruleId === ROBOTS_DISALLOW_BROAD_RULE_ID);
    expect(broad).toHaveLength(2);
  });
});

describe('ai-crawler-blocked', () => {
  it('fires one candidate per blocked agent', () => {
    const candidates = extractCrawlCandidates(
      baseInput({
        aiCrawlerBlocks: [
          { agent: 'GPTBot', disallowPattern: '/' },
          { agent: 'ClaudeBot', disallowPattern: '/' },
        ],
      }),
    );
    const blocked = candidates.filter((c) => c.ruleId === AI_CRAWLER_BLOCKED_RULE_ID);
    expect(blocked).toHaveLength(2);
    expect(blocked[0]?.category).toBe('geo');
    expect(blocked[0]?.pageUrl).toBe(START_URL);
    expect(blocked[0]?.element?.selector).not.toBe(blocked[1]?.element?.selector);
  });

  it('does not fire when there are no blocked agents', () => {
    expect(extractCrawlCandidates(baseInput())).toEqual([]);
  });
});
