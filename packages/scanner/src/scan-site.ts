import * as fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright';
import {
  assertSufficientCrawlCoverage,
  type AuditConfigSnapshot,
  type CruxFieldDataResult,
  type PageAnalysisCoverage,
  type SitemapMode,
} from '@odysseus/core';
import {
  getCrawlDelayMs,
  getCrawlerUserAgent,
  getCruxApiKey,
  getPageTimeoutMs,
  getScanConcurrency,
} from './config.js';
import { HostRequestScheduler } from './host-request-scheduler.js';
import {
  checkNetworkTarget,
  type NetworkSafetyDisposition,
  type NetworkTargetPolicy,
} from './network-target-policy.js';
import type { RedirectHostCache } from './checks/transactional-flow.js';
import type { SitemapCheckResult } from './checks/sitemap.js';
import { checkLlmsTxt, type LlmsTxtCheckResult } from './checks/llms-txt.js';
import {
  checkSecurityHeaders,
  type SecurityHeadersCheckResult,
} from './checks/security-headers.js';
import { checkCookieConsent, type CookieConsentCheckResult } from './checks/cookie-consent.js';
import {
  checkAccessibilityStatement,
  type AccessibilityStatementCheckResult,
} from './checks/accessibility-statement.js';
import { fetchCruxFieldData } from './crux.js';
import { type CrawledPage, type CrawlProgressEvent, type CrawlResult, crawlSite } from './crawl.js';
import type { CrawlFrontierSnapshot, CrawlOptions } from './crawl.js';
import {
  type LighthouseAnalysisResult,
  type PageScanResult,
  type RenderedAnalysisResult,
  runLighthouseAnalysis,
  runRenderedAnalysis,
  scanPage,
} from './scan-page.js';
import {
  buildContentAuditPlan,
  finalizeLighthousePlan,
  type FullAuditPlan,
  type PageAuditDecision,
  type RenderedCostProfile,
} from './full-audit-plan.js';
import type { PageAuditProfile } from './page-audit-profile.js';
import { derivePageAnalysisCoverage } from './analysis-coverage.js';
import { readPageScanJson, writePageScanJson } from './artifacts/page-scan-io.js';
import {
  buildScanToolIdentity,
  deleteCrawlCheckpoint,
  deleteCrawlStateFile,
  isReusableCheckpoint,
  readCrawlCheckpoint,
  writeCrawlCheckpoint,
} from './artifacts/crawl-checkpoint-io.js';
import {
  deleteCrawlFrontierState,
  isReusableFrontierState,
  readCrawlFrontierState,
  writeCrawlFrontierState,
} from './artifacts/crawl-frontier-io.js';
import { createPageWorkGuard, type PageWorkGuard } from './page-work-guard.js';
import { RobotsPolicyRuntime } from './robots-policy-runtime.js';
import { writeRobotsPolicyChain } from './artifacts/robots-policy-io.js';
import {
  InventoryLedger,
  type InventoryLedgerSnapshot,
} from './inventory-ledger.js';
import { writeInventoryLedger } from './artifacts/inventory-ledger-io.js';

export interface CrawlExclusionCounts {
  discoveryOnly: number;
  externalRedirect: number;
  nonHtml: number;
  httpError: number;
  error: number;
}

/** Counts the navigated pages that are not content-checked, by reason. */
export function countCrawlExclusions(
  pages: readonly { status: CrawledPage['status'] }[],
): CrawlExclusionCounts {
  const counts: CrawlExclusionCounts = {
    discoveryOnly: 0,
    externalRedirect: 0,
    nonHtml: 0,
    httpError: 0,
    error: 0,
  };
  for (const page of pages) {
    if (page.status === 'discovered-not-scanned') counts.discoveryOnly += 1;
    else if (page.status === 'skipped-external-redirect') counts.externalRedirect += 1;
    else if (page.status === 'skipped-non-html') counts.nonHtml += 1;
    else if (page.status === 'http-error-status') counts.httpError += 1;
    else if (page.status === 'error') counts.error += 1;
  }
  return counts;
}

/** Extends crawl's own events with the scan phase's. scan-start fires
 *  once, after the crawl finishes (the total page count isn't known
 *  until then). scan-page fires once per completed scanPage call, not
 *  per axe/Lighthouse sub-step - the progress indicator this feeds is
 *  scoped to crawl vs. scan, not page-internal sub-phases. */
export type ScanProgressEvent =
  | CrawlProgressEvent
  | { type: 'scan-start'; totalPages: number }
  | { type: 'scan-page'; scanned: number; totalPages: number; url: string; durationMs: number }
  | {
      type: 'content-scan-start';
      totalPages: number;
      /** Issue #223: pages already complete on disk from a resumed run, so
       *  the reporter can seed its progress counter without folding them
       *  into this run's fresh timing window (they took no wall time in
       *  this process). */
      alreadyCompleted: number;
      /** Parallel content lanes this run uses, so the ETA can turn a
       *  per-page duration into a per-wave one instead of assuming a
       *  serial stream. */
      concurrency: number;
    }
  | {
      type: 'content-scan-page';
      completed: number;
      totalPages: number;
      url: string;
      durationMs: number;
    }
  /** Issue #393: crawled URLs that were navigated but will not be
   *  content-checked, by reason, so inventoried and checked counts
   *  reconcile. Robots-skipped URLs are never navigated and are not here. */
  | { type: 'crawl-exclusions'; excluded: CrawlExclusionCounts }
  | { type: 'select-performance' }
  | {
      type: 'lighthouse-start';
      totalPages: number;
      /** Same resume accounting as content-scan-start's alreadyCompleted,
       *  for pages whose scan.json already recorded a Lighthouse outcome. */
      alreadyCompleted: number;
    }
  | {
      type: 'lighthouse-page';
      completed: number;
      totalPages: number;
      url: string;
      durationMs: number;
    }
  | { type: 'analysis-complete' };

/** Plan 035 (issue #124): how the crawl phase was sourced. A resumed run
 *  reports how many pages already had a scan.json on disk; a fresh run
 *  reports why no checkpoint was reusable. A fresh start after a config or
 *  tool change is normal operation, not an error. */
export type CrawlCheckpointFreshReason =
  | 'no-checkpoint'
  | 'corrupt'
  | 'config-mismatch'
  | 'tool-mismatch'
  | 'started-at-mismatch'
  | 'version-mismatch';

export type CrawlCheckpointResumeDecision =
  | {
      mode: 'resumed';
      reusedPages: number;
      /** Plan 035 step 4: true when the crawl phase was restored from a
       *  mid-crawl frontier snapshot (crawl-state.json) rather than from
       *  the post-gate crawl checkpoint. Absent means the checkpoint
       *  resume path, where reusedPages counts pages whose scan.json
       *  already existed; a frontier resume always reports 0 there, since
       *  no content scan had started when the crawl was interrupted. */
      frontierResumed?: boolean;
    }
  | { mode: 'fresh'; reason: CrawlCheckpointFreshReason };

