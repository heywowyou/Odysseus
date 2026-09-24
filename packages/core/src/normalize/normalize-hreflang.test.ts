import { describe, expect, it } from 'vitest';
import {
  extractHreflangCandidates,
  HREFLANG_NO_RETURN_LINK_RULE_ID,
  type HreflangPageInput,
} from './normalize-hreflang.js';

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
    const pages: HreflangPageInput[] = [
      { url: FR_URL, hreflangLinks: [{ lang: 'fr', href: FR_URL }] },
    ];
    expect(extractHreflangCandidates(pages)).toEqual([]);
  });

  it('treats a trailing slash as equivalent when matching return links', () => {
    const pages: HreflangPageInput[] = [
      { url: 'https://example.com/fr', hreflangLinks: [{ lang: 'en', href: EN_URL }] },
      { url: EN_URL, hreflangLinks: [{ lang: 'fr', href: 'https://example.com/fr/' }] },
    ];
    expect(extractHreflangCandidates(pages)).toEqual([]);
  });

  it('gives one template tag repeated on every page one identity', () => {
    // Bellevigne: every page declared hreflang="fr" pointing at the homepage.
    const home = 'https://example.com/';
    const pages: HreflangPageInput[] = [
      { url: home, hreflangLinks: [{ lang: 'fr', href: home }] },
      { url: 'https://example.com/chambres', hreflangLinks: [{ lang: 'fr', href: home }] },
      { url: 'https://example.com/spa', hreflangLinks: [{ lang: 'fr', href: home }] },
    ];
    const candidates = extractHreflangCandidates(pages);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.dedupeIdentity).toBeDefined();
    expect(candidates[0]?.dedupeIdentity).toBe(candidates[1]?.dedupeIdentity);
  });

  it('keeps pages missing different return links apart', () => {
    const pages: HreflangPageInput[] = [
      { url: FR_URL, hreflangLinks: [{ lang: 'en', href: EN_URL }] },
      { url: EN_URL, hreflangLinks: [] },
      {
        url: 'https://example.com/fr/spa',
        hreflangLinks: [{ lang: 'en', href: 'https://example.com/en/spa' }],
      },
      { url: 'https://example.com/en/spa', hreflangLinks: [] },
    ];
    const candidates = extractHreflangCandidates(pages);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.dedupeIdentity).not.toBe(candidates[1]?.dedupeIdentity);
  });

  it('groups missing return links from one source page into one finding', () => {
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
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.element?.snippet).toContain('hreflang="en"');
    expect(candidates[0]?.element?.snippet).toContain('hreflang="de"');
  });

  it('only flags the direction missing a return link, not the page that already reciprocates', () => {
    const pages: HreflangPageInput[] = [
      { url: FR_URL, hreflangLinks: [{ lang: 'en', href: EN_URL }] },
      {
        url: EN_URL,
        hreflangLinks: [
          { lang: 'fr', href: FR_URL },
          { lang: 'de', href: 'https://example.com/de/' },
        ],
      },
      { url: 'https://example.com/de/', hreflangLinks: [] },
    ];
    const candidates = extractHreflangCandidates(pages);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.pageUrl).toBe(EN_URL);
  });
});

describe('hreflang-missing', () => {
  // B1.4 (2026-08-24): the real Domaine Lagnonu scan had 43 pages across
  // /fr/, /en/ and /es/ URL paths and zero hreflang anywhere, and produced
  // no finding because nothing emitted this rule id.
  it('fires when a multilingual site publishes no hreflang at all', () => {
    const candidates = extractHreflangCandidates([
      { url: 'https://site.example/fr/accueil', hreflangLinks: [] },
      { url: 'https://site.example/en/home', hreflangLinks: [] },
      { url: 'https://site.example/es/inicio', hreflangLinks: [] },
    ]);

    const missing = candidates.filter((c) => c.ruleId === 'hreflang-missing');
    expect(missing).toHaveLength(1);
    expect(missing[0]!.category).toBe('seo');
    expect(missing[0]!.description).toContain('en, es, fr');
  });

  it('does not fire on a monolingual site (the common case)', () => {
    const candidates = extractHreflangCandidates([
      { url: 'https://site.example/', hreflangLinks: [] },
      { url: 'https://site.example/contact', hreflangLinks: [] },
    ]);

    expect(candidates.filter((c) => c.ruleId === 'hreflang-missing')).toHaveLength(0);
  });

  it('does not fire when only one language path prefix is present', () => {
    const candidates = extractHreflangCandidates([
      { url: 'https://site.example/fr/accueil', hreflangLinks: [] },
      { url: 'https://site.example/fr/contact', hreflangLinks: [] },
    ]);

    expect(candidates.filter((c) => c.ruleId === 'hreflang-missing')).toHaveLength(0);
  });

  it('does not fire when the site publishes any hreflang, leaving reciprocity to the other check', () => {
    const candidates = extractHreflangCandidates([
      {
        url: 'https://site.example/fr/accueil',
        hreflangLinks: [{ lang: 'en', href: 'https://site.example/en/home' }],
      },
      { url: 'https://site.example/en/home', hreflangLinks: [] },
    ]);

    expect(candidates.filter((c) => c.ruleId === 'hreflang-missing')).toHaveLength(0);
  });

  it('emits exactly one site-level finding, not one per page', () => {
    const pages = ['fr', 'en', 'es'].flatMap((lang) =>
      [1, 2, 3].map((n) => ({ url: `https://site.example/${lang}/page-${n}`, hreflangLinks: [] })),
    );

    expect(
      extractHreflangCandidates(pages).filter((c) => c.ruleId === 'hreflang-missing'),
    ).toHaveLength(1);
  });
});
