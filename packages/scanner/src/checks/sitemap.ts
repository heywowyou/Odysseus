/**
 * Milestone 8: sitemap.xml raw-fact extraction. Site-level, not per-page
 * (there is one sitemap per site, not one per page) - runs once per
 * crawl, in scan-site.ts, after the crawl finishes, and its result is
 * attached only to the homepage's scan.json, the same "attribute a
 * site-level fact to the one page every site has" pattern
 * mentions-legales already established for the LCEN check when no
 * dedicated legal-notice page exists.
 *
 * Same split as every other custom check: this module only reports what
 * it found (does the sitemap exist, what URLs does it list); core's
 * normalize-sitemap.ts decides whether that counts as missing or stale,
 * by comparing against the crawl's own list of visited pages.
 *
 * Hand-rolled <loc>/<lastmod> extraction via regex rather than an XML
 * parser dependency, matching this codebase's existing "no HTML/XML
 * parser added to the dependency tree" precedent (extract-text.ts,
 * mentions-legales.ts) - sitemap XML's shape is simple and stable enough
 * that a full parser buys nothing here.
 */

const LOC_PATTERN = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
const LASTMOD_PATTERN = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/i;
/** A sitemap index references other sitemap files instead of listing
 *  pages directly; detecting the root tag lets the caller decide not to
 *  treat those <loc> entries as page URLs. */
const SITEMAP_INDEX_PATTERN = /<sitemapindex[\s>]/i;

export interface SitemapEntry {
  url: string;
  lastmod?: string;
}

export interface SitemapCheckResult {
  /** The URL actually fetched successfully, if any. */
  sitemapUrl?: string;
  found: boolean;
  isSitemapIndex: boolean;
  entries: SitemapEntry[];
  fetchError?: string;
}

/** Pure: extracts <loc>/<lastmod> pairs from raw sitemap XML text.
 *  Splitting on <url>/<sitemap> block boundaries before matching within
 *  each block (rather than matching <loc> and <lastmod> globally and
 *  hoping they line up) keeps each entry's lastmod correctly paired with
 *  its own loc, without a full XML parser dependency - matching this
 *  codebase's existing "hand-rolled over structured-but-simple text"
 *  precedent (extract-text.ts, mentions-legales.ts). */
export function parseSitemapXml(xml: string): { isSitemapIndex: boolean; entries: SitemapEntry[] } {
  const isSitemapIndex = SITEMAP_INDEX_PATTERN.test(xml);
  const entries: SitemapEntry[] = [];
  const blocks = xml.split(/<url>|<sitemap>/i).slice(1);
  for (const block of blocks) {
    const locMatch = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i);
    if (!locMatch?.[1]) continue;
    const lastmodMatch = block.match(LASTMOD_PATTERN);
    entries.push({
      url: locMatch[1],
      ...(lastmodMatch?.[1] ? { lastmod: lastmodMatch[1] } : {}),
    });
  }
  // Fallback for XML that doesn't use <url>/<sitemap> wrapper elements
  // (technically non-conformant, but seen in the wild) - just take every
  // <loc> at face value with no lastmod pairing.
  if (entries.length === 0) {
    for (const match of xml.matchAll(LOC_PATTERN)) {
      if (match[1]) entries.push({ url: match[1] });
    }
  }
  return { isSitemapIndex, entries };
}

async function tryFetchSitemap(
  url: string,
  timeoutMs: number,
): Promise<{ xml: string } | { error: string }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    return { xml: await response.text() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Tries every Sitemap: URL declared in robots.txt first (the
 * authoritative source when present), then falls back to the
 * conventional /sitemap.xml location, since many sites publish one
 * without declaring it in robots.txt at all. Stops at the first
 * successful fetch.
 */
export async function checkSitemap(
  origin: string,
  declaredSitemapUrls: readonly string[],
  timeoutMs: number,
): Promise<SitemapCheckResult> {
  const fallbackUrl = new URL('/sitemap.xml', origin).href;
  const candidates = declaredSitemapUrls.includes(fallbackUrl)
    ? declaredSitemapUrls
    : [...declaredSitemapUrls, fallbackUrl];

  let lastError: string | undefined;
  for (const candidate of candidates) {
    const result = await tryFetchSitemap(candidate, timeoutMs);
    if ('xml' in result) {
      const { isSitemapIndex, entries } = parseSitemapXml(result.xml);
      return { sitemapUrl: candidate, found: true, isSitemapIndex, entries };
    }
    lastError = result.error;
  }

  return {
    found: false,
    isSitemapIndex: false,
    entries: [],
    ...(lastError !== undefined ? { fetchError: lastError } : {}),
  };
}
