import { describe, expect, it } from 'vitest';
import {
  extractCrawlCandidates,
  ROBOTS_BLOCKS_INDEXING_RULE_ID,
  BROKEN_INTERNAL_LINK_RULE_ID,
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
          { url: 'https://example.com/private', status: 'skipped-robots', discoveredFrom: START_URL },
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

  it('fires for a target the crawler could not reach at all (status error)', () => {
    const candidates = extractCrawlCandidates(
      baseInput({
        pages: [
          { url: START_URL, status: 'visited', httpStatus: 200 },
          { url: 'https://example.com/timeout', status: 'error', discoveredFrom: START_URL },
        ],
      }),
    );
    const broken = candidates.filter((c) => c.ruleId === BROKEN_INTERNAL_LINK_RULE_ID);
    expect(broken).toHaveLength(1);
    expect(broken[0]?.description).toMatch(/could not be reached/i);
  });

  it('does not fire for a successfully visited target', () => {
    const candidates = extractCrawlCandidates(
      baseInput({
        pages: [
          { url: START_URL, status: 'visited', httpStatus: 200 },
          { url: 'https://example.com/about', status: 'visited', httpStatus: 200, discoveredFrom: START_URL },
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
          { url: 'https://example.com/gone-a', status: 'visited', httpStatus: 404, discoveredFrom: START_URL },
          { url: 'https://example.com/gone-b', status: 'visited', httpStatus: 500, discoveredFrom: START_URL },
        ],
      }),
    );
    const broken = candidates.filter((c) => c.ruleId === BROKEN_INTERNAL_LINK_RULE_ID);
    expect(broken).toHaveLength(2);
    expect(broken[0]?.element?.selector).not.toBe(broken[1]?.element?.selector);
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
