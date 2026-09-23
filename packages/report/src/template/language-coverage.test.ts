import { describe, expect, it } from 'vitest';
import type { AuditManifest } from '@odysseus/core';
import { computeLanguageCoverage } from './language-coverage.js';

/**
 * 2026-08-25 Lagnonu review, item 1.3's remaining half. A real report said
 * "Perimetre : 43 pages analysees" for a site publishing French, English and
 * Spanish, having visited zero English and zero Spanish pages. The page cap
 * that caused it is gone, but nothing in the report ever stated which
 * languages were reached, so the sentence would read identically if a
 * language were missed again for another reason.
 */
function manifestWith(
  pages: Array<{ url: string; status: string; language?: string }>,
): AuditManifest {
  return { pages } as unknown as AuditManifest;
}

describe("language coverage stated from the site's own URL structure", () => {
  it('lists every language with at least one scanned page', () => {
    const coverage = computeLanguageCoverage(
      manifestWith([
        { url: 'https://example.com/fr/accueil', status: 'visited' },
        { url: 'https://example.com/en/home', status: 'visited' },
        { url: 'https://example.com/es/inicio', status: 'visited' },
      ]),
    );

    expect(coverage).toEqual({ scanned: ['en', 'es', 'fr'], discoveredOnly: [] });
  });

  it('separates a language the crawl saw but never scanned', () => {
    // The exact Lagnonu failure: /es/ discovered, no /es/ page visited.
    const coverage = computeLanguageCoverage(
      manifestWith([
        { url: 'https://example.com/fr/accueil', status: 'visited' },
        { url: 'https://example.com/es', status: 'discovered-not-scanned' },
      ]),
    );

    expect(coverage).toEqual({ scanned: ['fr'], discoveredOnly: ['es'] });
  });

  /** One prefix is a site that namespaces its URLs, not a translated site.
   *  Claiming "languages examined: fr" would imply a choice nobody made. */
  it('says nothing about a site that is not multilingual', () => {
    expect(
      computeLanguageCoverage(
        manifestWith([
          { url: 'https://example.com/', status: 'visited' },
          { url: 'https://example.com/contact', status: 'visited' },
        ]),
      ),
    ).toBeUndefined();

    expect(
      computeLanguageCoverage(
        manifestWith([{ url: 'https://example.com/fr/a', status: 'visited' }]),
      ),
    ).toBeUndefined();
  });

  /** Issue #290 (haaitza.com): the default language lives at the root with
   *  no path prefix, so prefix-only attribution reported French as
   *  published-but-never-analysed while every analysed page WAS French.
   *  The page's own declared <html lang>, persisted in the manifest,
   *  attributes those pages. */
  it('attributes a root-path page to its declared language (issue #290)', () => {
    const coverage = computeLanguageCoverage(
      manifestWith([
        { url: 'https://example.com/', status: 'visited', language: 'fr' },
        { url: 'https://example.com/actualites', status: 'visited', language: 'fr' },
        { url: 'https://example.com/en/home', status: 'visited' },
        { url: 'https://example.com/es', status: 'discovered-not-scanned' },
      ]),
    );

    expect(coverage).toEqual({ scanned: ['en', 'fr'], discoveredOnly: ['es'] });
  });

  /** The same site, with the bare language homepage the crawl discovered
   *  but did not scan: fr is analysed at the root, so the discovered /fr
   *  URL no longer lists French as "not analysed". */
  it('does not report a declared-analysed language as discovered-only', () => {
    const coverage = computeLanguageCoverage(
      manifestWith([
        { url: 'https://example.com/', status: 'visited', language: 'fr' },
        { url: 'https://example.com/en/home', status: 'visited' },
        { url: 'https://example.com/fr', status: 'discovered-not-scanned' },
      ]),
    );

    expect(coverage).toEqual({ scanned: ['en', 'fr'], discoveredOnly: [] });
  });

  /** hotelchateauroyal.nc: French pages at the root declare fr-FR, English
   *  and Japanese pages en-GB and ja, and the bare /fr URL is a redirect the
   *  crawl did not analyse. French was reported as published but never
   *  analysed although 170 French pages were. */
  it('compares languages by primary subtag, not by regional variant', () => {
    const coverage = computeLanguageCoverage(
      manifestWith([
        { url: 'https://example.nc/', status: 'visited', language: 'fr-FR' },
        { url: 'https://example.nc/histoire', status: 'visited', language: 'fr-fr' },
        { url: 'https://example.nc/en/history', status: 'visited', language: 'en-GB' },
        { url: 'https://example.nc/ja/top', status: 'visited', language: 'ja' },
        { url: 'https://example.nc/fr', status: 'redirect-interstitial' },
      ]),
    );

    expect(coverage).toEqual({ scanned: ['en', 'fr', 'ja'], discoveredOnly: [] });
  });

  /** A page with neither a prefix nor a recorded language (historical
   *  manifest, or head-metadata extraction failed) states nothing rather
   *  than guessing. */
  it('skips pages with no prefix and no declared language', () => {
    expect(
      computeLanguageCoverage(
        manifestWith([
          { url: 'https://example.com/', status: 'visited' },
          { url: 'https://example.com/en/home', status: 'visited' },
        ]),
      ),
    ).toBeUndefined();
  });
});
