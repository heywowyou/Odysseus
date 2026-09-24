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
  // A sitemap entry that answered a definite 404 was reached: the stale
  // entry is the site's fact, not the crawl being turned away.
  const expectedPageCount = sitemap.eligiblePageCount - (sitemap.settledUnscannedPageCount ?? 0);
  if (expectedPageCount <= 0) return false;
  return sitemap.scannedPageCount / expectedPageCount < MIN_SITEMAP_SCANNED_SHARE;
}

/** Evaluates whether the crawl facts can support a full client report. The
 * input intentionally contains only persisted inventory facts, allowing the
 * same decision immediately after crawling and before any later regeneration. */
export function assessCrawlCoverage(input: CrawlCoverageGateInput): CrawlCoverageAssessment {
  const failedHttpStatusCounts = new Map<number, number>();
  let failedUrlCount = 0;

  for (const page of input.pages) {
    if (page.status !== 'http-error-status' && page.status !== 'blocked' && page.status !== 'error')
      continue;
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

/** An unbroken run of navigations this long, each ending in a connection
 * refusal (see connectionRefusalCode), ends the crawl. Short enough to stop
 * sending requests to a host that has banned the crawler, long enough that a
 * couple of dropped connections on a flaky host do not end an audit. */
export const HOST_REFUSAL_STOP_THRESHOLD = 5;

/** The crawl's record of a host that stopped answering it. */
export interface HostStoppedAnswering {
  /** Navigations that received an HTTP response before the refusals began. */
  answeredNavigationCount: number;
  /** The unbroken run of refused navigations that ended the crawl. */
  refusedNavigationCount: number;
  /** The Chromium network error of the last refusal, e.g. ERR_EMPTY_RESPONSE. */
  errorCode: string;
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Deliberate stop, like CrawlCoverageInsufficientError, for a host that
 * blocks the crawler's IP address. Its message says a slower crawl will not
 * help, which is what separates it from the coverage gate's advice. */
export class HostStoppedAnsweringError extends Error {
  readonly stop: HostStoppedAnswering;

  constructor(stop: HostStoppedAnswering) {
    const refused = pluralize(stop.refusedNavigationCount, 'request');
    const what =
      stop.answeredNavigationCount === 0
        ? `the site answered none of the crawl's requests: the first ${refused} were closed without a response (${stop.errorCode})`
        : `after answering ${pluralize(stop.answeredNavigationCount, 'page')}, the site closed the next ${refused} without a response (${stop.errorCode})`;
    super(
      `The site stopped answering the crawl: ${what}. This is how a server that blocks an IP address behaves, so a slower crawl will not help. The crawl stopped early rather than keep sending requests. Ask the site owner to allowlist the crawler, then run a new audit.`,
    );
    this.name = 'HostStoppedAnsweringError';
    this.stop = stop;
  }
}
