/**
 * Milestone 8: violation judgment for the sitemap.xml checks. Same
 * scanner-extracts/core-decides split as every other custom check.
 * Site-level, not per-page - both findings attribute to whichever page
 * packages/scanner/src/scan-site.ts chose to attach the check to (the
 * homepage), the same "attribute a site-level fact to the one page every
 * site has" pattern the LCEN mentions-legales check already established
 * for a site with no dedicated legal-notice page.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const SITEMAP_MISSING_RULE_ID = 'sitemap-missing';
export const SITEMAP_STALE_RULE_ID = 'sitemap-stale';
export const SITEMAP_ORPHAN_PAGE_RULE_ID = 'sitemap-orphan-page';
export const SITEMAP_LISTS_REDIRECTS_RULE_ID = 'sitemap-lists-redirects';

export interface SitemapEntryInput {
  url: string;
  lastmod?: string;
}

export interface SitemapCheckInput {
  pageUrl: string;
  sitemapUrl?: string;
  found: boolean;
  isSitemapIndex: boolean;
  entries: SitemapEntryInput[];
  /** Milestone 9b.5 flattened page entries across recursively resolved
   *  sitemap indexes. Absent on historical scan artifacts. */
  pageEntries?: SitemapEntryInput[];
  fetchedDocuments?: {
    url: string;
    isRoot: boolean;
    isSitemapIndex: boolean;
    entryCount: number;
  }[];
  fetchedSitemapUrls?: string[];
  fetchErrors?: { url: string; error: string }[];
  fetchError?: string;
  /** Sitemap URLs that the crawl resolved as redirects. They remain in the
   *  sitemap population for a separate, minor hygiene finding rather than
   *  contaminating stale/orphan absence comparisons. */
  redirectedUrls?: string[];
  /** Plan 075 I1: sitemap URLs that are real pages in another language,
   *  left unanalysed because the site sent our French browser to their
   *  translation. Neither redirects nor absent pages, so they are counted
   *  by no sitemap rule and left out of the stale and orphan comparisons. */
  languageAlternateUrls?: string[];
  /** Every page the crawl actually visited, so staleness can be judged
   *  by how well the sitemap's own URL list matches what is really
   *  there - not by an arbitrary "how old is too old" date threshold. */
  crawledUrls: string[];
  /** Milestone 8.5a: every URL the crawl discovered at all - visited,
   *  robots-skipped, non-HTML-skipped, or errored - not only the visited
   *  subset crawledUrls tracks. A page skipped for one of those reasons
   *  was still found via a real internal link, so it is not an orphan;
   *  crawledUrls alone would over-report orphans for exactly those
   *  pages. Used only by the sitemap-orphan-page check below; staleness
   *  above rightly keeps using crawledUrls, since it is judged against
   *  pages that were actually scanned. */
  discoveredUrls: string[];
}

/** Below this fraction of actually-crawled pages appearing in the
 *  sitemap, the sitemap is stale enough to flag - conservative on
 *  purpose (a real site legitimately has some pages a sitemap chooses to
 *  omit, e.g. pagination or filtered views), so this only fires when the
 *  mismatch is large. */
const STALE_MATCH_RATIO_THRESHOLD = 0.5;

