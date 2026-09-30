import type { ManifestPageEntry } from '../types/manifest.js';
import { normalizeUrlIdentity } from './url-identity.js';

/**
 * Plan 075 M3. A URL that differs from an analysed page only by its query
 * string is usually that page again: a booking engine's dated room link
 * (`/fr/chambre/x?info[arrival_date]=…`), a tracking tag (`?_gl=…&gclid=…`)
 * or a menu state (`?menu-booking=spa`). Analysed as pages, the copies
 * counted each defect again: coin-savoyard's 30 copies carried 16 separate
 * serious `hreflang-no-return-link` findings, each because the copy's own
 * hreflang pointed to the clean page.
 *
 * Two pieces of stored evidence mark a copy, and the page without the query
 * must itself be analysed, so a URL reached only with its query stays the
 * page:
 *  - the page declares the query-less URL as its canonical (the site says
 *    so: coin-savoyard, grandhoteldesalpes, bellevigne-hotels);
 *  - or its raw document is the query-less page's, text signature for text
 *    signature (yonahotel's tracking and menu parameters, no canonical).
 *
 * A page whose query selects other content (`?rate_id=170830`, different
 * text, no canonical) stays analysed, and so does a URL another page
 * declares as its hreflang alternate: that is a language version the site
 * names, whose served language the hreflang rules must still read
 * (clos-sainte-marie's `/?lang=en`, plan 075 L5).
 */

/** The stored facts of one scanned page this pass reads. */
export interface QueryVariantFacts {
  pageUrl: string;
  canonicalUrls: readonly string[];
  /** The page's hreflang alternates, absolute or relative to the page. */
  hreflangUrls?: readonly string[];
  rawTextSignature?: string;
}

function withoutQuery(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.search === '') return undefined;
    parsed.search = '';
    return normalizeUrlIdentity(parsed.toString());
  } catch {
    return undefined;
  }
}

/** The facts of a stored scan.json, as both the scan-time and refresh paths
 *  hold it. */
export function queryVariantFactsOf(page: {
  url: string;
  headMetadata?:
    | {
        canonicalUrls?: readonly string[];
        hreflangLinks?: readonly { href: string }[];
      }
    | undefined;
  renderDiff?: { rawDocument?: { textSignature: string } | undefined } | undefined;
}): QueryVariantFacts {
  const signature = page.renderDiff?.rawDocument?.textSignature;
  return {
    pageUrl: page.url,
    canonicalUrls: page.headMetadata?.canonicalUrls ?? [],
    hreflangUrls: (page.headMetadata?.hreflangLinks ?? []).map((link) => link.href),
    ...(signature !== undefined ? { rawTextSignature: signature } : {}),
  };
}

/** Returns the entries with each `visited` query copy of another `visited`
 *  page re-marked `query-variant`, its coverage set aside. Every other entry
 *  is returned unchanged. */
export function markQueryVariants(
  entries: readonly ManifestPageEntry[],
  facts: readonly QueryVariantFacts[],
): ManifestPageEntry[] {
  const identity = (url: string): string => normalizeUrlIdentity(url) ?? url;
  const factsByPage = new Map(facts.map((fact) => [identity(fact.pageUrl), fact]));
  const visited = new Set(
    entries.filter((entry) => entry.status === 'visited').map((entry) => identity(entry.url)),
  );
  const resolve = (href: string, base: string): string | undefined => {
    try {
      return identity(new URL(href, base).toString());
    } catch {
      return undefined;
    }
  };
  const declaredAlternates = new Set<string>();
  // Declared by a page without a query: a dated copy naming its English
  // dated copy declares nothing about the site's language versions.
  for (const fact of facts) {
    if (!visited.has(identity(fact.pageUrl)) || withoutQuery(fact.pageUrl) !== undefined) continue;
    for (const href of fact.hreflangUrls ?? []) {
      const alternate = resolve(href, fact.pageUrl);
      if (alternate !== undefined && alternate !== identity(fact.pageUrl)) {
        declaredAlternates.add(alternate);
      }
    }
  }

  return entries.map((entry) => {
    if (entry.status !== 'visited') return entry;
    const base = withoutQuery(entry.url);
    if (base === undefined || !visited.has(base)) return entry;
    if (declaredAlternates.has(identity(entry.url))) return entry;
    const fact = factsByPage.get(identity(entry.url));
    if (fact === undefined) return entry;
    const canonicals = new Set(
      fact.canonicalUrls.flatMap((href) => {
        const canonical = resolve(href, entry.url);
        return canonical === undefined ? [] : [canonical];
      }),
    );
    const declaresBase = canonicals.size === 1 && canonicals.has(base);
    const baseSignature = factsByPage.get(base)?.rawTextSignature;
    const sameDocument =
      fact.rawTextSignature !== undefined && fact.rawTextSignature === baseSignature;
    if (!declaresBase && !sameDocument) return entry;
    const { analysisCoverage, ...rest } = entry;
    return {
      ...rest,
      status: 'query-variant' as const,
      variantOfUrl: base,
      ...(analysisCoverage !== undefined ? { setAsideAnalysisCoverage: analysisCoverage } : {}),
    };
  });
}