export interface ScanSiteOptions {
  browser: Browser;
  debugPort: number;
  maxPages?: number;
  maxDepth?: number;
  delayMs?: number;
  timeoutMs?: number;
  userAgent?: string;
  /** Number of pages scanned at once, and the concurrency bound of the run's
   *  single host scheduler (plan 059 decision 18). Lanes no longer pace
   *  themselves, so raising this overlaps more render/axe/Lighthouse work
   *  without raising the rate at which the site is asked for pages. Defaults
   *  to getScanConcurrency() (SCAN_CONCURRENCY env var, default 3). */
  concurrency?: number;
  /** The `pages/` parent directory every scanned page's screenshots are
   *  written under; renderDiff appends its own <slug>-<hash> subdirectory
   *  per page. */
  screenshotDir: string;
  /** The audit directory screenshotDir's `pages/` lives under
   *  (screenshotDir's parent). Required when writePagesAsScanned is set,
   *  to relativize each page's screenshot refs the same way
   *  writeAuditArtifacts does. */
  auditDir?: string;
  /** Issue #64: when set, each page's scan.json is written to disk as
   *  soon as that page finishes (mirroring the screenshot writes
   *  renderDiff already does), and its full result is then dropped from
   *  the `pages` array this function returns (only `{ url }` is kept) so
   *  the heavy per-page fields (axe/Lighthouse JSON, evidence arrays) can
   *  be garbage-collected instead of accumulating in memory for the whole
   *  run. writeAuditArtifacts reads these pages back from disk instead of
   *  from siteResult.pages. Requires auditDir. Off by default: the
   *  standalone `scan` CLI command still dumps the full in-memory
   *  SiteScanResult to stdout by design, and existing callers/tests rely
   *  on the full result being returned. */
  writePagesAsScanned?: boolean;
  onProgress?: (event: ScanProgressEvent) => void;
  /** Manual-input-layer milestone, forwarded to crawlSite as-is. */
  seeds?: string[];
  exclusions?: string[];
  /** Manual-input-layer milestone, forwarded to every page's
   *  findDelegatedBookingRedirectChecks call via scanPage. */
  bookingEngineUrl?: string;
  /** Milestone 9b: forwarded to every page's scanPage call. See
   *  ScanPageOptions.skipLighthouse for the full reasoning. */
  skipLighthouse?: boolean;
  /** Full scans supplement from sitemap by default. Prospecting selects
   *  `inspect` so sitemap findings remain available without expanding its
   *  three-page budget. */
  sitemapMode?: Exclude<SitemapMode, 'none'>;
  /** Plan 021 opt-in: stages the scan through the two-stage deterministic
   *  planner (`buildContentAuditPlan` then `finalizeLighthousePlan`)
   *  instead of the legacy per-page loop, so Lighthouse runs only on
   *  mandatory pages plus family/language representatives rather than on
   *  every page. Defaults to `false` (the legacy behavior, unconditional
   *  per-page Lighthouse unless `skipLighthouse`) so the standalone `scan`
   *  CLI command and any other direct caller keep their exact current
   *  behavior with no code change. Set only by `runAuditStage` for the
   *  real paid full-audit path (plan 021 Step 5): prospecting already sets
   *  `skipLighthouse: true`, which this flag composes with harmlessly
   *  (the planner still runs, but the selective Lighthouse lane never
   *  fires). */
  fullAuditPlanning?: boolean;
  /** Plan 035 (issue #124): the audit run's identity and effective config,
   *  required to stamp the crawl checkpoint (crawl-checkpoint.json) once
   *  the coverage gate passes; when a reusable checkpoint already exists
   *  in auditDir it turns the crawl phase into a load instead of a fetch.
   *  Only ever set by the full-audit path: set together with
   *  skipLighthouse, or without fullAuditPlanning, writePagesAsScanned, or
   *  auditDir, scanSite throws. */
  checkpointContext?: { startedAt: Date; config: AuditConfigSnapshot };
  /** Plan 035: reports how the crawl phase was sourced (resumed with the
   *  count of pages whose scan.json already existed, or fresh with the
   *  reason no checkpoint was reusable). */
  onResumeDecision?: (decision: CrawlCheckpointResumeDecision) => void;
  /** Issue #200: invoked once, before the crawl starts, with the run-wide
   *  PageWorkGuard every page's work reports its contexts into. A caller
   *  that needs to react to job cancellation mid-run (packages/interface)
   *  can hold this and call guard.closeAll() to force-close every context
   *  still open for this audit, rather than waiting for a page-boundary
   *  progress event that a wedged page may never reach. */
  onGuardReady?: (guard: PageWorkGuard) => void;
  /** Plan 059 production SSRF/egress policy. Direct helper callers may omit it. */
  networkPolicy?: NetworkTargetPolicy;
  /** Frozen AuditScopeSnapshot digest enabling the private inventory ledger. */
  scopeDigest?: string;
}

export interface SiteScanResult {
  crawl: CrawlResult;
  /** Issue #64: empty when the run was made with writePagesAsScanned -
   *  every page's full result was written to disk (under screenshotDir's
   *  parent, auditDir) as soon as that page finished and is never held in
   *  memory for the run's duration. writeAuditArtifacts reads pages back
   *  from disk instead of from this array in that case. */
  pages: PageScanResult[];
  /** Milestone 8.6: origin-level, fetched once here (not per page) - see
   *  CruxFieldDataResult's own doc comment for why. Absent (not merely
   *  `available: false`) when CRUX_API_KEY was never configured, so this
   *  fetch was never attempted at all. */
  cruxFieldData?: CruxFieldDataResult;
  /** Only present when `fullAuditPlanning` was set: the finalized plan
   *  (with Lighthouse selections) the scan actually ran, for Step 7's
   *  coverage persistence. */
  fullAuditPlan?: FullAuditPlan;
  /** Present only for the staged full-audit path. URL-keyed so artifact
   *  writing can join crawl inventory to pass provenance without relying on
   *  completion order. */
  analysisCoverageByUrl?: ReadonlyMap<string, PageAnalysisCoverage>;
  /** Every request the browser/network policy refused during this run. */
  networkSafetyDispositions?: readonly NetworkSafetyDisposition[];
  /** Scope-bound private Plan 059 inventory after all content work succeeds. */
  inventoryLedger?: InventoryLedgerSnapshot;
}

/**
 * Issue #64: when writePagesAsScanned is set, writes pageResult's
 * scan.json immediately (mirroring the screenshot writes renderDiff
 * already does per page) and returns undefined, so the caller's own
 * accumulator never retains it - a full round trip through `pages` (even
 * as a url-only stand-in) would make writeAuditArtifacts's
 * "is this page already in memory" check see a (falsely) defined entry
 * and skip the disk it was actually written to. Returns pageResult
 * unchanged when unset, the default every existing caller (the `scan` CLI
 * command, tests) still gets.
 */
function persistPageIfConfigured(
  pageResult: PageScanResult,
  screenshotDir: string,
  auditDir: string | undefined,
  writePagesAsScanned: boolean | undefined,
): PageScanResult | undefined {
  if (!writePagesAsScanned) return pageResult;
  if (auditDir === undefined) {
    throw new Error('scanSite: writePagesAsScanned requires auditDir to be set.');
  }
  writePageScanJson(screenshotDir, auditDir, pageResult);
  return undefined;
}

/**
 * Hard per-page deadlines for the scan lanes. A rendered-analysis await
 * that never completes (three full audits of the same site have wedged
 * this way at different pages and phases, all with every thread idle)
 * otherwise costs the entire multi-hour audit, because lanes await each
 * page without a bound of their own. The deadlines are deliberately
 * many times the observed per-page mean so a legitimately heavy page
 * still finishes; only an abandoned await pays the deadline. The losing
 * work promise is not cancelled (Playwright offers no page-scoped
 * cancellation), so a wedged page leaks its tab until the browser
 * closes; at most one tab per wedged page is acceptable against losing
 * the run.
 */
const RENDERED_ANALYSIS_WATCHDOG_MS = 420_000;
const FULL_SCAN_PAGE_WATCHDOG_MS = 600_000;

/**
 * Resolves with `work`'s result, or, if `work` is still pending after
 * `watchdogMs`, with a synthesized failed result so the lane can move on
 * and the manifest can record the page as failed coverage. The result's
 * empty checkOutcomes is what makes the persisted pass record honest:
 * derivePageAnalysisCoverage derives failed for every content pass with
 * no completed checks, and the error string carries the reason.
 *
 * Issue #200: on timeout, also force-closes every context `guard` has
 * tracked for this page before resolving. Earlier, the deadline branch
 * only abandoned `work`'s promise - the Playwright BrowserContext(s) it
 * had open stayed alive (and so did their renderer processes) for as
 * long as whatever `work` was stuck on never settled, which is how a
 * real audit accumulated 100+ live renderer processes into an OOM.
 * `work` itself is left to settle on its own time (closing its context
 * makes any pending Playwright call reject quickly in practice) with its
 * eventual rejection swallowed, so it can never surface as an unhandled
 * rejection after this function has already returned via the deadline.
 */
