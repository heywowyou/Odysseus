/**
 * Milestone 8.5a: fetches the target of a page's canonical tag when it
 * points to a different URL than the page itself, and reports whether
 * that target is reachable and indexable. A canonical tag says "this
 * other URL is the definitive version" - if that URL is broken or itself
 * excluded from indexing, the signal is contradictory.
 *
 * Deliberately skips a self-referencing canonical (the page's own HTTP
 * status and robots meta are already known from this same scan - nothing
 * new to check) and pages with more than one canonical tag (already
 * covered by normalize-head-metadata.ts's canonical-conflicting check;
 * fetching either target there would be guessing which one is "the"
 * canonical). Only the single-target cross-page case needs a network
 * call, keeping this to the minimum extra request per page that actually
 * has something new to check.
 *
 * A plain fetch(), not a Playwright navigation: this only needs the raw
 * HTML text for a single regex-based robots-meta read, not a rendered
 * DOM, matching the "hand-rolled over structured-but-simple text"
 * precedent in sitemap.ts and mentions-legales.ts.
 */

export interface CanonicalTargetCheckResult {
  pageUrl: string;
  canonicalUrl: string;
  httpStatus?: number;
  fetchError?: string;
  noindex: boolean;
}

const META_TAG_PATTERN = /<meta[^>]*>/gi;
const ROBOTS_NAME_PATTERN = /name\s*=\s*["']robots["']/i;
const CONTENT_VALUE_PATTERN = /content\s*=\s*["']([^"']*)["']/i;

/** Pure: scans raw HTML text for a <meta name="robots" content="..."> tag
 *  and returns its lowercased content, or null if absent. Exported
 *  separately so this is unit-testable without a network call, matching
 *  head-metadata.ts's parseJsonLdBlocks precedent. */
export function extractRobotsMetaContent(html: string): string | null {
  for (const match of html.matchAll(META_TAG_PATTERN)) {
    const tag = match[0];
    if (!ROBOTS_NAME_PATTERN.test(tag)) continue;
    const content = tag.match(CONTENT_VALUE_PATTERN);
    if (content?.[1]) return content[1].toLowerCase();
  }
  return null;
}

export async function checkCanonicalTarget(
  pageUrl: string,
  canonicalHref: string,
  timeoutMs: number,
): Promise<CanonicalTargetCheckResult | null> {
  let resolved: string;
  try {
    resolved = new URL(canonicalHref, pageUrl).href;
  } catch {
    return null;
  }
  if (resolved === pageUrl) return null;

  try {
    const response = await fetch(resolved, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      return { pageUrl, canonicalUrl: resolved, httpStatus: response.status, noindex: false };
    }
    const html = await response.text();
    const robotsContent = extractRobotsMetaContent(html);
    return {
      pageUrl,
      canonicalUrl: resolved,
      httpStatus: response.status,
      noindex: robotsContent?.includes('noindex') ?? false,
    };
  } catch (error) {
    return {
      pageUrl,
      canonicalUrl: resolved,
      noindex: false,
      fetchError: error instanceof Error ? error.message : String(error),
    };
  }
}
