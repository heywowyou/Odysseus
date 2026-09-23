import { languagePrefixOf, type AuditManifest } from '@odysseus/core';

/**
 * 2026-08-25 Lagnonu review, item 1.3's remaining half. A real report said
 * "Perimetre : 43 pages analysees" for a site publishing French, English and
 * Spanish, having visited zero English and zero Spanish pages. The page cap
 * that caused that is gone, but nothing in the report ever stated which
 * languages were actually examined, so the same sentence would read exactly
 * the same way if a language were missed again for some other reason.
 *
 * A page's language is read from the site's own declarations, never guessed
 * from content: the first URL path segment when the site namespaces its
 * languages ("/fr/..."), else the page's declared <html lang> recorded in
 * the manifest (issue #290 - on a root-default site such as haaitza.com the
 * French pages live at "/" with no prefix, and prefix-only attribution
 * reported the site's main language as published-but-never-analysed).
 * Unprefixed pages scanned before this signal existed, or whose head
 * metadata failed to extract, have no attribution and are skipped - the
 * sentence states less rather than inventing a language.
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
    const declared = languagePrefixOf(page.url) ?? page.language;
    if (declared === undefined) continue;
    // Compared by primary subtag: a site whose French pages declare
    // <html lang="fr-FR"> at the root and whose bare /fr URL only redirects
    // there published French once, and it was analysed. Comparing "fr-fr"
    // with "fr" reported French as never analysed.
    const language = declared.toLowerCase().split(/[-_]/)[0];
    if (language === undefined || language === '') continue;
    if (page.status === 'visited') scanned.add(language);
    else discovered.add(language);
  }

  const discoveredOnly = [...discovered].filter((lang) => !scanned.has(lang));

  // One prefix is a site that happens to namespace its URLs, not evidence of
  // a translated site: saying "languages examined: fr" would imply a choice
  // nobody made.
  if (scanned.size + discoveredOnly.length < 2) return undefined;

  return { scanned: [...scanned].sort(), discoveredOnly: discoveredOnly.sort() };
}
