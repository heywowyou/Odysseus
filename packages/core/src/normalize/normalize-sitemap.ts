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
  fetchError?: string;
  /** Every page the crawl actually visited, so staleness can be judged
   *  by how well the sitemap's own URL list matches what is really
   *  there - not by an arbitrary "how old is too old" date threshold. */
  crawledUrls: string[];
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

function missingCandidate(pageUrl: string, description: string, rawEvidenceForPage: Record<string, unknown>): FindingCandidate[] {
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

export function extractSitemapCandidates(input: SitemapCheckInput): FindingCandidate[] {
  const { pageUrl } = input;

  if (!input.found) {
    return missingCandidate(
      pageUrl,
      `No sitemap could be fetched, neither from a Sitemap: directive in robots.txt nor from the conventional /sitemap.xml location${input.fetchError ? ` (${input.fetchError})` : ''}. A sitemap helps search engines discover and prioritize pages, especially on sites without strong internal linking.`,
      { fetchError: input.fetchError },
    );
  }

  // A sitemap index lists other sitemap files, not pages directly - this
  // milestone does not fetch and validate every referenced sub-sitemap,
  // so staleness cannot be judged reliably here. The index itself being
  // reachable is enough to not flag sitemap-missing either.
  if (input.isSitemapIndex || input.crawledUrls.length === 0) {
    return [];
  }

  // A 200 response with zero listed pages is functionally no sitemap at
  // all (confirmed against a real SPA dev server whose catch-all route
  // served index.html at /sitemap.xml - a 200 with no real <loc> tags),
  // not a "sitemap exists but is out of date" case, so this reports
  // missing rather than falling through to the staleness ratio below,
  // which would otherwise always trip at 0 matched pages regardless of
  // site size.
  if (input.entries.length === 0) {
    return missingCandidate(
      pageUrl,
      `A sitemap URL responded, but no page entries could be read from it (${input.sitemapUrl ?? 'unknown URL'}). A sitemap with no listed pages provides no benefit to search engines.`,
      { sitemapUrl: input.sitemapUrl },
    );
  }

  const sitemapUrlSet = new Set(input.entries.map((entry) => normalizeUrl(entry.url, pageUrl)));
  const matchedCount = input.crawledUrls.filter((url) => sitemapUrlSet.has(normalizeUrl(url, pageUrl))).length;
  const matchRatio = matchedCount / input.crawledUrls.length;

  if (matchRatio < STALE_MATCH_RATIO_THRESHOLD) {
    return [
      {
        source: 'custom',
        ruleId: SITEMAP_STALE_RULE_ID,
        category: 'seo',
        severity: severityFromCustom(SITEMAP_STALE_RULE_ID),
        wcagCriteria: [],
        title: 'Sitemap does not reflect the current site',
        description: `Only ${matchedCount} of ${input.crawledUrls.length} pages this audit actually found appear in the sitemap (${input.entries.length} URLs listed). A sitemap that has drifted from the real site can mislead search engines about which pages exist.`,
        pageUrl,
        element: null,
        rawEvidenceForPage: {
          sitemapEntryCount: input.entries.length,
          crawledPageCount: input.crawledUrls.length,
          matchedCount,
        },
      },
    ];
  }

  return [];
}
