import { languagePrefixOf, type AuditManifest } from '@odysseus/core';

/**
 * 2026-08-25 Lagnonu review, item 1.3's remaining half. A real report said
 * "Perimetre : 43 pages analysees" for a site publishing French, English and
 * Spanish, having visited zero English and zero Spanish pages. The page cap
 * that caused that is gone, but nothing in the report ever stated which
 * languages were actually examined, so the same sentence would read exactly
 * the same way if a language were missed again for some other reason.
 *
 * Read from the site's own URL structure, the same signal
 * normalize-hreflang.ts uses to decide a site is multilingual at all - never
 * from hreflang, which the review site does not publish, and never by
 * guessing that /en/x translates /x, which trade-off 24 already rejected for
 * clustering. A site with no language prefixes is not multilingual as far as
 * anything here can tell, and gets no sentence rather than a claim.
 */
export interface LanguageCoverage {
  /** Language prefixes with at least one scanned page, sorted. */
  scanned: string[];
  /** Prefixes seen only on pages the crawl discovered but did not scan. */
  discoveredOnly: string[];
}

export function computeLanguageCoverage(manifest: AuditManifest): LanguageCoverage | undefined {
  const scanned = new Set<string>();
  const discovered = new Set<string>();

  for (const page of manifest.pages) {
    const prefix = languagePrefixOf(page.url);
    if (prefix === undefined) continue;
    if (page.status === 'visited') scanned.add(prefix);
    else discovered.add(prefix);
  }

  const discoveredOnly = [...discovered].filter((lang) => !scanned.has(lang));

  // One prefix is a site that happens to namespace its URLs, not evidence of
  // a translated site: saying "languages examined: fr" would imply a choice
  // nobody made.
  if (scanned.size + discoveredOnly.length < 2) return undefined;

  return { scanned: [...scanned].sort(), discoveredOnly: discoveredOnly.sort() };
}
