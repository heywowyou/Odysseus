import type { SitemapCoverageSummary } from './types/manifest.js';

/** A paid audit cannot credibly describe a site when more than this share
 * of the URLs it reached failed before content analysis. Equality remains
 * allowed so a small number of ordinary broken links does not turn into a
 * site-level stop. */
export const MAX_CRAWL_FAILURE_SHARE = 0.3;

/** Sitemap coverage is only a corroborating gate when the sitemap itself
 * gave the crawler a clean, uncapped inventory. Below this proportion, the
 * audit did not reach enough of what the site declares to be its pages. */
export const MIN_SITEMAP_SCANNED_SHARE = 0.7;

export type CrawlCoverageGateReason = 'crawl-failure-share' | 'sitemap-coverage';

export interface CrawlCoverageGatePage {
  status: string;
  httpStatus?: number;
}

export interface CrawlCoverageGateInput {
  pages: readonly CrawlCoverageGatePage[];
  sitemapCoverage?: SitemapCoverageSummary;
}

export interface CrawlCoverageAssessment {
  inventoriedUrlCount: number;
  failedUrlCount: number;
  failureShare: number;
  failedHttpStatusCounts: ReadonlyMap<number, number>;
  reasonCodes: readonly CrawlCoverageGateReason[];
}

function hasUnexplainedSitemapCoverageGap(sitemap: SitemapCoverageSummary | undefined): boolean {
  if (sitemap === undefined || sitemap.eligiblePageCount === 0) return false;
  if (
    sitemap.filteredPageCount !== 0 ||
    sitemap.capOmittedPageCount !== 0 ||
    sitemap.failedSitemapCount !== 0
  ) {
    return false;
  }
  return sitemap.scannedPageCount / sitemap.eligiblePageCount < MIN_SITEMAP_SCANNED_SHARE;
}

/** Evaluates whether the crawl facts can support a full client report. The
 * input intentionally contains only persisted inventory facts, allowing the
 * same decision immediately after crawling and before any later regeneration. */
export function assessCrawlCoverage(input: CrawlCoverageGateInput): CrawlCoverageAssessment {
  const failedHttpStatusCounts = new Map<number, number>();
  let failedUrlCount = 0;

  for (const page of input.pages) {
    if (page.status !== 'http-error-status' && page.status !== 'error') continue;
    failedUrlCount += 1;
    if (page.httpStatus !== undefined) {
      failedHttpStatusCounts.set(
        page.httpStatus,
        (failedHttpStatusCounts.get(page.httpStatus) ?? 0) + 1,
      );
    }
  }

  const inventoriedUrlCount = input.pages.length;
  const failureShare = inventoriedUrlCount === 0 ? 0 : failedUrlCount / inventoriedUrlCount;
  const reasonCodes: CrawlCoverageGateReason[] = [];
  if (failureShare > MAX_CRAWL_FAILURE_SHARE) reasonCodes.push('crawl-failure-share');
  if (hasUnexplainedSitemapCoverageGap(input.sitemapCoverage)) {
    reasonCodes.push('sitemap-coverage');
  }

  return {
    inventoriedUrlCount,
    failedUrlCount,
    failureShare,
    failedHttpStatusCounts,
    reasonCodes,
  };
}

function formatHttpStatusCounts(counts: ReadonlyMap<number, number>): string | undefined {
  if (counts.size === 0) return undefined;
  return [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([status, count]) => `${count} HTTP ${status}`)
    .join(', ');
}

/** The stable opening of a coverage-gate failure message, shared by the
 * error constructor and its stored-message recognizer below so the two
 * cannot drift. */
const GATE_MESSAGE_PREFIX = 'Audit coverage is too incomplete to generate a report: ';

/** Deliberate stop, not a scanner crash. Its message gives the operator the
 * factual reason and the safe next actions without suggesting a bypass. */
export class CrawlCoverageInsufficientError extends Error {
  readonly assessment: CrawlCoverageAssessment;

  constructor(assessment: CrawlCoverageAssessment) {
    const failureDetail = `${assessment.failedUrlCount} of ${assessment.inventoriedUrlCount} inventoried URLs failed (${Math.round(assessment.failureShare * 100)}%)`;
    const httpDetail = formatHttpStatusCounts(assessment.failedHttpStatusCounts);
    const sitemapDetail = assessment.reasonCodes.includes('sitemap-coverage')
      ? ' The sitemap also shows that the crawl reached too little of the site it declares.'
      : '';
    super(
      `${GATE_MESSAGE_PREFIX}${failureDetail}${httpDetail ? `, including ${httpDetail}` : ''}.${sitemapDetail} The site appears to be rejecting the crawl. Do not use this partial audit. Slow the crawl, request an allowlist, then run a new audit. The per-job crawl delay and scan concurrency options exist for this; they can only slow a crawl down, never speed it up.`,
    );
    this.name = 'CrawlCoverageInsufficientError';
    this.assessment = assessment;
  }
}

/** A job row persists a failed pipeline's message text only (store's
 * failJob), never the error class, so a stored coverage-gate stop is
 * recognizable only through this prefix. The pipeline classifies with
 * instanceof; this predicate exists for the server-side readers of a
 * stored row (plan 060 §5.3: the browser never parses an error sentence
 * itself). */
export function isCrawlCoverageGateMessage(message: string | undefined): boolean {
  return message !== undefined && message.startsWith(GATE_MESSAGE_PREFIX);
}

export function assertSufficientCrawlCoverage(input: CrawlCoverageGateInput): void {
  const assessment = assessCrawlCoverage(input);
  if (assessment.reasonCodes.length > 0) {
    throw new CrawlCoverageInsufficientError(assessment);
  }
}
