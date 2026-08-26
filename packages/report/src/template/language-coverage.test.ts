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
function manifestWith(pages: Array<{ url: string; status: string }>): AuditManifest {
  return { pages } as unknown as AuditManifest;
}

describe('language coverage stated from the site\'s own URL structure', () => {
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
      computeLanguageCoverage(manifestWith([{ url: 'https://example.com/fr/a', status: 'visited' }])),
    ).toBeUndefined();
  });
});