export async function withPageWatchdog<T extends RenderedAnalysisResult | PageScanResult>(
  url: string,
  work: Promise<T>,
  watchdogMs: number,
  guard?: PageWorkGuard,
): Promise<T | RenderedAnalysisResult> {
  work.catch(() => {
    // See doc comment: once abandoned via the deadline branch below, a
    // later rejection here (typically caused by our own forced close)
    // must never surface as an unhandled rejection.
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<RenderedAnalysisResult>((resolve) => {
    timer = setTimeout(() => {
      const closed = guard?.closeAll() ?? Promise.resolve();
      void closed.finally(() => {
        resolve({
          url,
          renderDiffError: `watchdog: page analysis did not complete within ${watchdogMs}ms; abandoned so the audit could continue`,
          checkOutcomes: {},
        });
      });
    }, watchdogMs);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs one lane of the scan phase: a sequential slice of pagesToScan, each
 * page taking its turn from the run's shared `scheduler` rather than from a
 * sleep of its own (plan 059 decision 18). The lane no longer knows anything
 * about pacing: the scheduler decides when this page may start, and holding
 * its slot for the whole page means the scheduler's concurrency bound is the
 * real bound on overlapping work, so a rate-limited site shedding a lane
 * actually sheds one.
 *
 * `delayMs` survives only because `scanPage` still spaces the two navigations
 * render-diff makes inside a single page with it. That is a different request
 * from the one scheduled here, so the two are not stacked on the same
 * navigation.
 */
async function runScanLane(
  laneUrls: string[],
  browser: Browser,
  debugPort: number,
  delayMs: number,
  scheduler: HostRequestScheduler,
  screenshotDir: string,
  timeoutMs: number | undefined,
  userAgent: string | undefined,
  mentionsLegalesUrl: string | undefined,
  mentionsLegalesSearchedUrls: string[] | undefined,
  mentionsLegalesHomepageFallback: boolean,
  redirectHostCache: RedirectHostCache,
  homepageUrl: string | undefined,
  sitemapCheck:
    (SitemapCheckResult & { crawledUrls: string[]; discoveredUrls: string[] }) | undefined,
  llmsTxtCheck: LlmsTxtCheckResult | undefined,
  securityHeadersCheck: SecurityHeadersCheckResult | undefined,
  cookieConsentCheck: CookieConsentCheckResult | undefined,
  accessibilityStatementCheck: AccessibilityStatementCheckResult | undefined,
  bookingEngineUrl: string | undefined,
  skipLighthouse: boolean,
  runGuard: PageWorkGuard | undefined,
  networkPolicy: NetworkTargetPolicy | undefined,
  onNetworkSafetyBlocked: ((disposition: NetworkSafetyDisposition) => void) | undefined,
  onPageDone: (pageResult: PageScanResult, durationMs: number) => void,
): Promise<void> {
  for (const url of laneUrls) {
    // Issue #200: a fresh guard per page, mirrored into the run-wide
    // guard, so the watchdog below can force-close only this page's
    // contexts on timeout without touching other lanes' still-legitimate
    // work.
    const pageGuard = createPageWorkGuard(runGuard);

    const { pageResult, durationMs } = await scheduler.schedule(async () => {
      // Issue #223: timed inside the scheduled turn, so the wait for that turn
      // is excluded exactly the way the lane's own pre-page sleep used to be,
      // and the ETA's per-page estimator still sees the real cost of a page.
      const workStartedAtMs = Date.now();
      const result = await withPageWatchdog(
        url,
        scanPage(browser, debugPort, url, {
          delayMs,
          scheduler,
          screenshotDir,
          redirectHostCache,
          guard: pageGuard,
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
          ...(userAgent !== undefined ? { userAgent } : {}),
          ...(mentionsLegalesUrl !== undefined ? { mentionsLegalesUrl } : {}),
          ...(mentionsLegalesSearchedUrls !== undefined ? { mentionsLegalesSearchedUrls } : {}),
          ...(mentionsLegalesHomepageFallback ? { mentionsLegalesHomepageFallback } : {}),
          ...(homepageUrl !== undefined ? { homepageUrl } : {}),
          ...(sitemapCheck !== undefined ? { sitemapCheck } : {}),
          ...(llmsTxtCheck !== undefined ? { llmsTxtCheck } : {}),
          ...(securityHeadersCheck !== undefined ? { securityHeadersCheck } : {}),
          ...(cookieConsentCheck !== undefined ? { cookieConsentCheck } : {}),
          ...(accessibilityStatementCheck !== undefined ? { accessibilityStatementCheck } : {}),
          ...(bookingEngineUrl !== undefined ? { bookingEngineUrl } : {}),
          ...(skipLighthouse ? { skipLighthouse } : {}),
          ...(networkPolicy !== undefined ? { networkPolicy } : {}),
          ...(onNetworkSafetyBlocked !== undefined ? { onNetworkSafetyBlocked } : {}),
        }),
        FULL_SCAN_PAGE_WATCHDOG_MS,
        pageGuard,
      );
      return { pageResult: result, durationMs: Date.now() - workStartedAtMs };
    });
    onPageDone(pageResult as PageScanResult, durationMs);
  }
}

/** Every field `runRenderedAnalysisLane` needs to forward into each page's
 *  `runRenderedAnalysis` call, bundled once per `scanSite` run rather than
 *  threaded as a long positional parameter list a second time. */
interface StagedScanContext {
  screenshotDir: string;
  auditDir: string | undefined;
  writePagesAsScanned: boolean | undefined;
  /** Plan 035: true only after a validated checkpoint resume, the one
   *  condition under which existing scan.json files may be skipped. */
  resumeActive: boolean;
  timeoutMs: number | undefined;
  userAgent: string | undefined;
  mentionsLegalesUrl: string | undefined;
  redirectHostCache: RedirectHostCache;
  homepageUrl: string | undefined;
  sitemapCheck:
    (SitemapCheckResult & { crawledUrls: string[]; discoveredUrls: string[] }) | undefined;
  llmsTxtCheck: LlmsTxtCheckResult | undefined;
  securityHeadersCheck: SecurityHeadersCheckResult | undefined;
  cookieConsentCheck: CookieConsentCheckResult | undefined;
  accessibilityStatementCheck: AccessibilityStatementCheckResult | undefined;
  bookingEngineUrl: string | undefined;
  /** Issue #200: the run-wide guard every page's own guard mirrors into. */
  runGuard: PageWorkGuard | undefined;
  networkPolicy: NetworkTargetPolicy | undefined;
  onNetworkSafetyBlocked: ((disposition: NetworkSafetyDisposition) => void) | undefined;
  robotsPolicyRuntime: RobotsPolicyRuntime | undefined;
}

/**
 * Rendered-analysis equivalent of `runScanLane`: same sequential lane shape
 * taking each page's turn from the same shared scheduler, but calling
 * `runRenderedAnalysis` (no Lighthouse) instead of the all-in-one
 * `scanPage`, since the full-audit planner's Lighthouse selection cannot
 * be decided until every lane's rendered-cost facts exist.
 */
async function runRenderedAnalysisLane(
  laneUrls: string[],
  browser: Browser,
  delayMs: number,
  scheduler: HostRequestScheduler,
  context: StagedScanContext,
  onPageDone: (url: string, result: RenderedAnalysisResult, durationMs: number) => void,
): Promise<void> {
  for (const url of laneUrls) {
    if (context.robotsPolicyRuntime !== undefined) {
      await context.robotsPolicyRuntime.refresh(laneUrls);
      context.robotsPolicyRuntime.assertAllowed(url);
    }
    // Issue #200: same per-page-guard-mirrored-into-run-wide-guard shape
    // as runScanLane above.
    const pageGuard = createPageWorkGuard(context.runGuard);

    const { result, durationMs } = await scheduler.schedule(async () => {
      // Issue #223: same "actual page work only" timing window as
      // runScanLane above, measured once the turn has been granted.
      const workStartedAtMs = Date.now();
      const analysis = await withPageWatchdog(
        url,
        runRenderedAnalysis(browser, url, {
          delayMs,
          scheduler,
          screenshotDir: context.screenshotDir,
          redirectHostCache: context.redirectHostCache,
          guard: pageGuard,
          ...(context.timeoutMs !== undefined ? { timeoutMs: context.timeoutMs } : {}),
          ...(context.userAgent !== undefined ? { userAgent: context.userAgent } : {}),
          ...(context.mentionsLegalesUrl !== undefined
            ? { mentionsLegalesUrl: context.mentionsLegalesUrl }
            : {}),
          ...(context.homepageUrl !== undefined ? { homepageUrl: context.homepageUrl } : {}),
          ...(context.sitemapCheck !== undefined ? { sitemapCheck: context.sitemapCheck } : {}),
          ...(context.llmsTxtCheck !== undefined ? { llmsTxtCheck: context.llmsTxtCheck } : {}),
          ...(context.securityHeadersCheck !== undefined
            ? { securityHeadersCheck: context.securityHeadersCheck }
            : {}),
          ...(context.cookieConsentCheck !== undefined
            ? { cookieConsentCheck: context.cookieConsentCheck }
            : {}),
          ...(context.accessibilityStatementCheck !== undefined
            ? { accessibilityStatementCheck: context.accessibilityStatementCheck }
            : {}),
          ...(context.bookingEngineUrl !== undefined
            ? { bookingEngineUrl: context.bookingEngineUrl }
            : {}),
          ...(context.networkPolicy !== undefined
            ? { networkPolicy: context.networkPolicy }
            : {}),
          ...(context.onNetworkSafetyBlocked !== undefined
            ? { onNetworkSafetyBlocked: context.onNetworkSafetyBlocked }
            : {}),
        }),
        RENDERED_ANALYSIS_WATCHDOG_MS,
        pageGuard,
      );
      return { result: analysis, durationMs: Date.now() - workStartedAtMs };
    });
    onPageDone(url, result as RenderedAnalysisResult, durationMs);
  }
}

/** `crawlSite` (via Step 3's wiring) always attaches an audit profile to
 *  every page it marks `visited`, falling back to an empty-facts profile
 *  on extraction failure rather than leaving the field unset - so a
 *  missing profile here means that invariant broke, not a normal
 *  condition to fall back from silently. Full-audit coverage depends on
 *  every visited page being planned; silently skipping one would be
 *  exactly the "quietly under-report the site" failure class this plan
 *  exists to close, so this throws instead. */
function toPlanProfile(page: CrawledPage): PageAuditProfile {
  if (page.auditProfile === undefined) {
    throw new Error(
      `Full-audit planning requires an audit profile for every visited page, but ${page.url} has none.`,
    );
  }
  return page.auditProfile;
}

/**
 * Plan 035 (issue #124): splits the staged scan's page inventory into
 * pages whose scan.json is already on disk from a previous attempt
 * (completedByUrl) and pages still needing content work (pending). A
 * persisted scan.json without a renderedCostProfile is a pre-plan-035
 * artifact: the planner replay needs every page's cost profile, so such a
 * page is treated as pending and re-measured rather than trusted with an
 * incomplete input. Pure: the caller supplies the disk read.
 */
export function partitionPagesForResume(
  pagesToScan: readonly CrawledPage[],
  readExisting: (url: string) => PageScanResult | undefined,
): { completedByUrl: Map<string, PageScanResult>; pending: CrawledPage[] } {
  const completedByUrl = new Map<string, PageScanResult>();
  const pending: CrawledPage[] = [];
  for (const page of pagesToScan) {
    const existing = readExisting(page.url);
    if (existing !== undefined && existing.renderedCostProfile !== undefined) {
      completedByUrl.set(page.url, existing);
    } else {
      pending.push(page);
    }
  }
  return { completedByUrl, pending };
}

/**
 * Plan 035's content-scan skip rule for the Lighthouse phase: a page
 * whose on-disk scan.json already records a Lighthouse outcome, success
 * or failure, is done (a recorded failure is a recorded fact, not
 * something a resume retries). Only a selected page whose scan.json
 * carries neither field still needs its Lighthouse pass.
 */
export function needsLighthouseRun(decision: PageAuditDecision, scanJson: PageScanResult): boolean {
  return (
    decision.plannedPasses.includes('lighthouse') &&
    scanJson.lighthouse === undefined &&
    scanJson.lighthouseError === undefined
  );
}

/**
 * Runs the plan 021 staged pipeline: build the content plan from every
 * visited page's audit profile, run rendered analysis for all of them
 * (concurrent lanes, same pacing as the legacy path), finalize the
 * Lighthouse plan from the resulting cost facts, then run Lighthouse only
 * for the selected pages. `skipLighthouse` still short-circuits the
 * Lighthouse stage entirely, exactly as it does in the legacy path - the
 * plan is still computed (for provenance) but its Lighthouse selections
 * are never acted on.
 */
async function runStagedFullAuditScan(
  pagesToScan: CrawledPage[],
  browser: Browser,
  debugPort: number,
  delayMs: number,
  concurrency: number,
  scheduler: HostRequestScheduler,
  skipLighthouse: boolean,
  context: StagedScanContext,
  onProgress: ((event: ScanProgressEvent) => void) | undefined,
): Promise<{
  pages: PageScanResult[];
  fullAuditPlan: FullAuditPlan;
  analysisCoverageByUrl: ReadonlyMap<string, PageAnalysisCoverage>;
}> {
  const profiles = pagesToScan.map(toPlanProfile);
  const contentPlan = buildContentAuditPlan(profiles);

  // Plan 035 (issue #124): on a validated resume, pages whose scan.json is
  // already on disk (with a rendered cost profile) skip the content lanes
  // entirely; everything the planner and the emit path need from them is
  // rebuilt from the persisted scan.json below. Outside a validated resume
  // this is a no-op partition over an empty set: skipping existing results
  // is never active for a fresh run.
  const resumePartition =
    context.resumeActive && context.writePagesAsScanned === true && context.auditDir !== undefined
      ? partitionPagesForResume(pagesToScan, (url) => readPageScanJson(context.screenshotDir, url))
      : undefined;
  const completedByUrl = resumePartition?.completedByUrl ?? new Map<string, PageScanResult>();
  const pendingPages = resumePartition?.pending ?? pagesToScan;

  const renderedResults = new Map<string, RenderedAnalysisResult>();
  const renderedCosts = new Map<string, RenderedCostProfile>();
  // Seed the resumed base from disk: the same { url, checkOutcomes } shape
  // the writePagesAsScanned lane keeps in memory, plus the persisted cost
  // profile, so finalizeLighthousePlan sees the union of the interrupted
  // run's costs and this run's new ones and replays the same decisions.
  for (const [url, scanJson] of completedByUrl) {
    renderedResults.set(url, { url, checkOutcomes: scanJson.checkOutcomes ?? {} });
    const costProfile = scanJson.renderedCostProfile;
    if (costProfile !== undefined) {
      renderedCosts.set(url, costProfile);
    }
  }
  // Starts at the reused count so content-scan-page progress stays
  // truthful against the full inventory size.
  let contentCompleted = completedByUrl.size;
  onProgress?.({
    type: 'content-scan-start',
    totalPages: pagesToScan.length,
    alreadyCompleted: completedByUrl.size,
    concurrency,
  });

  const lanes: string[][] = Array.from({ length: concurrency }, () => []);
  pendingPages.forEach((page, index) => {
    lanes[index % concurrency]!.push(page.url);
  });

  await Promise.all(
    lanes
      .filter((laneUrls) => laneUrls.length > 0)
      .map((laneUrls) =>
        runRenderedAnalysisLane(
          laneUrls,
          browser,
          delayMs,
          scheduler,
          context,
          (url, result, durationMs) => {
            const { checkOutcomes, renderedCostProfile, ...content } = result;
            if (context.writePagesAsScanned) {
              // Issue #64: the content-scan phase must wait for every
              // lane's rendered result before Lighthouse selection can
              // run (finalizeLighthousePlan needs every renderedCosts
              // entry), so this map would otherwise hold every page's
              // full rendered payload (axe/headMetadata/evidence, the
              // bulk of a page's size) simultaneously for as long as the
              // content-scan phase takes - the actual accumulator behind
              // the reported OOM, since this phase covers every page, not
              // just the Lighthouse-selected minority. Write the rendered
              // content to disk now and keep only what emit() needs
              // in-memory (checkOutcomes, for analysisCoverage) - emit()
              // reads the content back from disk once Lighthouse
              // selection is known. Plan 035: the persisted scan.json
              // also carries checkOutcomes and renderedCostProfile so a
              // resumed run can rebuild every planner input from disk.
              if (context.auditDir === undefined) {
                throw new Error('scanSite: writePagesAsScanned requires auditDir to be set.');
              }
              writePageScanJson(context.screenshotDir, context.auditDir, {
                ...content,
                checkOutcomes,
                ...(renderedCostProfile !== undefined ? { renderedCostProfile } : {}),
              });
              renderedResults.set(url, { url, checkOutcomes } as RenderedAnalysisResult);
            } else {
              renderedResults.set(url, result);
            }
            if (renderedCostProfile !== undefined) {
              renderedCosts.set(url, renderedCostProfile);
            }
            contentCompleted += 1;
            onProgress?.({
              type: 'content-scan-page',
              completed: contentCompleted,
              totalPages: pagesToScan.length,
              url,
              durationMs,
            });
          },
        ),
      ),
  );

  const finalizedPlan = finalizeLighthousePlan(contentPlan, renderedCosts);
  onProgress?.({ type: 'select-performance' });
  const selectedUrls = new Set(
    skipLighthouse
      ? []
      : finalizedPlan.decisions
          .filter((decision) => decision.plannedPasses.includes('lighthouse'))
          .map((decision) => decision.url),
  );
  const decisionByUrl = new Map(
    finalizedPlan.decisions.map((decision) => [decision.url, decision]),
  );
  // Issue #223: a page whose scan.json already recorded a Lighthouse
  // outcome (see needsLighthouseRun below) does no new work this run, so
  // it is counted up front rather than left to silently under-report
  // progress and over-report the ETA's remaining work.
  let lighthouseAlreadyCompleted = 0;
  for (const url of selectedUrls) {
    if (context.robotsPolicyRuntime !== undefined) {
      await context.robotsPolicyRuntime.refresh([...selectedUrls]);
      context.robotsPolicyRuntime.assertAllowed(url);
    }
    const decision = decisionByUrl.get(url);
    const reusedScanJson = completedByUrl.get(url);
    if (
      decision !== undefined &&
      reusedScanJson !== undefined &&
      !needsLighthouseRun(decision, reusedScanJson)
    ) {
      lighthouseAlreadyCompleted += 1;
    }
  }
  if (context.robotsPolicyRuntime !== undefined && selectedUrls.size > 0) {
    const plannedPerformanceUrls = [...selectedUrls];
    await context.robotsPolicyRuntime.refresh(plannedPerformanceUrls, { phaseBoundary: true });
    for (const url of plannedPerformanceUrls) context.robotsPolicyRuntime.assertAllowed(url);
  }

  onProgress?.({
    type: 'lighthouse-start',
    totalPages: selectedUrls.size,
    alreadyCompleted: lighthouseAlreadyCompleted,
  });

  const pages: PageScanResult[] = [];
  const analysisCoverageByUrl = new Map<string, PageAnalysisCoverage>();
  // Plan 035: counts only newly performed work on top of the reused base,
  // so a resumed run's scan-page progress stays truthful.
  let scanned = completedByUrl.size;
  const emit = (
    url: string,
    lighthouseResult: LighthouseAnalysisResult | undefined,
    isNewWork: boolean,
    /** Issue #223: the underlying work's own duration (content-lane or
     *  lighthouse timing, whichever produced this call), reused here
     *  rather than re-measured around this bookkeeping-only step. */
    durationMs: number,
  ): void => {
    const rendered = renderedResults.get(url);
    if (rendered === undefined) return;
    const decision = decisionByUrl.get(url);
    if (decision === undefined) {
      throw new Error(`Full-audit plan has no decision for rendered page ${url}.`);
    }
    analysisCoverageByUrl.set(
      url,
      derivePageAnalysisCoverage({
        decision,
        checkOutcomes: rendered.checkOutcomes,
        lighthouseSelected: selectedUrls.has(url),
        ...(lighthouseResult !== undefined
          ? {
              lighthouseOutcome: lighthouseResult.lighthouse !== undefined ? 'completed' : 'failed',
            }
          : {}),
      }),
    );
    // Plan 035: a resumed page whose scan.json already carries everything
    // this run would write needs no new work. Its analysis coverage above
    // is the only artifact still missing, so skip the disk write and the
    // in-memory merge entirely.
    if (!isNewWork) return;
    let pageResult: PageScanResult;
    if (context.writePagesAsScanned) {
      // The content-scan lane already wrote this page's rendered-only
      // scan.json and shed the full payload from `rendered` (see the lane
      // callback above) - read it back rather than spreading `rendered`,
      // which no longer carries it.
      const fromDisk = readPageScanJson(context.screenshotDir, url);
      if (fromDisk === undefined) {
        throw new Error(`writePagesAsScanned: expected a scan.json already written for ${url}.`);
      }
      pageResult = fromDisk;
    } else {
      const {
        checkOutcomes: _checkOutcomes,
        renderedCostProfile: _renderedCostProfile,
        ...content
      } = rendered;
      pageResult = { ...content };
    }
    if (lighthouseResult?.lighthouse !== undefined)
      pageResult.lighthouse = lighthouseResult.lighthouse;
    if (lighthouseResult?.lighthouseError !== undefined)
      pageResult.lighthouseError = lighthouseResult.lighthouseError;
    const kept = persistPageIfConfigured(
      pageResult,
      context.screenshotDir,
      context.auditDir,
      context.writePagesAsScanned,
    );
    if (kept !== undefined) pages.push(kept);
    scanned += 1;
    onProgress?.({ type: 'scan-page', scanned, totalPages: pagesToScan.length, url, durationMs });
  };

  // Pages not selected for Lighthouse are already fully done once the
  // rendered stage finishes; emitting for them first (rather than
  // interleaving) keeps this stage a clean two-phase run. Step 8 revisits
  // progress ordering for the staged pipeline; this is a correct, if not
  // yet interleaved, signal. On a resume, a reused page reports no new
  // work here (isNewWork false): only its coverage is derived. No extra
  // work happens between the content lane finishing and this bookkeeping
  // step, so durationMs is 0 here - the page's real cost was already
  // reported on its content-scan-page event.
  for (const url of renderedResults.keys()) {
    if (!selectedUrls.has(url)) emit(url, undefined, !completedByUrl.has(url), 0);
  }

  // Lighthouse calls are already serialized process-wide (see
  // runLighthouseSerialized's own doc comment in scan-page.ts), so running
  // them through a second lane structure would add complexity without
  // adding real parallelism - a plain sequential loop gets the same
  // throughput while keeping the pre-call politeness delay simple.
  // Seeded from the reused count above so completed/target agree from the
  // first lighthouse-page event onward, instead of only reaching target
  // once every reused page has separately been walked again.
  let lighthouseCompleted = lighthouseAlreadyCompleted;
  for (const url of selectedUrls) {
    const decision = decisionByUrl.get(url);
    const reusedScanJson = completedByUrl.get(url);
    if (
      decision !== undefined &&
      reusedScanJson !== undefined &&
      !needsLighthouseRun(decision, reusedScanJson)
    ) {
      // Plan 035: the scan.json already records this page's Lighthouse
      // outcome (completed or failed); replay it into coverage only and
      // never re-run the pass.
      emit(
        url,
        {
          ...(reusedScanJson.lighthouse !== undefined
            ? { lighthouse: reusedScanJson.lighthouse }
            : {}),
          ...(reusedScanJson.lighthouseError !== undefined
            ? { lighthouseError: reusedScanJson.lighthouseError }
            : {}),
        },
        false,
        0,
      );
      continue;
    }
    const workStartedAtMs = Date.now();
    const lighthouseResult = await runLighthouseAnalysis(url, debugPort, {
      scheduler,
    });
    const durationMs = Date.now() - workStartedAtMs;
    emit(url, lighthouseResult, true, durationMs);
    lighthouseCompleted += 1;
    onProgress?.({
      type: 'lighthouse-page',
      completed: lighthouseCompleted,
      totalPages: selectedUrls.size,
      url,
      durationMs,
    });
  }

  onProgress?.({ type: 'analysis-complete' });

  return { pages, fullAuditPlan: finalizedPlan, analysisCoverageByUrl };
}

/**
 * Crawls a site, then scans every page the crawl actually visited (skipping
 * robots-disallowed and errored pages, since there is nothing rendered to
 * scan there). Both phases take their turns from one HostRequestScheduler
 * created for the run (plan 059 decision 18), seeded with the configured delay
 * and raised to crawlSite's stricter-of-config-and-robots value, so the crawl
 * phase and the scan lanes share a single request rate instead of each
 * observing the delay privately. Concurrency adds parallel lanes under that one
 * rate; it never buys a lane a request rate of its own.
 *
 * Inner crawler-initiated requests now draw from the same start-rate budget:
 * render-diff's second navigation and the serialized Lighthouse navigation use
 * scheduler.pace(), while robots/sitemap and site-level fetches are scheduled
 * directly. Browser subresources are network-policy checked but are not paced
 * individually; the scheduler is therefore a ceiling on crawler-initiated
 * request starts, not on the total asset traffic one loaded page may generate.
 *
 * The crawl phase itself stays fully sequential (unaffected by
 * concurrency): it is the phase CLAUDE.md's politeness rule names most
 * directly. This used to add "and it is not the bottleneck", which was
 * never measured; plan 026 measured the Lighthouse segment at roughly
 * three quarters of a real audit's wall clock but left the crawl's own
 * share unmeasured, so make no claim about it either way here. Making the
 * crawl concurrent is a rule 5 question for the operator, not a free
 * optimisation. Only the scan phase (render-diff
 * + axe + Lighthouse per page) is split into `concurrency` lanes, each a
 * contiguous round-robin slice of pagesToScan so lane sizes stay balanced.
 * The resulting `pages` array is in completion order, not crawl order;
 * every downstream consumer matches pages by `.url`, never by position
 * (writeAuditArtifacts builds its own url-keyed map), so this is safe.
 */
/** Plan 035 (issue #124): before spending any network, check whether a
 *  previous attempt of this same run left a validated crawl checkpoint.
 *  Returns the checkpointed crawl when it is reusable for this run's
 *  identity, config, and tools (re-running the coverage gate so a resume
 *  can never launder a crawl the gate would reject today), or the reason
 *  no checkpoint was usable. Never reports a resume decision itself: the
 *  fresh decision belongs to the caller, which first offers the run's
 *  mid-crawl frontier snapshot (step 4) the chance to resume the crawl
 *  before declaring it fresh. On any checkpoint mismatch the checkpoint
 *  and this run's partial `pages/` directory are deleted, together with
 *  any frontier snapshot, so stale artifacts can never leak into a new
 *  configuration's manifest. */
function loadReusableCrawl(
  options: ScanSiteOptions,
  auditDir: string,
  checkpointContext: { startedAt: Date; config: AuditConfigSnapshot },
):
  | { crawl: CrawlResult; reusedPages: number }
  | { crawl: undefined; freshReason: CrawlCheckpointFreshReason } {
  const checkpoint = readCrawlCheckpoint(auditDir);
  const verdict = isReusableCheckpoint(checkpoint, {
    startedAt: checkpointContext.startedAt,
    config: checkpointContext.config,
    toolIdentity: buildScanToolIdentity(),
  });
  if (checkpoint !== undefined && verdict.reusable) {
    const crawl = checkpoint.crawl;
    assertSufficientCrawlCoverage({
      pages: crawl.pages,
      ...(crawl.sitemapCoverage !== undefined ? { sitemapCoverage: crawl.sitemapCoverage } : {}),
    });
    // The crawl is complete, so a frontier snapshot a partially-crawled
    // attempt may have left behind (plan 035 step 4) has no future.
    deleteCrawlStateFile(auditDir);
    const reusedPages = crawl.pages.filter(
      (page) => page.status === 'visited' && readPageScanJson(options.screenshotDir, page.url),
    ).length;
    return { crawl, reusedPages };
  }
  if (!verdict.reusable && verdict.reason !== 'missing') {
    deleteCrawlCheckpoint(auditDir);
    fs.rmSync(path.join(auditDir, 'pages'), { recursive: true, force: true });
    // A stale frontier must never outlive the configuration it was
    // crawled under: the same mismatch that rejects the checkpoint
    // rejects the frontier a crashed attempt left behind.
    deleteCrawlFrontierState(auditDir);
    return { crawl: undefined, freshReason: verdict.reason };
  }
  return { crawl: undefined, freshReason: 'no-checkpoint' };
}

export async function scanSite(
  startUrl: string,
  options: ScanSiteOptions,
): Promise<SiteScanResult> {
  if (options.writePagesAsScanned && options.auditDir === undefined) {
    throw new Error('scanSite: writePagesAsScanned requires auditDir to be set.');
  }
  // Issue #200: created before any page work so onGuardReady's caller
  // (packages/interface's cancellation path) can force-close every
  // context this run ever opens, not just the ones from pages a
  // per-page watchdog has already given up on.
  const runGuard = createPageWorkGuard();
  options.onGuardReady?.(runGuard);
  const checkpointContext = options.checkpointContext;
  if (checkpointContext !== undefined) {
    // Plan 035: the checkpoint's skip rules exist for the staged
    // full-audit path only. Prospecting (skipLighthouse) and the legacy
    // per-page path must never load a checkpoint, and the skip semantics
    // themselves require writePagesAsScanned plus a known auditDir.
    if (
      !options.fullAuditPlanning ||
      options.skipLighthouse === true ||
      options.writePagesAsScanned !== true ||
      options.auditDir === undefined
    ) {
      throw new Error(
        'scanSite: checkpointContext requires fullAuditPlanning, writePagesAsScanned and auditDir, with skipLighthouse unset.',
      );
    }
  }
  // Plan 059 decision 18: one scheduler for the whole run, created before the
  // first request of any kind, so the crawl phase and every scan lane draw
  // their turns from the same rate instead of each observing the delay
  // privately. Its floor starts at the configured delay because robots.txt has
  // not been read yet; crawlSite raises it to the stricter-of-config-and-robots
  // value as soon as it has one, and the checkpoint-resume path below raises it
  // from the checkpointed crawl, which is the branch where no crawl runs at all.
  // Concurrency comes from the configured bound rather than the clamped one
  // further down, since that clamp only exists to avoid creating idle lanes for
  // a site with fewer pages than lanes.
  const scheduler = new HostRequestScheduler({
    floorDelayMs: options.delayMs ?? getCrawlDelayMs(),
    maxConcurrency: options.concurrency ?? getScanConcurrency(),
  });
  const networkSafetyDispositions: NetworkSafetyDisposition[] = [];
  const onNetworkSafetyBlocked =
    options.networkPolicy === undefined
      ? undefined
      : (disposition: NetworkSafetyDisposition): void => {
          networkSafetyDispositions.push(disposition);
        };
  const assertSafeDirectTarget = async (url: string): Promise<void> => {
    if (options.networkPolicy === undefined) return;
    const verdict = await checkNetworkTarget(url, options.networkPolicy);
    if (verdict.kind === 'allowed') return;
    onNetworkSafetyBlocked?.(verdict.disposition);
    throw new Error(
      `scanSite: network safety blocked ${url} (${verdict.disposition.reason})`,
    );
  };
  const sitemapMode = options.sitemapMode ?? 'supplement';
  const crawlOptions = (frontier: CrawlOptions['frontier']): CrawlOptions => ({
    scheduler,
    browser: options.browser,
    evidenceEpoch: 1,
    ...(options.scopeDigest !== undefined ? { scopeDigest: options.scopeDigest } : {}),
    ...(options.networkPolicy !== undefined ? { networkPolicy: options.networkPolicy } : {}),
    ...(onNetworkSafetyBlocked !== undefined ? { onNetworkSafetyBlocked } : {}),
    ...(options.maxPages !== undefined ? { maxPages: options.maxPages } : {}),
    ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
    ...(options.delayMs !== undefined ? { delayMs: options.delayMs } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
    ...(options.onProgress !== undefined ? { onProgress: options.onProgress } : {}),
    ...(options.seeds !== undefined ? { seeds: options.seeds } : {}),
    ...(options.exclusions !== undefined ? { exclusions: options.exclusions } : {}),
    sitemapMode,
    ...(frontier !== undefined ? { frontier } : {}),
  });

  // Plan 035 (issue #124): a validated checkpoint turns the crawl phase
  // into a file load; failing that, the interrupted attempt's mid-crawl
  // frontier snapshot (step 4) continues its crawl; anything else crawls
  // fresh with frontier snapshotting enabled. Exactly one resume decision
  // is reported per run, after the final sourcing is known.
  let crawl: CrawlResult;
  let resumedFromCheckpoint: boolean;
  if (checkpointContext !== undefined && options.auditDir !== undefined) {
    const auditDir = options.auditDir;
    const reused = loadReusableCrawl(options, auditDir, checkpointContext);
    if (reused.crawl !== undefined) {
      options.onResumeDecision?.({ mode: 'resumed', reusedPages: reused.reusedPages });
      crawl = reused.crawl;
      resumedFromCheckpoint = true;
    } else {
      const toolIdentity = buildScanToolIdentity();
      const frontierState = readCrawlFrontierState(auditDir);
      const frontierVerdict = isReusableFrontierState(frontierState, {
        startedAt: checkpointContext.startedAt,
        config: checkpointContext.config,
        toolIdentity,
      });
      const frontierResumed = frontierState !== undefined && frontierVerdict.reusable;
      const writeFrontierState = (state: CrawlFrontierSnapshot): void => {
        writeCrawlFrontierState(auditDir, {
          format: 'full-audit-crawl-frontier-v1',
          startedAt: checkpointContext.startedAt.toISOString(),
          config: checkpointContext.config,
          toolIdentity,
          state,
        });
      };
      if (frontierResumed) {
        // No page can have a scan.json yet: once the content scan had
        // started, the post-gate checkpoint would exist and take priority
        // above, so a frontier resume never reuses scan results.
        options.onResumeDecision?.({ mode: 'resumed', reusedPages: 0, frontierResumed: true });
      } else {
        // A frontier that failed validation must not outlive the
        // configuration it was crawled under either; deletion tolerates
        // the common absence.
        deleteCrawlFrontierState(auditDir);
        options.onResumeDecision?.({ mode: 'fresh', reason: reused.freshReason });
      }
      crawl = await crawlSite(
        startUrl,
        crawlOptions({
          writeState: writeFrontierState,
          ...(frontierState !== undefined && frontierVerdict.reusable
            ? { resumeState: frontierState.state }
            : {}),
        }),
      );
      resumedFromCheckpoint = false;
    }
  } else {
    crawl = await crawlSite(startUrl, crawlOptions(undefined));
    resumedFromCheckpoint = false;
  }

  // A full audit must not continue from the handful of pages served before
  // a target begins rejecting the crawl. This is a truthful stop, not an
  // invitation to evade protections: retry only with a slower cadence or an
  // explicit allowlist. Prospecting does not produce a paid report, so its
  // bounded inspection path is deliberately outside this gate.
  if (options.fullAuditPlanning) {
    assertSufficientCrawlCoverage({
      pages: crawl.pages,
      ...(crawl.sitemapCoverage !== undefined ? { sitemapCoverage: crawl.sitemapCoverage } : {}),
    });
    // Plan 035: checkpoint the full crawl inventory the moment the gate
    // passes and before any site-level or content work, so every post-crawl
    // crash of this run resumes instead of re-crawling. A crawl the gate
    // rejected therefore writes no checkpoint. The resumed path skips the
    // rewrite: the file on disk is exactly what was just validated.
    if (checkpointContext !== undefined && !resumedFromCheckpoint) {
      if (options.auditDir === undefined) {
        throw new Error('scanSite: checkpointContext requires auditDir to be set.');
      }
      writeCrawlCheckpoint(options.auditDir, {
        checkpointVersion: 'v1',
        startedAt: checkpointContext.startedAt.toISOString(),
        config: checkpointContext.config,
        toolIdentity: buildScanToolIdentity(),
        crawl,
      });
      // The checkpoint supersedes any frontier snapshot this run wrote or
      // inherited (plan 035 step 4): from here on a post-crawl crash
      // resumes from the checkpoint, so the mid-crawl file has no future.
      // Deletion on full audit success stays the interface stage's job.
      deleteCrawlFrontierState(options.auditDir);
    }
  }

  // The crawl reports the delay it actually used, including a robots
  // Crawl-delay. On the checkpoint-resume path that value comes off disk and
  // crawlSite never ran, so this is the only place the scheduler can learn it;
  // on every other path the raise is a no-op because crawlSite already made it.
  scheduler.raiseDelayTo(crawl.effectiveDelayMs);

  const pagesToScan = crawl.pages.filter((page) => page.status === 'visited');
  options.onProgress?.({ type: 'crawl-exclusions', excluded: countCrawlExclusions(crawl.pages) });

  const inventoryLedger =
    crawl.inventoryLedger === undefined
      ? undefined
      : InventoryLedger.fromSnapshot(crawl.inventoryLedger);
  if (inventoryLedger !== undefined && options.auditDir !== undefined) {
    writeInventoryLedger(options.auditDir, inventoryLedger.snapshot());
  }
  const finalizeInventoryLedger = (): InventoryLedgerSnapshot | undefined => {
    if (inventoryLedger === undefined) return undefined;
    for (const page of pagesToScan) {
      const candidate = inventoryLedger.candidate(page.url);
      if (candidate === undefined) {
        throw new Error(`scanSite: visited page ${page.url} is missing from the inventory ledger`);
      }
      if (candidate.disposition === undefined) {
        inventoryLedger.recordDisposition({
          url: page.url,
          disposition: 'scanned',
          decidedAt: new Date(),
        });
      }
    }
    const reconciliation = inventoryLedger.reconcile();
    if (!reconciliation.reconciled) {
      throw new Error(
        `scanSite: inventory remains unreconciled after content scan: ${reconciliation.unreconciledUrls.join(', ')}`,
      );
    }
    const snapshot = inventoryLedger.snapshot();
    if (options.auditDir !== undefined) writeInventoryLedger(options.auditDir, snapshot);
    return snapshot;
  };

  const robotsPolicyRuntime = options.fullAuditPlanning
    ? new RobotsPolicyRuntime({
        evidenceEpoch: 1,
        origin: new URL(crawl.startUrl).origin,
        userAgent: options.userAgent ?? getCrawlerUserAgent(),
        configuredDelayMs: options.delayMs ?? getCrawlDelayMs(),
        timeoutMs: options.timeoutMs ?? getPageTimeoutMs(),
        scheduler,
        initialChain: crawl.robotsPolicyChain ?? [],
        ...(options.networkPolicy !== undefined ? { networkPolicy: options.networkPolicy } : {}),
        ...(onNetworkSafetyBlocked !== undefined ? { onNetworkSafetyBlocked } : {}),
        ...(options.auditDir !== undefined
          ? { onChainChanged: (chain) => writeRobotsPolicyChain(options.auditDir!, chain) }
          : {}),
      })
    : undefined;
  if (robotsPolicyRuntime !== undefined) {
    if (options.auditDir !== undefined && robotsPolicyRuntime.chain.length > 0) {
      writeRobotsPolicyChain(options.auditDir, robotsPolicyRuntime.chain);
    }
    const plannedUrls = pagesToScan.map((page) => page.url);
    await robotsPolicyRuntime.refresh(plannedUrls, { phaseBoundary: true });
    for (const url of plannedUrls) robotsPolicyRuntime.assertAllowed(url);
  }

  // When no URL matched the mentions-legales heuristic, the LCEN check
  // must still run somewhere - otherwise a site with no legal notice page
  // at all silently never gets the missing-SIREN finding, exactly the
  // "non-HTML resources silently skipped" failure mode CLAUDE.md's
  // crawling rules warn against. Falling back to the homepage means the
  // absence itself still surfaces as a finding, attributed to the one
  // page every site has. Not used for manifest.siteSignals.
  // mentionsLegalesPageUrl (write-audit.ts still reads crawl's own value,
  // undefined here), only for choosing which already-visited page's
  // onRenderedPage hook runs the text extraction.
  const mentionsLegalesUrlForScan =
    crawl.mentionsLegalesPageUrl ??
    (pagesToScan.some((page) => page.url === crawl.startUrl) ? crawl.startUrl : undefined);
  // Plan 036: true only when the fallback above actually fired (no URL
  // matched the heuristic), so the evidence never implies a real match.
  const mentionsLegalesHomepageFallback =
    crawl.mentionsLegalesPageUrl === undefined && mentionsLegalesUrlForScan !== undefined;

  // Sitemap.xml is a site-level concept, not a per-page one, so its
  // check runs once here rather than inside scanPage, and its result is
  // attributed only to the homepage's scan.json - the same "attribute a
  // site-level fact to the one page every site has" pattern
  // mentionsLegalesUrlForScan's own fallback already established above.
  // Skipped entirely (both fields left undefined) when the homepage
  // itself was never visited (e.g. disallowed by its own robots.txt),
  // since there is no page to attribute the finding to.
  const homepageWasVisited = pagesToScan.some((page) => page.url === crawl.startUrl);
  const sitemapCheck =
    homepageWasVisited && crawl.sitemap !== undefined
      ? {
          ...crawl.sitemap,
          crawledUrls: crawl.pages
            .filter((page) => page.status === 'visited' && page.discoveryMethod === 'link')
            .map((page) => page.url),
          discoveredUrls: crawl.linkDiscoveredUrls,
        }
      : undefined;
  const homepageUrlForScan = homepageWasVisited ? crawl.startUrl : undefined;

  // llms.txt is a site-level fetch, same shape as sitemap.xml above -
  // fetched once here regardless of whether the homepage itself was
  // visited (unlike sitemapCheck, there is no per-page attribution
  // question blocking it: this is a single unconditional GET at the
  // site's origin, not something that needs a page to attach staleness
  // comparisons to), and attached to the homepage's scan.json below only
  // when the homepage was actually visited, the same attribution pattern
  // every other site-level check here uses.
  const siteOrigin = new URL(crawl.startUrl).origin;
  await assertSafeDirectTarget(new URL('/llms.txt', siteOrigin).href);
  const llmsTxtCheck = await scheduler.schedule(() =>
    checkLlmsTxt(
      siteOrigin,
      options.timeoutMs ?? getPageTimeoutMs(),
      options.userAgent ?? getCrawlerUserAgent(),
      {
        ...(options.networkPolicy !== undefined ? { networkPolicy: options.networkPolicy } : {}),
        ...(onNetworkSafetyBlocked !== undefined ? { onNetworkSafetyBlocked } : {}),
      },
    ),
  );
  const llmsTxtCheckForScan = homepageWasVisited ? llmsTxtCheck : undefined;

  // Security response headers are a site-level fetch, same shape as
  // llms.txt/sitemap above: near-always identical across every page on a
  // site, so one request here (attached only to the homepage's scan.json
  // when it was visited) rather than repeating the same answer per page.
  await assertSafeDirectTarget(siteOrigin);
  const securityHeadersCheck = await scheduler.schedule(() =>
    checkSecurityHeaders(
      siteOrigin,
      options.timeoutMs ?? getPageTimeoutMs(),
      options.userAgent ?? getCrawlerUserAgent(),
      {
        ...(options.networkPolicy !== undefined ? { networkPolicy: options.networkPolicy } : {}),
        ...(onNetworkSafetyBlocked !== undefined ? { onNetworkSafetyBlocked } : {}),
      },
    ),
  );
  const securityHeadersCheckForScan = homepageWasVisited ? securityHeadersCheck : undefined;

  // C1: cookies and trackers active before consent. One extra navigation
  // per audit, in a brand-new context so nothing from the crawl's own
  // passes can be mistaken for the visitor having consented - which is
  // why this cannot reuse a page the lanes already loaded. Same
  // site-level, attributed-to-the-homepage shape as the checks above,
  // and skipped entirely when the homepage was never visited, since
  // there would be no page to attribute the finding to.
  const cookieConsentCheck = homepageWasVisited
    ? await scheduler.schedule(() =>
        checkCookieConsent(options.browser, crawl.startUrl, {
          timeoutMs: options.timeoutMs ?? getPageTimeoutMs(),
          guard: runGuard,
          ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
          ...(options.networkPolicy !== undefined
            ? { networkPolicy: options.networkPolicy }
            : {}),
          ...(onNetworkSafetyBlocked !== undefined ? { onNetworkSafetyBlocked } : {}),
        }),
      )
    : undefined;

  // C4: URL-pattern only, over the pages this crawl actually reached, so
  // it costs no request at all. Skipped when the homepage was not
  // visited, for the same reason as the checks above.
  const accessibilityStatementCheck = homepageWasVisited
    ? checkAccessibilityStatement(pagesToScan.map((page) => page.url))
    : undefined;

  // CrUX is origin-level, not per-page, and only ever queried once per
  // audit regardless of page count - skipped entirely (not attempted and
  // failed) when no API key is configured, so a site without one never
  // pays a doomed auth-error round trip.
  const cruxApiKey = getCruxApiKey();
  const cruxFieldData = cruxApiKey
    ? await fetchCruxFieldData(new URL(crawl.startUrl).origin, cruxApiKey)
    : undefined;

  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? getScanConcurrency(), pagesToScan.length || 1),
  );

  // One cache for the whole site, shared across every lane, so a
  // booking-engine link repeated on every page (a real hotel site's nav)
  // costs one third-party navigation per audit, not one per page. See
  // transactional-flow.ts's RedirectHostCache doc comment.
  const redirectHostCache: RedirectHostCache = new Map();

  if (options.fullAuditPlanning) {
    const context: StagedScanContext = {
      screenshotDir: options.screenshotDir,
      auditDir: options.auditDir,
      writePagesAsScanned: options.writePagesAsScanned,
      resumeActive: resumedFromCheckpoint,
      timeoutMs: options.timeoutMs,
      userAgent: options.userAgent,
      mentionsLegalesUrl: mentionsLegalesUrlForScan,
      redirectHostCache,
      homepageUrl: homepageUrlForScan,
      sitemapCheck,
      llmsTxtCheck: llmsTxtCheckForScan,
      securityHeadersCheck: securityHeadersCheckForScan,
      cookieConsentCheck,
      accessibilityStatementCheck,
      bookingEngineUrl: options.bookingEngineUrl,
      runGuard,
      networkPolicy: options.networkPolicy,
      onNetworkSafetyBlocked,
      robotsPolicyRuntime,
    };
    const { pages, fullAuditPlan, analysisCoverageByUrl } = await runStagedFullAuditScan(
      pagesToScan,
      options.browser,
      options.debugPort,
      crawl.effectiveDelayMs,
      concurrency,
      scheduler,
      options.skipLighthouse ?? false,
      context,
      options.onProgress,
    );
    const finalInventory = finalizeInventoryLedger();
    return {
      crawl,
      pages,
      fullAuditPlan,
      analysisCoverageByUrl,
      ...(cruxFieldData !== undefined ? { cruxFieldData } : {}),
      ...(networkSafetyDispositions.length > 0 ? { networkSafetyDispositions } : {}),
      ...(finalInventory !== undefined ? { inventoryLedger: finalInventory } : {}),
    };
  }

  options.onProgress?.({ type: 'scan-start', totalPages: pagesToScan.length });

  const lanes: string[][] = Array.from({ length: concurrency }, () => []);
  pagesToScan.forEach((page, index) => {
    lanes[index % concurrency]!.push(page.url);
  });

  const pages: PageScanResult[] = [];
  let scannedCount = 0;
  const onPageDone = (pageResult: PageScanResult, durationMs: number): void => {
    const kept = persistPageIfConfigured(
      pageResult,
      options.screenshotDir,
      options.auditDir,
      options.writePagesAsScanned,
    );
    if (kept !== undefined) pages.push(kept);
    scannedCount += 1;
    options.onProgress?.({
      type: 'scan-page',
      scanned: scannedCount,
      totalPages: pagesToScan.length,
      url: pageResult.url,
      durationMs,
    });
  };

  await Promise.all(
    lanes
      .filter((laneUrls) => laneUrls.length > 0)
      .map((laneUrls) =>
        runScanLane(
          laneUrls,
          options.browser,
          options.debugPort,
          crawl.effectiveDelayMs,
          scheduler,
          options.screenshotDir,
          options.timeoutMs,
          options.userAgent,
          mentionsLegalesUrlForScan,
          crawl.mentionsLegalesSearchedUrls,
          mentionsLegalesHomepageFallback,
          redirectHostCache,
          homepageUrlForScan,
          sitemapCheck,
          llmsTxtCheckForScan,
          securityHeadersCheckForScan,
          cookieConsentCheck,
          accessibilityStatementCheck,
          options.bookingEngineUrl,
          options.skipLighthouse ?? false,
          runGuard,
          options.networkPolicy,
          onNetworkSafetyBlocked,
          onPageDone,
        ),
      ),
  );

  const finalInventory = finalizeInventoryLedger();
  return {
    crawl,
    pages,
    ...(cruxFieldData !== undefined ? { cruxFieldData } : {}),
    ...(networkSafetyDispositions.length > 0 ? { networkSafetyDispositions } : {}),
    ...(finalInventory !== undefined ? { inventoryLedger: finalInventory } : {}),
  };
}
