import { describe, expect, it } from 'vitest';
import { extractHreflangCandidates, HREFLANG_NO_RETURN_LINK_RULE_ID, type HreflangPageInput } from './normalize-hreflang.js';

const FR_URL = 'https://example.com/fr/';
const EN_URL = 'https://example.com/en/';

describe('hreflang-no-return-link', () => {
  it('does not fire when both pages reciprocate', () => {
    const pages: HreflangPageInput[] = [
      { url: FR_URL, hreflangLinks: [{ lang: 'en', href: EN_URL }] },
      { url: EN_URL, hreflangLinks: [{ lang: 'fr', href: FR_URL }] },
    ];
    expect(extractHreflangCandidates(pages)).toEqual([]);
  });

  it('fires when the target page does not link back', () => {
    const pages: HreflangPageInput[] = [
      { url: FR_URL, hreflangLinks: [{ lang: 'en', href: EN_URL }] },
      { url: EN_URL, hreflangLinks: [] },
    ];
    const candidates = extractHreflangCandidates(pages);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ruleId).toBe(HREFLANG_NO_RETURN_LINK_RULE_ID);
    expect(candidates[0]?.category).toBe('seo');
    expect(candidates[0]?.severity).toBe('serious');
    expect(candidates[0]?.pageUrl).toBe(FR_URL);
  });

  it('does not fire for a link whose target is outside crawl scope', () => {
    const pages: HreflangPageInput[] = [
      { url: FR_URL, hreflangLinks: [{ lang: 'en', href: 'https://example.com/en-not-crawled/' }] },
    ];
    expect(extractHreflangCandidates(pages)).toEqual([]);
  });

  it('does not fire for a self-referencing hreflang tag', () => {
    const pages: HreflangPageInput[] = [{ url: FR_URL, hreflangLinks: [{ lang: 'fr', href: FR_URL }] }];
    expect(extractHreflangCandidates(pages)).toEqual([]);
  });

  it('treats a trailing slash as equivalent when matching return links', () => {
    const pages: HreflangPageInput[] = [
      { url: 'https://example.com/fr', hreflangLinks: [{ lang: 'en', href: EN_URL }] },
      { url: EN_URL, hreflangLinks: [{ lang: 'fr', href: 'https://example.com/fr/' }] },
    ];
    expect(extractHreflangCandidates(pages)).toEqual([]);
  });

  it('gives two different missing return links distinct selectors so they do not dedupe into one finding', () => {
    const deUrl = 'https://example.com/de/';
    const pages: HreflangPageInput[] = [
      {
        url: FR_URL,
        hreflangLinks: [
          { lang: 'en', href: EN_URL },
          { lang: 'de', href: deUrl },
        ],
      },
      { url: EN_URL, hreflangLinks: [] },
      { url: deUrl, hreflangLinks: [] },
    ];
    const candidates = extractHreflangCandidates(pages);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.element?.selector).not.toBe(candidates[1]?.element?.selector);
  });

  it('only flags the direction missing a return link, not the page that already reciprocates', () => {
    const pages: HreflangPageInput[] = [
      { url: FR_URL, hreflangLinks: [{ lang: 'en', href: EN_URL }] },
      { url: EN_URL, hreflangLinks: [{ lang: 'fr', href: FR_URL }, { lang: 'de', href: 'https://example.com/de/' }] },
      { url: 'https://example.com/de/', hreflangLinks: [] },
    ];
    const candidates = extractHreflangCandidates(pages);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.pageUrl).toBe(EN_URL);
  });
});
