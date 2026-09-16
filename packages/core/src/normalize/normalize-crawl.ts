/**
 * Milestone 8: the two custom checks that judge the crawl's own results
 * rather than any one page's content - robots-blocks-indexing and
 * broken-internal-link. Unlike every other custom check, neither has a
 * successfully-scanned page to attach to in the failing case (a
 * robots-blocked homepage is never visited at all; a broken target page
 * is never scanned past a 404 or a network failure), so this runs once
 * per audit from NormalizeAuditInput.crawl directly, not per page via
 * collectCandidates' page loop.
 *
 * robots-blocks-indexing and http-error-status (the target page's own
 * bad status) are deliberately not the same check: Lighthouse's own
 * http-status-code audit (seo category, not excluded) already flags a
 * visited page that returns a bad status. What Lighthouse cannot do is
 * say which page(s) link to a broken target at all - it audits one page
 * in isolation and has no notion of "internal link", and it never even
 * runs on a page the crawler could not visit (a network-level failure).
 * broken-internal-link fills exactly that gap: it is a statement about
 * the link, not the target.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const ROBOTS_BLOCKS_INDEXING_RULE_ID = 'robots-blocks-indexing';
export const BROKEN_INTERNAL_LINK_RULE_ID = 'broken-internal-link';
export const ROBOTS_DISALLOW_BROAD_RULE_ID = 'robots-disallow-broad';
export const AI_CRAWLER_BLOCKED_RULE_ID = 'ai-crawler-blocked';

/** At or above this many discovered URLs blocked by one Disallow
 *  pattern, the pattern is broad enough to flag - conservative on
 *  purpose (blocking one or two specific pages, like /panier or
 *  /admin, is ordinary and often deliberate), so this only fires once
 *  the pattern is clearly excluding a real section of the site rather
 *  than a couple of targeted paths. */
const BROAD_DISALLOW_MIN_MATCHED_PAGES = 3;

export type CrawlPageStatus =
  | 'visited'
  /** Crawled for links, never scanned; see ManifestPageStatus. Carries no
   *  findings, but is still a discovered URL for robots-pattern tallies. */
  | 'discovered-not-scanned'
  | 'skipped-robots'
  | 'skipped-non-html'
  | 'skipped-external-redirect'
  /** Navigated to a non-2xx response (issue #39). Kept in sync with
   *  ManifestPageStatus by hand; historical manifests recorded the same
   *  outcome as 'visited', which isBrokenTarget still reads. */
  | 'http-error-status'
  /** A resolved 200 whose content belongs to another URL (issue #85), not
   *  a broken target - isBrokenTarget must not flag it. Kept in sync with
   *  ManifestPageStatus by hand. */
  | 'redirect-interstitial'
  | 'error';

export interface CrawlPageInput {
  url: string;
  status: CrawlPageStatus;
  httpStatus?: number;
  /** Crawl depth from the start URL (0 for the start URL itself). Optional
   *  so manifests predating the field still parse; it feeds only the
   *  site-level anchor choice in normalize.ts (issue #101): when the start
   *  URL was never content-checked, the shallowest content-checked page is
   *  the closest thing to a homepage to anchor a site-wide fact to. */
  depth?: number;
  /** The one page that first linked to this URL, if any. Absent for the
   *  start URL itself. */
  discoveredFrom?: string;
}

export interface NormalizeCrawlInput {
  startUrl: string;
  pages: CrawlPageInput[];
  /** Milestone 8.5a. For every robots.txt Disallow pattern that was the
   *  actual winning (blocking) rule for at least one discovered URL, how
   *  many URLs it blocked - computed by scanner (packages/scanner/src/
   *  crawl.ts), since judging which pattern wins needs robots.ts's own
   *  longest-match-wins logic, which core does not and must not depend
   *  on. Optional so offline re-normalization against a pre-8.5a
   *  manifest still works, just without robots-disallow-broad. */
  robotsDisallowMatches?: { pattern: string; matchedPageCount: number }[];
  /** Milestone 8.6. Computed by scanner (robots.ts's checkAiCrawlerAccess)
   *  from the same already-fetched robots.txt text used for
   *  robotsDisallowMatches above - only agents actually blocked from the
   *  site root are included. Optional so a manifest from before this
   *  milestone still parses, with no ai-crawler-blocked findings. */
  aiCrawlerBlocks?: { agent: string; disallowPattern: string }[];
}

function isBrokenTarget(page: CrawlPageInput): boolean {
  if (page.status === 'error') return true;
  if (page.status === 'http-error-status') return true;
  // Historical manifests recorded a 404 target as 'visited' (issue #39
  // predates the dedicated status), so the old shape must keep firing or
  // re-normalizing an old audit would silently drop its broken links.
  return page.status === 'visited' && page.httpStatus !== undefined && page.httpStatus >= 400;
}