function normalizeUrl(href: string, pageUrl: string): string {
  try {
    const url = new URL(href, pageUrl);
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch {
    return href;
  }
}

function missingCandidate(
  pageUrl: string,
  description: string,
  rawEvidenceForPage: Record<string, unknown>,
): FindingCandidate[] {
  return [
    {
      source: 'custom',
      ruleId: SITEMAP_MISSING_RULE_ID,
      category: 'seo',
      severity: severityFromCustom(SITEMAP_MISSING_RULE_ID),
      wcagCriteria: [],
      title: 'No sitemap.xml found',
      description,
      pageUrl,
      element: null,
      rawEvidenceForPage,
    },
  ];
}

function isOffSiteUrl(href: string, pageUrl: string): boolean {
  try {
    return (
      new URL(href, pageUrl).hostname.toLowerCase() !== new URL(pageUrl).hostname.toLowerCase()
    );
  } catch {
    return false;
  }
}

export function extractSitemapCandidates(input: SitemapCheckInput): FindingCandidate[] {
  const { pageUrl } = input;

  if (!input.found) {
    return missingCandidate(
      pageUrl,
      `No sitemap could be fetched, neither from a Sitemap: directive in robots.txt nor from the conventional /sitemap.xml location${input.fetchError ? ` (${input.fetchError})` : ''}. A sitemap helps search engines discover and prioritize pages, especially on sites without strong internal linking.`,
      { fetchError: input.fetchError },
    );
  }

  // Historical artifacts only recorded a sitemap index's root entries,
  // which are document URLs rather than pages. Keep ignoring those old
  // roots; new artifacts carry recursively flattened pageEntries and can
  // be judged normally.
  if (input.isSitemapIndex && input.pageEntries === undefined) return [];

  const pageEntries = input.pageEntries ?? input.entries;

  // A resolved index with no readable child page entries is incomplete
  // coverage, disclosed from manifest metadata rather than mislabeled as
  // a missing root sitemap or judged stale against an empty set.
  if (input.isSitemapIndex && pageEntries.length === 0) return [];

  // A 200 response with zero listed pages is functionally no sitemap at
  // all (confirmed against a real SPA dev server whose catch-all route
  // served index.html at /sitemap.xml - a 200 with no real <loc> tags),
  // not a "sitemap exists but is out of date" case, so this reports
  // missing rather than falling through to the staleness ratio below,
  // which would otherwise always trip at 0 matched pages regardless of
  // site size.
  if (pageEntries.length === 0) {
    return missingCandidate(
      pageUrl,
      `A sitemap URL responded, but no page entries could be read from it (${input.sitemapUrl ?? 'unknown URL'}). A sitemap with no listed pages provides no benefit to search engines.`,
      { sitemapUrl: input.sitemapUrl },
    );
  }

  const candidates: FindingCandidate[] = [];

  const languageAlternateSet = new Set(
    (input.languageAlternateUrls ?? []).map((url) => normalizeUrl(url, pageUrl)),
  );
  const redirectedSet = new Set(
    (input.redirectedUrls ?? [])
      .map((url) => normalizeUrl(url, pageUrl))
      .filter((url) => !languageAlternateSet.has(url)),
  );
  const redirectedUrls = pageEntries
    .map((entry) => normalizeUrl(entry.url, pageUrl))
    .filter((url) => redirectedSet.has(url));
  const externalUrls = pageEntries
    .map((entry) => normalizeUrl(entry.url, pageUrl))
    .filter((url) => isOffSiteUrl(url, pageUrl));
  const excludedFromComparisons = new Set([
    ...redirectedUrls,
    ...externalUrls,
    ...languageAlternateSet,
  ]);
  const eligiblePageEntries = pageEntries.filter(
    (entry) => !excludedFromComparisons.has(normalizeUrl(entry.url, pageUrl)),
  );

  if (redirectedUrls.length > 0 || externalUrls.length > 0) {
    candidates.push({
      source: 'custom',
      ruleId: SITEMAP_LISTS_REDIRECTS_RULE_ID,
      category: 'seo',
      severity: severityFromCustom(SITEMAP_LISTS_REDIRECTS_RULE_ID),
      wcagCriteria: [],
      title: 'The sitemap lists redirected or off-site URLs',
      description: `The sitemap contains ${redirectedUrls.length} redirected URL(s) and ${externalUrls.length} off-site URL(s). Keep its entries on the site's final, canonical pages so search engines receive a reliable map of the site.`,
      pageUrl,
      element: null,
      rawEvidenceForPage: { redirectedUrls, externalUrls },
    });
  }

  // A sitemap made entirely of redirected/off-site URLs still has a useful
  // distinct finding, but there is no eligible population against which to
  // make a stale or orphan claim.
  if (eligiblePageEntries.length === 0) return candidates;
  if (input.crawledUrls.length === 0) return candidates;

  const sitemapUrlSet = new Set(
    eligiblePageEntries.map((entry) => normalizeUrl(entry.url, pageUrl)),
  );
  const matchedCount = input.crawledUrls.filter((url) =>
    sitemapUrlSet.has(normalizeUrl(url, pageUrl)),
  ).length;
  const matchRatio = matchedCount / input.crawledUrls.length;

  if (matchRatio < STALE_MATCH_RATIO_THRESHOLD) {
    candidates.push({
      source: 'custom',
      ruleId: SITEMAP_STALE_RULE_ID,
      category: 'seo',
      severity: severityFromCustom(SITEMAP_STALE_RULE_ID),
      wcagCriteria: [],
      title: 'Sitemap does not reflect the current site',
      description: `Only ${matchedCount} of ${input.crawledUrls.length} pages this audit actually found appear in the sitemap (${eligiblePageEntries.length} eligible URLs listed). A sitemap that has drifted from the real site can mislead search engines about which pages exist.`,
      pageUrl,
      element: null,
      rawEvidenceForPage: {
        sitemapEntryCount: eligiblePageEntries.length,
        crawledPageCount: input.crawledUrls.length,
        matchedCount,
      },
    });
  }

  // Milestone 8.5a: independent of staleness above - a sitemap can be
  // both a good match for the crawled pages and still list URLs the
  // crawl never found through any internal link at all.
  const discoveredSet = new Set(input.discoveredUrls.map((url) => normalizeUrl(url, pageUrl)));
  const orphanUrls = eligiblePageEntries
    .map((entry) => entry.url)
    .filter((url) => !discoveredSet.has(normalizeUrl(url, pageUrl)));

  if (orphanUrls.length > 0) {
    const preview = orphanUrls.slice(0, 3);
    candidates.push({
      source: 'custom',
      ruleId: SITEMAP_ORPHAN_PAGE_RULE_ID,
      category: 'seo',
      severity: severityFromCustom(SITEMAP_ORPHAN_PAGE_RULE_ID),
      wcagCriteria: [],
      title: 'Sitemap lists pages not reachable through the site itself',
      description: `${orphanUrls.length} URL(s) in the sitemap were never found through any internal link during this crawl, for example: ${preview.join(', ')}. A page with no internal path to it depends entirely on the sitemap for discovery.`,
      pageUrl,
      element: null,
      rawEvidenceForPage: { orphanUrls },
    });
  }

  return candidates;
}