export function extractCrawlCandidates(input: NormalizeCrawlInput): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];

  const homepage = input.pages.find((page) => page.url === input.startUrl);
  if (homepage?.status === 'skipped-robots') {
    candidates.push({
      source: 'custom',
      ruleId: ROBOTS_BLOCKS_INDEXING_RULE_ID,
      category: 'seo',
      severity: severityFromCustom(ROBOTS_BLOCKS_INDEXING_RULE_ID),
      wcagCriteria: [],
      title: "robots.txt blocks the site's own homepage",
      description:
        "This site's robots.txt disallows crawling the homepage itself. Search engines that respect robots.txt cannot index anything, since the homepage is where discovery starts for a site with no other known entry point.",
      pageUrl: input.startUrl,
      element: null,
      rawEvidenceForPage: {},
    });
  }

  for (const match of input.robotsDisallowMatches ?? []) {
    if (match.matchedPageCount < BROAD_DISALLOW_MIN_MATCHED_PAGES) continue;
    candidates.push({
      source: 'custom',
      ruleId: ROBOTS_DISALLOW_BROAD_RULE_ID,
      category: 'seo',
      severity: severityFromCustom(ROBOTS_DISALLOW_BROAD_RULE_ID),
      wcagCriteria: [],
      title: 'robots.txt rule blocks a large part of the site',
      description: `The robots.txt rule "Disallow: ${match.pattern}" blocks at least ${match.matchedPageCount} pages this audit found during the crawl from being indexed. If this is not deliberate, review whether the pattern is broader than intended.`,
      pageUrl: input.startUrl,
      element: null,
      rawEvidenceForPage: { pattern: match.pattern, matchedPageCount: match.matchedPageCount },
    });
  }

  for (const block of input.aiCrawlerBlocks ?? []) {
    candidates.push({
      source: 'custom',
      ruleId: AI_CRAWLER_BLOCKED_RULE_ID,
      category: 'geo',
      severity: severityFromCustom(AI_CRAWLER_BLOCKED_RULE_ID),
      wcagCriteria: [],
      title: `robots.txt blocks ${block.agent} from crawling this site`,
      description: `This site's robots.txt disallows ${block.agent} (matched by the rule "Disallow: ${block.disallowPattern}") from the site root. If this is deliberate, no action is needed; if not, this agent cannot read the site at all, which means it cannot cite or reference it in AI-generated answers.`,
      pageUrl: input.startUrl,
      element: {
        pageUrl: input.startUrl,
        // Synthetic, not a DOM selector - same "a real, derived
        // identifier, never a sentinel" reasoning broken-internal-link's
        // own element comment gives, needed here so distinct agents stay
        // distinct fine groups (dedupeKey includes selector) before
        // aggregateSharedScopeOccurrences collapses same-page occurrences
        // of this rule back into one finding with per-agent evidence.
        selector: `robots.txt: User-agent: ${block.agent}`,
        snippet: `Disallow: ${block.disallowPattern}`,
      },
      rawEvidenceForPage: { agent: block.agent, disallowPattern: block.disallowPattern },
    });
  }

  for (const page of input.pages) {
    if (!page.discoveredFrom || !isBrokenTarget(page)) continue;
    candidates.push({
      source: 'custom',
      ruleId: BROKEN_INTERNAL_LINK_RULE_ID,
      category: 'seo',
      severity: severityFromCustom(BROKEN_INTERNAL_LINK_RULE_ID),
      wcagCriteria: [],
      title: 'Internal link points to a broken page',
      description:
        page.status === 'error'
          ? `This page links to ${page.url}, which could not be reached during the crawl.`
          : `This page links to ${page.url}, which returned HTTP ${page.httpStatus}.`,
      pageUrl: page.discoveredFrom,
      // Not a DOM-queried selector (the crawler only captures hrefs, not
      // element positions) but a real, derived one, not a sentinel: an
      // attribute selector built from the actual href discovered during
      // the crawl. This also keeps the dedupe key (source|ruleId|
      // selector) distinct per (source, target) pair - without it, every
      // broken-internal-link candidate would share one empty selector
      // and merge into a single finding regardless of which page links
      // to which broken target, exactly the cross-selector conflation
      // CLAUDE.md's dedupe/aggregation trade-off warns about.
      element: {
        pageUrl: page.discoveredFrom,
        selector: `a[href="${page.url}"]`,
        snippet: `Links to ${page.url}`,
      },
      rawEvidenceForPage: {
        targetUrl: page.url,
        targetStatus: page.status,
        targetHttpStatus: page.httpStatus,
      },
    });
  }

  return candidates;
}
