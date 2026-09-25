import * as fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright';
import {
  assertSufficientCrawlCoverage,
  HostStoppedAnsweringError,
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
import {
  HostRequestScheduler,
  type HostPacingRecoveredEvent,
  type HostPushbackEvent,
} from './host-request-scheduler.js';
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
import { fetchCruxFieldDataAcquisition, type CruxAcquisitionStatus } from './crux.js';
import {
  acquireSiteCheck,
  CRUX_FIELD_DATA_CHECK_ID,
  SITE_REQUEST_SURFACE_ID,
  type SiteCheckRun,
  lighthouseAttemptRecord,
  mergeRetriedChecks,
  PAGE_CHECK_IDS,
  pageAttemptRecords,
  retryRequestsFor,
  type RetryRequest,
} from './evidence-acquisition.js';
import {
  nextExecutionProfile,
  type AcquisitionAttemptRecord,
  type AttemptExecutionProfile,
} from './check-attempt-ledger.js';
import {
  baselineDesktopSurface,
  consentSurface,
  mobileSurface,
  MOBILE_SURFACE_IDENTITY_REFUSED,
  MOBILE_SURFACE_UNAVAILABLE,
  SurfaceIdentityError,
  type SurfaceLimitationRecord,
} from './evidence-surfaces.js';
import { runMobileSurfaceAnalysis, type MobileSurfaceRecord } from './mobile-surface.js';
import { runConsentSurfaceAnalysis, type ConsentSurfaceOutcome } from './state-surface.js';
import { CONSENT_SURFACE_INEFFECTIVE, CONSENT_SURFACE_UNAVAILABLE } from './consent-state.js';
import { localStateSurface } from './evidence-surfaces.js';
import type { SurfaceLinkDiscovery } from './surface-discovery.js';
import {
  appendSiteAcquisitionAttempts,
  writeTemporalAnchors,
} from './artifacts/acquisition-attempts-io.js';
import { captureStructuralAnchor, type StructuralAnchor } from './temporal-anchors.js';
import type { NetworkSafetyBlockHandler } from './browser-network-safety.js';
import { type CrawledPage, type CrawlProgressEvent, type CrawlResult, crawlSite } from './crawl.js';
import type { CrawlFrontierSnapshot, CrawlOptions } from './crawl.js';
import type { CanonicalTargetCheckResult } from './checks/canonical-target.js';
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
  performancePageClassOf,
  type FullAuditPlan,
  type PageAuditDecision,
  type RenderedCostProfile,
} from './full-audit-plan.js';
import {
  buildPerformanceMeasurementSet,
  CALIBRATED_STABILITY_TOLERANCES,
  repeatTriggersFromAssessment,
  runsOwedForPage,
  type LighthouseRunInput,
  type PerformanceMeasurementSet,
  type RepeatTrigger,
} from './performance-measurement-set.js';
import {
  gradingRepeatTriggers,
  labMetricsFromLighthouse,
  composeRepresentativeReport,
  representativeRunId,
} from './performance-acquisition.js';
import {
  buildPageAuditProfile,
  type PageAuditProfile,
  type RawPageAuditFacts,
} from './page-audit-profile.js';
import { derivePageAnalysisCoverage } from './analysis-coverage.js';
import { readPageScanJson, writePageScanJson } from './artifacts/page-scan-io.js';
import {
  buildContentStageMarker,
  clearContentStageMarker,
  readContentStageMarker,
  writeContentStageMarker,
} from './content-stage-marker.js';
import { assertAcquisitionLease } from './artifacts/acquisition-lease-io.js';
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
import {
  createPageWorkGuard,
  PageWorkDeadlineError,
  type PageWorkGuard,
  withPageWorkDeadline,
} from './page-work-guard.js';
import { RobotsPolicyRuntime } from './robots-policy-runtime.js';
import { writeRobotsPolicyChain } from './artifacts/robots-policy-io.js';
import {
  InventoryLedger,
  type InventoryDisposition,
  type InventoryLedgerSnapshot,
} from './inventory-ledger.js';
import { writeInventoryLedger } from './artifacts/inventory-ledger-io.js';

export interface CrawlExclusionCounts {
  discoveryOnly: number;
  externalRedirect: number;
  nonHtml: number;
  httpError: number;
  blocked: number;
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
    blocked: 0,
    error: 0,
  };
  for (const page of pages) {
    if (page.status === 'discovered-not-scanned') counts.discoveryOnly += 1;
    else if (page.status === 'skipped-external-redirect') counts.externalRedirect += 1;
    else if (page.status === 'skipped-non-html') counts.nonHtml += 1;
    else if (page.status === 'http-error-status') counts.httpError += 1;
    else if (page.status === 'blocked') counts.blocked += 1;
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
      requestStartCount?: number;
      currentDelayMs?: number;
      plannedSlotsPerPage?: number;
    }
  | {
      type: 'content-scan-page';
      completed: number;
      totalPages: number;
      url: string;
      durationMs: number;
      requestStartCount?: number;
      currentDelayMs?: number;
    }
  /** Issue #393: crawled URLs that were navigated but will not be
   *  content-checked, by reason, so inventoried and checked counts
   *  reconcile. Robots-skipped URLs are never navigated and are not here. */
  | { type: 'crawl-exclusions'; excluded: CrawlExclusionCounts }
  /** Host pushback is durable operator telemetry, emitted at the same
   *  boundary as the scheduler signal so the job card can warn while the
   *  run is still active. */
  | { type: 'pushback'; event: HostPushbackEvent }
  | { type: 'pacing-recovered'; event: HostPacingRecoveredEvent }
  /** One page whose failed checks finished their retries. Recovery runs
   *  pages one at a time and can take many minutes, so each page reports. */
  | { type: 'content-recovery-page'; completed: number; totalPages: number; url: string }
  | { type: 'select-performance' }
  | {
      type: 'lighthouse-start';
      totalPages: number;
      /** Same resume accounting as content-scan-start's alreadyCompleted,
       *  for pages whose scan.json already recorded a Lighthouse outcome. */
      alreadyCompleted: number;
      requestStartCount?: number;
      currentDelayMs?: number;
      plannedSlotsPerPage?: number;
    }
  | {
      type: 'lighthouse-page';
      completed: number;
      totalPages: number;
      url: string;
      durationMs: number;
      requestStartCount?: number;
      currentDelayMs?: number;
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
  | 'scope-mismatch'
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
  /** Plan 059 step 22: the claim id this worker wrote to auditDir's
   *  acquisition lease. Every evidence write re-reads the lease first and
   *  throws StaleAcquisitionLeaseError once another worker has taken the
   *  directory over. Requires auditDir. */
  acquisitionLeaseId?: string;
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
  /** Frozen AuditScopeSnapshot digest enabling the private inventory ledger
   *  and, on the full-audit path, Plan 059 attempt recording and targeted
   *  recovery. */
  scopeDigest?: string;
  /** Plan 059 section 10's diagnostic profile needs a fresh browser process.
   *  The caller owns browser launch (it carries the egress policy), so it
   *  supplies how to make another one. Without it a diagnostic retry reuses
   *  the run's browser and is recorded as an isolated retry instead. */
  launchRecoveryBrowser?: () => Promise<{ browser: Browser; debugPort: number }>;
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
  /** Plan 059: whether CrUX answered, had no public data, or failed. Only set
   *  when a CrUX key is configured; the legacy `cruxFieldData` payload cannot
   *  tell the last two apart. */
  cruxAcquisitionStatus?: CruxAcquisitionStatus;
  /** Host responses that slowed or blocked acquisition, for the job and
   *  audit operator views. */
  pushbackEvents?: readonly HostPushbackEvent[];
  /** Scheduler delay reductions after sustained clean request starts. */
  pacingRecoveryEvents?: readonly HostPacingRecoveredEvent[];
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
 * Issue #200: on timeout, abort the work and force-close every context
 * `guard` has tracked for this page. Earlier, the deadline branch only
 * abandoned `work`'s promise - Playwright contexts and their renderers
 * stayed alive until the abandoned operation settled, which let one audit
 * accumulate 100+ renderers into an OOM. The abandoned promise is observed
 * so any rejection caused by context closure cannot become unhandled.
 */
export async function withPageWatchdog<T extends RenderedAnalysisResult | PageScanResult>(
  url: string,
  work: Promise<T>,
  watchdogMs: number,
  guard?: PageWorkGuard,
  onDeadline?: (error: PageWorkDeadlineError) => void,
): Promise<T | RenderedAnalysisResult> {
  try {
    return await withPageWorkDeadline(
      `page analysis for ${url}`,
      work,
      watchdogMs,
      guard,
      onDeadline,
    );
  } catch (error) {
    if (!(error instanceof PageWorkDeadlineError)) throw error;
    return {
      url,
      renderDiffError: `watchdog: page analysis did not complete within ${watchdogMs}ms; abandoned so the audit could continue`,
      checkOutcomes: {},
    };
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
  servedUrlByIdentity: ReadonlyMap<string, string>,
  mentionsLegalesUrl: string | undefined,
  mentionsLegalesCandidateUrls: string[] | undefined,
  mentionsLegalesSearchedUrls: string[] | undefined,
  mentionsLegalesHomepageFallback: boolean,
  redirectHostCache: RedirectHostCache,
  canonicalTargetCache: Map<string, Promise<CanonicalTargetCheckResult | null>>,
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
    const navigationUrl = servedUrlByIdentity.get(url);

    const { pageResult, durationMs } = await scheduler.schedule(async () => {
      // Issue #223: timed inside the scheduled turn, so the wait for that turn
      // is excluded exactly the way the lane's own pre-page sleep used to be,
      // and the ETA's per-page estimator still sees the real cost of a page.
      const workStartedAtMs = Date.now();
      const pageAbortController = new AbortController();
      const result = await withPageWatchdog(
        url,
        scanPage(browser, debugPort, url, {
          delayMs,
          scheduler,
          screenshotDir,
          redirectHostCache,
          canonicalTargetCache,
          guard: pageGuard,
          signal: pageAbortController.signal,
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
          ...(userAgent !== undefined ? { userAgent } : {}),
          ...(navigationUrl !== undefined ? { navigationUrl } : {}),
          ...(mentionsLegalesUrl !== undefined ? { mentionsLegalesUrl } : {}),
          ...(mentionsLegalesCandidateUrls !== undefined ? { mentionsLegalesCandidateUrls } : {}),
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
        () => pageAbortController.abort(new Error('page analysis watchdog elapsed')),
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
  servedUrlByIdentity: ReadonlyMap<string, string>;
  mentionsLegalesUrl: string | undefined;
  mentionsLegalesCandidateUrls: string[] | undefined;
  mentionsLegalesSearchedUrls: string[] | undefined;
  mentionsLegalesHomepageFallback: boolean;
  redirectHostCache: RedirectHostCache;
  /** Issue #501: the same run-wide canonical-target cache the legacy lane
   *  uses, so a canonical shared by many pages is fetched once per audit. */
  canonicalTargetCache: Map<string, Promise<CanonicalTargetCheckResult | null>>;
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
  /** Plan 059 attempt recording is on exactly when a frozen scope exists. */
  scopeDigest: string | undefined;
  evidenceEpoch: number;
  launchRecoveryBrowser: (() => Promise<{ browser: Browser; debugPort: number }>) | undefined;
  /** Throws when this worker no longer holds the audit directory's lease. */
  holdLease: () => void;
  /** Plan 059 step 10: run the mobile surface pass for every staged page.
   *  On exactly when this is a Plan 059 scoped full audit. */
  mobileSurfaces: boolean;
  /** Plan 059 step 11: run the bounded hydration sweep as the last step of
   *  each page's rendered pass. On alongside mobileSurfaces. */
  hydrationSweep: boolean;
  /** Plan 059 step 13: record the delivered consent state, run the
   *  consent-rejected surface where a safe rejection exists, and explore
   *  safe local-state toggles. On alongside mobileSurfaces. */
  stateSurfaces: boolean;
  /** Operator crawl exclusions, applied to every surface-discovered link. */
  exclusionPatterns: readonly string[];
  /** Links first seen on a state surface, in completion order, with the
   *  referring page and the depth the fixed-point admission (step 14)
   *  reconciles them against. Kept at run level because the persisted
   *  page results are trimmed under writePagesAsScanned. */
  surfaceLinks: (SurfaceLinkDiscovery & { referrer: string; depth?: number })[];
  /** Plan 059 step 11: the private inventory ledger, when this run keeps
   *  one. Surface-discovered URLs are recorded into it at admission so the
   *  fixed point reconciles every candidate it has ever heard of. */
  inventory: InventoryLedger | undefined;
  /** The crawl's effective page and depth bounds, applied to wave
   *  admission exactly as the crawl applied them to its own frontier. */
  maxPages: number;
  maxDepth: number;
  /** Refuses (and records the refusal for) a URL the network policy
   *  blocks; wired from scanSite's policy-checked direct-target helper. */
  assertSafeUrl: (url: string) => Promise<void>;
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
  onPageDone: (url: string, result: RenderedAnalysisResult, durationMs: number) => Promise<void>,
): Promise<void> {
  for (const url of laneUrls) {
    const { result, durationMs } = await analyzePageInTurn(
      url,
      browser,
      delayMs,
      scheduler,
      context,
      context.timeoutMs,
      laneUrls,
    );
    await onPageDone(url, result, durationMs);
  }
}

/**
 * One page's rendered analysis, taken in its turn from the shared scheduler
 * and bounded by the watchdog. Shared by the content lanes and by targeted
 * recovery, so a retry navigates exactly the way the first attempt did and
 * differs only in the browser and timeout its profile calls for.
 */
async function analyzePageInTurn(
  url: string,
  browser: Browser,
  delayMs: number,
  scheduler: HostRequestScheduler,
  context: StagedScanContext,
  timeoutMs: number | undefined,
  refreshUrls: readonly string[],
): Promise<{ result: RenderedAnalysisResult; durationMs: number }> {
  if (context.robotsPolicyRuntime !== undefined) {
    await context.robotsPolicyRuntime.refresh([...refreshUrls]);
    context.robotsPolicyRuntime.assertAllowed(url);
  }
  // Issue #200: same per-page-guard-mirrored-into-run-wide-guard shape
  // as runScanLane above.
  const pageGuard = createPageWorkGuard(context.runGuard);
  const navigationUrl = context.servedUrlByIdentity.get(url);

  return scheduler.schedule(async () => {
    // Issue #223: same "actual page work only" timing window as
    // runScanLane above, measured once the turn has been granted.
    const workStartedAtMs = Date.now();
    const pageAbortController = new AbortController();
    const analysis = await withPageWatchdog(
      url,
      runRenderedAnalysis(browser, url, {
        delayMs,
        scheduler,
        screenshotDir: context.screenshotDir,
        hydrationSweep: context.hydrationSweep,
        stateSurfaces: context.stateSurfaces,
        exclusionPatterns: context.exclusionPatterns,
        redirectHostCache: context.redirectHostCache,
        canonicalTargetCache: context.canonicalTargetCache,
        guard: pageGuard,
        signal: pageAbortController.signal,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        ...(context.userAgent !== undefined ? { userAgent: context.userAgent } : {}),
        ...(navigationUrl !== undefined ? { navigationUrl } : {}),
        ...(context.mentionsLegalesUrl !== undefined
          ? { mentionsLegalesUrl: context.mentionsLegalesUrl }
          : {}),
        ...(context.mentionsLegalesCandidateUrls !== undefined
          ? { mentionsLegalesCandidateUrls: context.mentionsLegalesCandidateUrls }
          : {}),
        ...(context.mentionsLegalesSearchedUrls !== undefined
          ? { mentionsLegalesSearchedUrls: context.mentionsLegalesSearchedUrls }
          : {}),
        ...(context.mentionsLegalesHomepageFallback
          ? { mentionsLegalesHomepageFallback: true }
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
        ...(context.networkPolicy !== undefined ? { networkPolicy: context.networkPolicy } : {}),
        ...(context.onNetworkSafetyBlocked !== undefined
          ? { onNetworkSafetyBlocked: context.onNetworkSafetyBlocked }
          : {}),
      }),
      RENDERED_ANALYSIS_WATCHDOG_MS,
      pageGuard,
      () => pageAbortController.abort(new Error('rendered analysis watchdog elapsed')),
    );
    return { result: analysis as RenderedAnalysisResult, durationMs: Date.now() - workStartedAtMs };
  });
}

/**
 * The page attempts one rendered-analysis run produced, or none when attempt
 * recording is off for this scan.
 */
function recordPageRun(
  context: StagedScanContext,
  url: string,
  result: RenderedAnalysisResult,
  durationMs: number,
  executionProfile: AttemptExecutionProfile,
  checkIds: readonly (typeof PAGE_CHECK_IDS)[number][],
): { records: AcquisitionAttemptRecord[]; baselineSurfaceId: string | undefined } {
  if (context.scopeDigest === undefined) return { records: [], baselineSurfaceId: undefined };
  const finishedAt = new Date();
  const surface = baselineDesktopSurface({
    evidenceEpoch: context.evidenceEpoch,
    pageIdentity: url,
    userAgent: context.userAgent ?? getCrawlerUserAgent(),
    readinessOutcome:
      result.readiness?.outcome ??
      (result.checkOutcomes['render-diff'] === 'completed' ? 'unstable' : 'timeout'),
  });
  const records = pageAttemptRecords(
    result,
    result.checkOutcomes,
    {
      url,
      surfaceId: surface.surfaceId,
      scopeDigest: context.scopeDigest,
      evidenceEpoch: context.evidenceEpoch,
      startedAt: new Date(finishedAt.getTime() - durationMs),
      finishedAt,
      executionProfile,
    },
    checkIds,
  );
  return { records, baselineSurfaceId: surface.surfaceId };
}

/** Section 10's diagnostic profile: twice the bounded settle, never unbounded. */
function diagnosticTimeoutMs(context: StagedScanContext): number {
  return (context.timeoutMs ?? getPageTimeoutMs()) * 2;
}

/**
 * Plan 059 step 10: one page's mobile surface, taken in its own turn from
 * the shared scheduler after the page's immutable baseline capture is
 * complete (section 9: baseline first, fresh storage per surface — the
 * mobile pass never runs in the baseline's context and never ahead of it).
 * The lane is held with `holdLane` and the one navigation inside is paced
 * with `pace()` against the same scheduler, so the mobile surface is one
 * more consumer of the run's single request rate, never a hidden second
 * lane, and its single request costs a single slot.
 *
 * A pass that cannot prove the crawler identity on the wire, or that fails,
 * leaves a surface limitation on the page instead of a half-recorded
 * surface: the gap is disclosed where the page's evidence lives.
 */
async function attachMobileSurface(
  url: string,
  result: RenderedAnalysisResult,
  browser: Browser,
  scheduler: HostRequestScheduler,
  context: StagedScanContext,
): Promise<RenderedAnalysisResult> {
  const surfaceGuard = createPageWorkGuard(context.runGuard);
  const surfaceRecord = await scheduler
    .holdLane(() =>
      withPageWorkDeadline(
        `mobile surface for ${url}`,
        runMobileSurfaceAnalysis(browser, url, {
          evidenceEpoch: context.evidenceEpoch,
          ...(context.userAgent !== undefined ? { userAgent: context.userAgent } : {}),
          ...(context.timeoutMs !== undefined ? { timeoutMs: context.timeoutMs } : {}),
          beforeNavigation: () => scheduler.pace(),
          guard: surfaceGuard,
          ...(context.networkPolicy !== undefined ? { networkPolicy: context.networkPolicy } : {}),
          ...(context.onNetworkSafetyBlocked !== undefined
            ? { onNetworkSafetyBlocked: context.onNetworkSafetyBlocked }
            : {}),
          exclusionPatterns: context.exclusionPatterns,
        }),
        FULL_SCAN_PAGE_WATCHDOG_MS,
        surfaceGuard,
      ),
    )
    .then((record: MobileSurfaceRecord) => ({
      result: {
        ...result,
        mobileSurface: record,
        surfaces: [...(result.surfaces ?? []), record.surface],
        surfaceLinks: [
          ...(result.surfaceLinks ?? []),
          ...record.links.map((link): SurfaceLinkDiscovery => ({
            url: link,
            source: 'rendered-link',
            surfaceId: record.surface.surfaceId,
          })),
        ],
      },
      limitation: undefined as SurfaceLimitationRecord | undefined,
    }))
    .catch(
      (
        error: unknown,
      ): {
        result: RenderedAnalysisResult;
        limitation: SurfaceLimitationRecord | undefined;
      } => {
        // A mobile surface that cannot keep the published identity must
        // never degrade into a desktop-only audit silently; and a crashed
        // pass must be a recorded scanner fact, never an invisible one.
        const statement =
          error instanceof SurfaceIdentityError
            ? MOBILE_SURFACE_IDENTITY_REFUSED
            : MOBILE_SURFACE_UNAVAILABLE;
        return {
          result,
          limitation: {
            ...statement,
            detail: error instanceof Error ? error.message : String(error),
          },
        };
      },
    );
  const withSurface: RenderedAnalysisResult = {
    ...surfaceRecord.result,
    ...(surfaceRecord.limitation !== undefined
      ? {
          surfaceLimitations: [
            ...(surfaceRecord.result.surfaceLimitations ?? []),
            surfaceRecord.limitation,
          ],
        }
      : {}),
  };
  return withSurface;
}

/**
 * Plan 059 step 13: one page's consent surface, taken in its own turn from
 * the shared scheduler in a storage-fresh context. The runner clicks only
 * what the deterministic selection proved safe; every refusal or failed
 * dismissal is disclosed on the page as a surface limitation.
 */
async function attachConsentSurface(
  url: string,
  result: RenderedAnalysisResult,
  browser: Browser,
  scheduler: HostRequestScheduler,
  context: StagedScanContext,
): Promise<RenderedAnalysisResult> {
  const surfaceGuard = createPageWorkGuard(context.runGuard);
  const outcome = await scheduler
    .holdLane(() =>
      withPageWorkDeadline(
        `consent surface for ${url}`,
        runConsentSurfaceAnalysis(browser, url, {
          evidenceEpoch: context.evidenceEpoch,
          ...(context.userAgent !== undefined ? { userAgent: context.userAgent } : {}),
          ...(context.timeoutMs !== undefined ? { timeoutMs: context.timeoutMs } : {}),
          beforeNavigation: () => scheduler.pace(),
          guard: surfaceGuard,
          ...(context.networkPolicy !== undefined ? { networkPolicy: context.networkPolicy } : {}),
          ...(context.onNetworkSafetyBlocked !== undefined
            ? { onNetworkSafetyBlocked: context.onNetworkSafetyBlocked }
            : {}),
          exclusionPatterns: context.exclusionPatterns,
        }),
        FULL_SCAN_PAGE_WATCHDOG_MS,
        surfaceGuard,
      ),
    )
    .catch((error: unknown): ConsentSurfaceOutcome => ({
      baseline: result.consentBaseline ?? { state: 'undetermined', controlCount: 0 },
      dismissed: false,
      links: [],
      limitation: {
        ...CONSENT_SURFACE_UNAVAILABLE,
        detail: error instanceof Error ? error.message : String(error),
      },
    }));
  // A dismissal that did not take effect (guard abort, failed click) is a
  // recorded scanner fact on the page, never an invisible shortfall.
  const limitations = [...(result.surfaceLimitations ?? [])];
  if (outcome.limitation !== undefined) limitations.push(outcome.limitation);
  else if (outcome.dismissed === false && outcome.transition !== undefined) {
    limitations.push({
      ...CONSENT_SURFACE_INEFFECTIVE,
      detail: outcome.transition.guardReason ?? 'the rejection did not dismiss the banner',
    });
  }
  const consentLinks =
    outcome.surface !== undefined && outcome.links.length > 0
      ? [
          ...(result.surfaceLinks ?? []),
          ...outcome.links.map((link): SurfaceLinkDiscovery => ({
            url: link,
            source: 'rendered-link',
            surfaceId: outcome.surface!.surfaceId,
          })),
        ]
      : undefined;
  return {
    ...result,
    consentSurface: outcome,
    surfaces: [
      ...(result.surfaces ?? []),
      ...(outcome.surface !== undefined ? [outcome.surface] : []),
    ],
    ...(consentLinks !== undefined ? { surfaceLinks: consentLinks } : {}),
    ...(limitations.length > (result.surfaceLimitations ?? []).length
      ? { surfaceLimitations: limitations }
      : {}),
  };
}

/** `crawlSite` (via Step 3's wiring) always attaches an audit profile to
 *  every page it marks `visited`, falling back to an empty-facts profile
 *  on extraction failure rather than leaving the field unset - so a
 *  missing profile here means that invariant broke, not a normal
 *  condition to fall back from silently. Full-audit coverage depends on
 *  every visited page being planned; silently skipping one would be
 *  exactly the "quietly under-report the site" failure class this plan
 *  exists to close, so this throws instead. */
/** The same all-empty fact set crawl.ts falls back to when its own
 *  extraction fails, used here as a wave page's planning profile: a
 *  surface-discovered page was never crawl-extracted, so the planner
 *  honestly knows nothing about it. */
function emptyRawPageAuditFacts(): RawPageAuditFacts {
  return {
    metaRobotsNoindex: false,
    jsonLdTypes: [],
    paginationRelNext: false,
    paginationRelPrev: false,
    numberedPaginationControlCount: 0,
    bodyClassTokens: [],
    transactionalFormSignalCount: 0,
    externalTransactionalLinkCount: 0,
    repeatedTeaserLinkGroupSize: 0,
    structuralTokens: [],
  };
}

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
 *
 * Issue #500: only a slim record of each reused page is kept for the rest of
 * the stage. Its axe, Lighthouse and evidence payloads stay on disk; on a
 * large site they were gigabytes of heap held after exactly the events that
 * cause a resume, and an out-of-memory crash then caused the same resume.
 */
export function partitionPagesForResume(
  pagesToScan: readonly CrawledPage[],
  readExisting: (url: string) => PageScanResult | undefined,
  binding?: EvidenceBinding,
): { completedByUrl: Map<string, ResumedPageRecord>; pending: CrawledPage[] } {
  const completedByUrl = new Map<string, ResumedPageRecord>();
  const pending: CrawledPage[] = [];
  for (const page of pagesToScan) {
    const existing = readExisting(page.url);
    if (
      existing !== undefined &&
      existing.renderedCostProfile !== undefined &&
      (binding === undefined || isBoundToEvidence(existing, binding))
    ) {
      completedByUrl.set(page.url, slimResumedPage(existing));
    } else {
      pending.push(page);
    }
  }
  return { completedByUrl, pending };
}

/** What a resumed stage reads from a page an earlier attempt finished. */
export interface ResumedPageRecord {
  checkOutcomes?: PageScanResult['checkOutcomes'];
  renderedCostProfile?: PageScanResult['renderedCostProfile'];
  surfaceLinks?: PageScanResult['surfaceLinks'];
  acquisitionAttempts?: PageScanResult['acquisitionAttempts'];
  /** scan.json records a Lighthouse result or a Lighthouse error. */
  hasLighthouseOutcome: boolean;
}

export function slimResumedPage(scanJson: PageScanResult): ResumedPageRecord {
  return {
    ...(scanJson.checkOutcomes !== undefined ? { checkOutcomes: scanJson.checkOutcomes } : {}),
    ...(scanJson.renderedCostProfile !== undefined
      ? { renderedCostProfile: scanJson.renderedCostProfile }
      : {}),
    ...(scanJson.surfaceLinks !== undefined ? { surfaceLinks: scanJson.surfaceLinks } : {}),
    ...(scanJson.acquisitionAttempts !== undefined
      ? { acquisitionAttempts: scanJson.acquisitionAttempts }
      : {}),
    hasLighthouseOutcome:
      scanJson.lighthouse !== undefined || scanJson.lighthouseError !== undefined,
  };
}

/** The scope and epoch a resumed run's evidence must belong to. */
interface EvidenceBinding {
  scopeDigest: string;
  evidenceEpoch: number;
}

/**
 * Plan 059 step 22: a page result is reusable only when it carries attempts
 * and every one of them was acquired under this run's scope and epoch. A
 * result from another scope or epoch, or one written before attempts were
 * recorded, is rescanned rather than handed to the evidence graph, which
 * would only reject it later.
 */
function isBoundToEvidence(scanJson: PageScanResult, binding: EvidenceBinding): boolean {
  const attempts = scanJson.acquisitionAttempts ?? [];
  return (
    attempts.length > 0 &&
    attempts.every(
      (attempt) =>
        attempt.scopeDigest === binding.scopeDigest &&
        attempt.evidenceEpoch === binding.evidenceEpoch,
    )
  );
}

/**
 * Plan 035's content-scan skip rule for the Lighthouse phase: a page
 * whose on-disk scan.json already records a Lighthouse outcome, success
 * or failure, is done (a recorded failure is a recorded fact, not
 * something a resume retries). Only a selected page whose scan.json
 * carries neither field still needs its Lighthouse pass.
 */
export function needsLighthouseRun(
  decision: PageAuditDecision,
  resumed: Pick<ResumedPageRecord, 'hasLighthouseOutcome'>,
): boolean {
  return decision.plannedPasses.includes('lighthouse') && !resumed.hasLighthouseOutcome;
}

interface RecoveryPageStore {
  load: (url: string) => PageScanResult;
  store: (url: string, page: PageScanResult) => void;
  /** Called once per page whose retries are finished, so the job keeps a
   *  heartbeat through a stage that can run for many minutes. */
  onPageDone?: (url: string) => void;
}

const PROFILE_ORDER: readonly AttemptExecutionProfile[] = [
  'normal',
  'isolated-retry',
  'diagnostic-retry',
];

/**
 * Plan 059 section 10's targeted recovery: rerun only the pages that have a
 * recoverably failed check, one page at a time through the shared scheduler,
 * and keep only the retried checks' results. Everything that already
 * succeeded stays exactly as first observed.
 *
 * The lowest pending rung runs first, so a check that a fresh context can fix
 * never costs a browser launch. A diagnostic rung launches its own browser
 * (through the caller's launcher, which carries the egress policy) with twice
 * the bounded timeout, and closes it afterwards. Without a launcher a
 * diagnostic rung cannot honestly run, so those checks stay recorded gaps.
 * Screenshots from a retry land under `recovery/<profile>/` so a retry never
 * overwrites the bytes an accepted first attempt still points at.
 */
async function recoverFailedChecks(
  retryQueue: Map<string, RetryRequest[]>,
  browser: Browser,
  delayMs: number,
  scheduler: HostRequestScheduler,
  context: StagedScanContext,
  pages: RecoveryPageStore,
): Promise<void> {
  const pendingUrls = [...retryQueue.keys()].sort();
  for (const url of pendingUrls) {
    let requests = retryQueue.get(url) ?? [];
    for (;;) {
      if (context.launchRecoveryBrowser === undefined) {
        requests = requests.filter((request) => request.nextProfile !== 'diagnostic-retry');
      }
      if (requests.length === 0) break;
      const profile = PROFILE_ORDER.find((candidate) =>
        requests.some((request) => request.nextProfile === candidate),
      )!;
      const checkIds = requests
        .filter((request) => request.nextProfile === profile)
        .map((request) => request.checkId);
      const recoveryContext: StagedScanContext = {
        ...context,
        screenshotDir: path.join(path.dirname(context.screenshotDir), 'recovery', profile),
      };
      const recovery =
        profile === 'diagnostic-retry' ? await context.launchRecoveryBrowser!() : undefined;
      let outcome: { result: RenderedAnalysisResult; durationMs: number };
      try {
        outcome = await analyzePageInTurn(
          url,
          recovery?.browser ?? browser,
          delayMs,
          scheduler,
          recoveryContext,
          profile === 'diagnostic-retry' ? diagnosticTimeoutMs(context) : context.timeoutMs,
          [url],
        );
      } finally {
        await recovery?.browser.close();
      }
      const original = pages.load(url);
      const { records: attempts } = recordPageRun(
        context,
        url,
        outcome.result,
        outcome.durationMs,
        profile,
        checkIds,
      );
      const merged = mergeRetriedChecks(
        original,
        outcome.result,
        outcome.result.checkOutcomes,
        checkIds,
      );
      const allAttempts = [...(original.acquisitionAttempts ?? []), ...attempts];
      pages.store(url, { ...merged.page, acquisitionAttempts: allAttempts });
      requests = retryRequestsFor(allAttempts);
    }
    pages.onPageDone?.(url);
  }
}

/**
 * One Lighthouse measurement with its section 10 ladder. Each rung is a new
 * isolated Lighthouse process already; the diagnostic rung additionally gets
 * a fresh browser from the caller's launcher. Attempts are recorded only on
 * the Plan 059 path, but the retry itself follows the same ladder there only,
 * so every other caller keeps its historical single run.
 */
async function acquireLighthouseRun(
  url: string,
  debugPort: number,
  scheduler: HostRequestScheduler,
  context: StagedScanContext,
  runIndex: number,
): Promise<{ result: LighthouseAnalysisResult; records: AcquisitionAttemptRecord[] }> {
  const records: AcquisitionAttemptRecord[] = [];
  let profile: AttemptExecutionProfile = 'normal';
  for (;;) {
    const recovery =
      profile === 'diagnostic-retry' && context.launchRecoveryBrowser !== undefined
        ? await context.launchRecoveryBrowser()
        : undefined;
    const startedAt = new Date();
    let result: LighthouseAnalysisResult;
    const navigationUrl = context.servedUrlByIdentity.get(url);
    try {
      result = await runLighthouseAnalysis(url, recovery?.debugPort ?? debugPort, {
        scheduler,
        ...(navigationUrl !== undefined ? { navigationUrl } : {}),
      });
    } finally {
      await recovery?.browser.close();
    }
    if (context.scopeDigest === undefined) return { result, records };
    const record = lighthouseAttemptRecord({
      url,
      runIndex,
      scopeDigest: context.scopeDigest,
      evidenceEpoch: context.evidenceEpoch,
      startedAt,
      finishedAt: new Date(),
      executionProfile: profile,
      lighthouse: result.lighthouse,
      lighthouseError: result.lighthouseError,
    });
    records.push(record);
    if (record.outcome === 'succeeded') return { result, records };
    const next = nextExecutionProfile(record.failureClass, profile);
    if (
      !next.retryable ||
      next.nextProfile === 'stop-escalate' ||
      (next.nextProfile === 'diagnostic-retry' && context.launchRecoveryBrowser === undefined)
    ) {
      return { result, records };
    }
    profile = next.nextProfile;
  }
}

/** Every run of one audit is taken under the audit's single environment
 *  fingerprint, which the evidence graph records. */
const AUDIT_ENVIRONMENT_REF = 'audit-environment';

/** Section 12 never owes more than three runs; this only bounds the loop. */
const MAX_LIGHTHOUSE_RUNS_PER_PAGE = 3;

/**
 * Plan 059 section 12: the Lighthouse runs one selected page is owed, taken
 * one after another, each with its own recovery ladder. The homepage,
 * transactional pages and operator seeds get three runs; any other page one,
 * plus a second when that run is severe, near a grade boundary, or the set
 * turns out unstable. A run whose ladder ends in failure closes the set: the
 * set then records the shortfall instead of retrying without bound.
 *
 * The page keeps the full report of its representative run (the median
 * performance score, never the best). Outside the Plan 059 path, or for a
 * page the planner has no decision for, the historical single run stands.
 */
async function acquirePerformanceMeasurement(
  url: string,
  decision: PageAuditDecision | undefined,
  debugPort: number,
  scheduler: HostRequestScheduler,
  context: StagedScanContext,
): Promise<{
  result: LighthouseAnalysisResult;
  records: AcquisitionAttemptRecord[];
  measurementSet?: PerformanceMeasurementSet;
}> {
  if (context.scopeDigest === undefined || decision === undefined) {
    return acquireLighthouseRun(url, debugPort, scheduler, context, 1);
  }
  const pageClass = performancePageClassOf(decision);
  const runs: LighthouseRunInput[] = [];
  const reports = new Map<string, LighthouseAnalysisResult>();
  const records: AcquisitionAttemptRecord[] = [];
  const triggers = new Set<RepeatTrigger>();
  let lastResult: LighthouseAnalysisResult = {};
  const buildSet = (): PerformanceMeasurementSet =>
    buildPerformanceMeasurementSet({
      url,
      profile: 'mobile',
      pageClass,
      selectionReasons: decision.reasonCodes,
      runs,
      repeatTriggers: [...triggers],
      tolerances: CALIBRATED_STABILITY_TOLERANCES,
      toleranceProvenance: 'calibrated',
    });

  for (let runIndex = 1; runIndex <= MAX_LIGHTHOUSE_RUNS_PER_PAGE; runIndex += 1) {
    const measuredRunCount = reports.size;
    if (measuredRunCount >= 2) {
      for (const trigger of repeatTriggersFromAssessment(buildSet().confidence)) {
        triggers.add(trigger);
      }
    }
    const allowance = runsOwedForPage({
      pageClass,
      measuredRunCount,
      repeatTriggers: [...triggers],
    });
    if (allowance.runsOutstanding === 0) break;

    const run = await acquireLighthouseRun(url, debugPort, scheduler, context, runIndex);
    records.push(...run.records);
    lastResult = run.result;
    const runId = `lab-run-${runIndex}`;
    const observedAt = new Date(run.records.at(-1)?.finishedAt ?? Date.now());
    if (run.result.lighthouse === undefined) {
      runs.push({
        runId,
        observedAt,
        environmentFingerprintRef: AUDIT_ENVIRONMENT_REF,
        outcome: { kind: 'failed', reason: run.result.lighthouseError ?? 'no report' },
      });
      break;
    }
    const metrics = labMetricsFromLighthouse(run.result.lighthouse);
    runs.push({
      runId,
      observedAt,
      environmentFingerprintRef: AUDIT_ENVIRONMENT_REF,
      outcome: { kind: 'measured', metrics },
    });
    reports.set(runId, run.result);
    for (const trigger of gradingRepeatTriggers(metrics)) triggers.add(trigger);
  }

  const measurementSet = buildSet();
  const representative = representativeRunId(measurementSet);
  const lighthouseByRun = new Map(
    [...reports].flatMap(([runId, report]) =>
      report.lighthouse === undefined ? [] : [[runId, report.lighthouse] as const],
    ),
  );
  const composed = composeRepresentativeReport(measurementSet, lighthouseByRun);
  const result =
    representative === undefined
      ? lastResult
      : {
          ...reports.get(representative)!,
          ...(composed === undefined ? {} : { lighthouse: composed }),
        };
  return { result, records, measurementSet };
}

/** Section 6 bounds the fixed point: a documented wave budget stops the
 *  loop, and anything still unadmitted then carries a terminal
 *  continuation-bound disposition rather than sitting undispositioned. */
const MAX_SURFACE_DISCOVERY_WAVES = 3;

/** A page whose hydrated/state content exposes more than this many new
 *  links is an effectively infinite family (calendar, faceted listing);
 *  the surplus is bounded the way the crawl bounds its own repetitive
 *  families and disclosed through the same disposition. */
const MAX_SURFACE_LINKS_PER_REFERRER = 50;

/**
 * Plan 059 step 11/14: the bounded discovery fixed point over the links
 * the state surfaces discovered. Every candidate is first recorded into
 * the inventory with its surface provenance (the route is evidence even
 * when the candidate ends up bounded), then either admitted and scanned by
 * a wave of the same rendered-analysis lanes the initial inventory used,
 * or given a terminal disposition naming the bound that stopped it —
 * depth, page cap, continuation bound, robots, or network safety. The
 * loop stops when a wave produces no new eligible candidate (the section 6
 * fixed point) or at the wave budget, with the remainder disposed and
 * disclosed rather than silently dropped.
 *
 * A wave page is a real page of the site: it takes its turns from the same
 * scheduler, gets the same surfaces (mobile, hydration), feeds the same
 * retry queue, and its own discoveries feed the next wave.
 */
async function runDiscoveryWaves(args: {
  browser: Browser;
  delayMs: number;
  concurrency: number;
  scheduler: HostRequestScheduler;
  context: StagedScanContext;
  onLanePageDone: (
    url: string,
    result: RenderedAnalysisResult,
    durationMs: number,
  ) => Promise<void>;
  retryQueue: Map<string, RetryRequest[]>;
  initialUrls: ReadonlySet<string>;
  depthByUrl: Map<string, number>;
  growTotalPages: (count: number) => void;
}): Promise<readonly string[]> {
  const { context } = args;
  const inventory = context.inventory;
  const dispose = (
    link: SurfaceLinkDiscovery & { referrer: string; depth?: number },
    disposition: InventoryDisposition,
    detail: string,
  ): void => {
    inventory?.recordDisposition({ url: link.url, disposition, decidedAt: new Date(), detail });
  };
  const processed = new Set<string>();
  const admitted: string[] = [];
  const admittedPerReferrer = new Map<string, number>();

  // Records every unprocessed surface link into the inventory (additive,
  // idempotent per route) and returns those that may still be admitted.
  const collectPending = (): (SurfaceLinkDiscovery & {
    referrer: string;
    depth?: number;
  })[] => {
    const pending: (SurfaceLinkDiscovery & { referrer: string; depth?: number })[] = [];
    for (const link of context.surfaceLinks) {
      if (processed.has(link.url)) continue;
      processed.add(link.url);
      inventory?.recordDiscovery({
        url: link.url,
        source: link.source,
        discoveredAt: new Date(),
        referrer: link.referrer,
        ...(link.surfaceId !== undefined ? { surfaceId: link.surfaceId } : {}),
        ...(link.depth !== undefined ? { depth: link.depth } : {}),
      });
      if (args.initialUrls.has(link.url)) continue;
      if (inventory?.candidate(link.url)?.disposition !== undefined) continue;
      pending.push(link);
    }
    return pending;
  };

  for (let wave = 0; wave < MAX_SURFACE_DISCOVERY_WAVES; wave += 1) {
    const pending = collectPending();
    if (pending.length === 0) return admitted;
    const wavePages: CrawledPage[] = [];
    for (const link of pending) {
      const depth = link.depth ?? 0;
      if (depth > context.maxDepth) {
        dispose(
          link,
          'depth-bound',
          `discovered at depth ${depth}; maxDepth is ${context.maxDepth}`,
        );
        continue;
      }
      if (args.initialUrls.size + admitted.length >= context.maxPages) {
        dispose(link, 'page-cap', `crawl stopped after reaching maxPages=${context.maxPages}`);
        continue;
      }
      const referrerCount = admittedPerReferrer.get(link.referrer) ?? 0;
      if (referrerCount >= MAX_SURFACE_LINKS_PER_REFERRER) {
        dispose(
          link,
          'continuation-guard',
          `surface discovery from ${link.referrer} reached its ${MAX_SURFACE_LINKS_PER_REFERRER}-link bound`,
        );
        continue;
      }
      try {
        context.robotsPolicyRuntime?.assertAllowed(link.url);
      } catch (error) {
        dispose(
          link,
          'robots',
          error instanceof Error ? error.message : 'disallowed by the current robots policy',
        );
        continue;
      }
      try {
        await context.assertSafeUrl(link.url);
      } catch (error) {
        dispose(
          link,
          'network-safety',
          error instanceof Error ? error.message : 'blocked by the network target policy',
        );
        continue;
      }
      admittedPerReferrer.set(link.referrer, referrerCount + 1);
      admitted.push(link.url);
      args.depthByUrl.set(link.url, depth);
      wavePages.push({ url: link.url, depth, status: 'visited', discoveryMethod: 'link' });
    }
    if (wavePages.length === 0) continue;
    args.growTotalPages(wavePages.length);
    const lanes: string[][] = Array.from({ length: args.concurrency }, () => []);
    wavePages.forEach((page, index) => {
      lanes[index % args.concurrency]!.push(page.url);
    });
    await Promise.all(
      lanes
        .filter((laneUrls) => laneUrls.length > 0)
        .map((laneUrls) =>
          runRenderedAnalysisLane(
            laneUrls,
            args.browser,
            args.delayMs,
            args.scheduler,
            context,
            args.onLanePageDone,
          ),
        ),
    );
  }
  // The wave budget, not the frontier, ended the loop: whatever is still
  // unprocessed is a known candidate and must not sit undispositioned.
  const bounded = collectPending();
  for (const link of bounded) {
    dispose(
      link,
      'continuation-guard',
      `surface discovery reached its ${MAX_SURFACE_DISCOVERY_WAVES}-wave bound`,
    );
  }
  return admitted;
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
  /** Plan 059 step 11: pages admitted by the bounded discovery fixed point
   *  and scanned by this run, so the inventory can disposition them. */
  discoveryAdmittedUrls: readonly string[];
  /** The same pages as crawl entries, so the manifest lists and the
   *  normalizer reads what the run scanned. */
  discoveryAdmittedPages: CrawledPage[];
}> {
  // Plan 059 step 11: the content plan is built after the discovery waves,
  // because a wave page is a real page of the site and joins planning (and
  // therefore Lighthouse selection) exactly like a crawled one.

  // Plan 035 (issue #124): on a validated resume, pages whose scan.json is
  // already on disk (with a rendered cost profile) skip the content lanes
  // entirely; everything the planner and the emit path need from them is
  // rebuilt from the persisted scan.json below. Outside a validated resume
  // this is a no-op partition over an empty set: skipping existing results
  // is never active for a fresh run.
  const resumePartition =
    context.resumeActive && context.writePagesAsScanned === true && context.auditDir !== undefined
      ? partitionPagesForResume(
          pagesToScan,
          (url) => readPageScanJson(context.screenshotDir, url),
          context.scopeDigest !== undefined
            ? { scopeDigest: context.scopeDigest, evidenceEpoch: context.evidenceEpoch }
            : undefined,
        )
      : undefined;
  const completedByUrl = resumePartition?.completedByUrl ?? new Map<string, ResumedPageRecord>();
  const pendingPages = resumePartition?.pending ?? pagesToScan;

  // A resumed run whose content stage already finished (every crawled page
  // reused, and the stage marker bound to this crawl, scope and epoch)
  // restores the discovery-wave pages from disk and skips the waves and the
  // failed-check recovery, which would otherwise replay silently before
  // Lighthouse resumes. Any other run clears a stale marker first.
  const markerDir = context.writePagesAsScanned === true ? context.auditDir : undefined;
  const stageBinding = {
    crawledUrls: pagesToScan.map((page) => page.url),
    scopeDigest: context.scopeDigest,
    evidenceEpoch: context.evidenceEpoch,
  };
  let resumedWaveUrls: readonly string[] | undefined;
  if (resumePartition !== undefined && pendingPages.length === 0 && markerDir !== undefined) {
    const waveUrls = readContentStageMarker(markerDir, stageBinding);
    if (waveUrls !== undefined) {
      const waves = partitionPagesForResume(
        waveUrls.map((url) => ({ url, depth: 0, status: 'visited', discoveryMethod: 'link' })),
        (url) => readPageScanJson(context.screenshotDir, url),
        context.scopeDigest !== undefined
          ? { scopeDigest: context.scopeDigest, evidenceEpoch: context.evidenceEpoch }
          : undefined,
      );
      if (waves.pending.length === 0) {
        for (const [url, scanJson] of waves.completedByUrl) completedByUrl.set(url, scanJson);
        resumedWaveUrls = waveUrls;
      }
    }
  }
  if (resumedWaveUrls === undefined && markerDir !== undefined) clearContentStageMarker(markerDir);

  const renderedResults = new Map<string, RenderedAnalysisResult>();
  const renderedCosts = new Map<string, RenderedCostProfile>();
  // Surface-discovered links keep their referring page's frontier depth so
  // the fixed-point admission (step 14) can apply the same depth bound the
  // crawl did.
  const depthByUrl = new Map(pagesToScan.map((page) => [page.url, page.depth]));
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
    // A resumed page's surface discoveries were collected by the attempt
    // that scanned it; they feed this run's fixed point too.
    if (scanJson.surfaceLinks !== undefined && scanJson.surfaceLinks.length > 0) {
      context.surfaceLinks.push(
        ...scanJson.surfaceLinks.map((link) => ({
          ...link,
          referrer: url,
          depth: (depthByUrl.get(url) ?? 0) + 1,
        })),
      );
    }
  }
  // Freeze mobile/consent surface selection before the first content lane.
  // The profiles follow crawl inventory order; two representatives are
  // chosen per family from that sequence, while wave pages are singleton
  // families and join later as selected pages.
  const initialContentPlan = buildContentAuditPlan(pagesToScan.map(toPlanProfile));
  const initialSurfaceSampling = new Map(
    initialContentPlan.surfaceSampling.map((sample) => [sample.url, sample]),
  );
  const initiallySelectedSurfaceShare =
    initialContentPlan.surfaceSampling.length === 0
      ? 0
      : initialContentPlan.surfaceSampling.filter((sample) => sample.selected).length /
        initialContentPlan.surfaceSampling.length;
  const initialLighthousePlan = finalizeLighthousePlan(initialContentPlan, new Map());
  const initialLighthouseShare =
    initialLighthousePlan.decisions.length === 0
      ? 0
      : initialLighthousePlan.decisions.filter((decision) =>
          decision.plannedPasses.includes('lighthouse'),
        ).length / initialLighthousePlan.decisions.length;
  const plannedSlotsPerPage =
    3 +
    initiallySelectedSurfaceShare *
      (Number(context.mobileSurfaces) + Number(context.stateSurfaces)) +
    initialLighthouseShare;

  // Starts at the reused count so content-scan-page progress stays
  // truthful against the full inventory size.
  let contentCompleted = completedByUrl.size;
  onProgress?.({
    type: 'content-scan-start',
    totalPages: pagesToScan.length + (resumedWaveUrls?.length ?? 0),
    alreadyCompleted: completedByUrl.size,
    concurrency,
    requestStartCount: scheduler.requestStartCount,
    currentDelayMs: scheduler.effectiveDelayMs,
    plannedSlotsPerPage,
  });

  // Plan 059 section 10: pages with a check that failed recoverably, and
  // the profile each such check may retry under. Seeded from a resumed
  // page's persisted attempts too, so a crash between the content lanes and
  // recovery does not quietly turn a retryable gap into a final one.
  const retryQueue = new Map<string, RetryRequest[]>();
  for (const [url, scanJson] of completedByUrl) {
    const retries = retryRequestsFor(scanJson.acquisitionAttempts ?? []);
    if (retries.length > 0) retryQueue.set(url, retries);
  }

  // Total page count the staged progress events report against. The
  // discovery waves (step 11) grow it as they admit pages, so the counts
  // never promise work that does not exist nor hide work that does.
  let totalPages = pagesToScan.length + (resumedWaveUrls?.length ?? 0);

  // Plan 059 steps 8/26: each crawled page's audit profile joins its scan
  // result here so scan.json persists the signals the evidence graph's
  // semantic classifier reads. Wave pages have no crawl profile and stay
  // absent, which the classifier discloses as an explicit unknown role.
  const auditProfileByUrl = new Map<string, PageAuditProfile>();
  for (const page of pagesToScan) {
    if (page.auditProfile !== undefined) auditProfileByUrl.set(page.url, page.auditProfile);
  }

  /** The per-page completion path shared by the initial content lanes and
   *  every discovery wave: attempts, surfaces, discovery collection,
   *  persistence, progress. */
  const onLanePageDone = async (
    url: string,
    laneResult: RenderedAnalysisResult,
    durationMs: number,
  ): Promise<void> => {
    const { records: attempts, baselineSurfaceId } = recordPageRun(
      context,
      url,
      laneResult,
      durationMs,
      'normal',
      PAGE_CHECK_IDS,
    );
    let result: RenderedAnalysisResult =
      attempts.length > 0 ? { ...laneResult, acquisitionAttempts: attempts } : laneResult;
    const crawlAuditProfile = auditProfileByUrl.get(url);
    if (crawlAuditProfile !== undefined) result = { ...result, auditProfile: crawlAuditProfile };
    const retries = retryRequestsFor(attempts);
    if (retries.length > 0) retryQueue.set(url, retries);
    // Plan 059 step 11: links that existed only after the sweep
    // carry `hydrated-link` provenance on the baseline surface.
    const hydratedLinks = laneResult.hydrationSweep?.discoveredLinks ?? [];
    if (hydratedLinks.length > 0 && baselineSurfaceId !== undefined) {
      result = {
        ...result,
        surfaceLinks: [
          ...(result.surfaceLinks ?? []),
          ...hydratedLinks.map((link): SurfaceLinkDiscovery => ({
            url: link,
            source: 'hydrated-link',
            surfaceId: baselineSurfaceId,
          })),
        ],
      };
    }
    const sample = initialSurfaceSampling.get(url);
    const selectedForSurfaces = sample?.selected ?? true;
    if (!selectedForSurfaces && (context.mobileSurfaces || context.stateSurfaces)) {
      const plannedOutOfScopeSurfaceIds: string[] = [];
      if (context.mobileSurfaces) {
        plannedOutOfScopeSurfaceIds.push(
          mobileSurface({
            evidenceEpoch: context.evidenceEpoch,
            pageIdentity: url,
            userAgent: getCrawlerUserAgent(),
            crawlerUserAgent: getCrawlerUserAgent(),
            readinessOutcome: 'ready',
          }).surfaceId,
        );
      }
      if (context.stateSurfaces && result.consentBaseline?.state === 'consent-controls-detected') {
        plannedOutOfScopeSurfaceIds.push(
          consentSurface({
            evidenceEpoch: context.evidenceEpoch,
            pageIdentity: url,
            userAgent: context.userAgent ?? getCrawlerUserAgent(),
          }).surfaceId,
        );
      }
      result = {
        ...result,
        surfaceSkipped: 'family-sampled',
        ...(plannedOutOfScopeSurfaceIds.length > 0 ? { plannedOutOfScopeSurfaceIds } : {}),
      };
    }
    // Plan 059 step 13: the consent-rejected surface runs where the
    // delivered baseline carried consent controls, in a storage-fresh
    // context of its own (section 9), and only inside the plan's sample.
    if (
      selectedForSurfaces &&
      context.stateSurfaces &&
      result.consentBaseline?.state === 'consent-controls-detected'
    ) {
      result = await attachConsentSurface(url, result, browser, scheduler, context);
    }
    // Plan 059 step 13: the local-state surface is registered when the
    // page's bounded disclosure exploration actually ran; links seen only
    // in the opened states are discovered under that surface's identity.
    const localStates = result.localStates;
    if (context.stateSurfaces && (localStates?.transitions.length ?? 0) > 0) {
      const stateSurface = localStateSurface({
        evidenceEpoch: context.evidenceEpoch,
        pageIdentity: url,
        userAgent: context.userAgent ?? getCrawlerUserAgent(),
      });
      const stateLinks =
        localStates !== undefined && localStates.links.length > 0
          ? [
              ...(result.surfaceLinks ?? []),
              ...localStates.links.map((link): SurfaceLinkDiscovery => ({
                url: link,
                source: 'rendered-link',
                surfaceId: stateSurface.surfaceId,
              })),
            ]
          : undefined;
      result = {
        ...result,
        surfaces: [...(result.surfaces ?? []), stateSurface],
        ...(stateLinks !== undefined ? { surfaceLinks: stateLinks } : {}),
      };
    }
    // Plan 059 step 10: the mobile surface runs only after this
    // page's immutable baseline capture is complete, and in a
    // context of its own (section 9).
    if (context.mobileSurfaces && selectedForSurfaces) {
      result = await attachMobileSurface(url, result, browser, scheduler, context);
    }
    if (result.surfaceLinks !== undefined && result.surfaceLinks.length > 0) {
      context.surfaceLinks.push(
        ...result.surfaceLinks.map((link) => ({
          ...link,
          referrer: url,
          depth: (depthByUrl.get(url) ?? 0) + 1,
        })),
      );
    }
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
      context.holdLease();
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
      totalPages,
      url,
      durationMs,
      requestStartCount: scheduler.requestStartCount,
      currentDelayMs: scheduler.effectiveDelayMs,
    });
  };

  const lanes: string[][] = Array.from({ length: concurrency }, () => []);
  pendingPages.forEach((page, index) => {
    lanes[index % concurrency]!.push(page.url);
  });

  await Promise.all(
    lanes
      .filter((laneUrls) => laneUrls.length > 0)
      .map((laneUrls) =>
        runRenderedAnalysisLane(laneUrls, browser, delayMs, scheduler, context, onLanePageDone),
      ),
  );

  /* ---- Plan 059 step 11/14: the bounded discovery fixed point ------ */
  // Links first seen on a state surface (hydrated now; consent and
  // local-state join later) re-enter the frontier here. Every candidate is
  // recorded into the inventory with its surface provenance, then either
  // admitted and scanned by a wave of the same lanes, or given a terminal
  // disposition naming the bound that stopped it. The loop stops only at
  // the section 6 stops: no new eligible candidate, or a documented bound.
  const admittedWaveUrls =
    resumedWaveUrls ??
    (await runDiscoveryWaves({
      browser,
      delayMs,
      concurrency,
      scheduler,
      context,
      onLanePageDone,
      retryQueue,
      initialUrls: new Set(pagesToScan.map((page) => page.url)),
      depthByUrl,
      growTotalPages: (count) => {
        totalPages += count;
      },
    }));

  if (resumedWaveUrls === undefined && retryQueue.size > 0) {
    let recovered = 0;
    const recoveryTotal = retryQueue.size;
    await recoverFailedChecks(retryQueue, browser, delayMs, scheduler, context, {
      onPageDone: (url) => {
        recovered += 1;
        onProgress?.({
          type: 'content-recovery-page',
          completed: recovered,
          totalPages: recoveryTotal,
          url,
        });
      },
      load: (url) => {
        if (context.writePagesAsScanned) {
          const fromDisk = readPageScanJson(context.screenshotDir, url);
          if (fromDisk === undefined) {
            throw new Error(`recovery: expected a scan.json already written for ${url}.`);
          }
          return fromDisk;
        }
        return renderedResults.get(url)!;
      },
      store: (url, page) => {
        if (context.writePagesAsScanned) {
          context.holdLease();
          writePageScanJson(context.screenshotDir, context.auditDir!, page);
          renderedResults.set(url, {
            url,
            checkOutcomes: page.checkOutcomes ?? {},
          } as RenderedAnalysisResult);
        } else {
          renderedResults.set(url, {
            ...page,
            checkOutcomes: page.checkOutcomes ?? {},
          } as RenderedAnalysisResult);
        }
        if (page.renderedCostProfile !== undefined) {
          renderedCosts.set(url, page.renderedCostProfile);
        }
      },
    });
  }

  // Plan 021 content planning happens here, after the discovery waves, so
  // a wave page is planned (and therefore Lighthouse-selected or not)
  // exactly like a crawled one. A wave page carries the crawl's own
  // extraction-failure fallback profile: its facts were never crawl-
  // extracted, so the planner honestly knows nothing about it and classifies
  // it as unknown rather than pretending otherwise.
  const waveProfiles = admittedWaveUrls.map((url) =>
    buildPageAuditProfile(emptyRawPageAuditFacts(), {
      url,
      isHomepage: false,
      isOperatorSeed: false,
    }),
  );
  const contentPlan = buildContentAuditPlan([...pagesToScan.map(toPlanProfile), ...waveProfiles]);
  const plannedPlan = finalizeLighthousePlan(contentPlan, renderedCosts);
  const initialUrls = new Set(initialContentPlan.surfaceSampling.map((sample) => sample.url));
  const finalizedPlan: FullAuditPlan = {
    ...plannedPlan,
    surfaceSampling: [
      ...initialContentPlan.surfaceSampling,
      ...plannedPlan.surfaceSampling.filter((sample) => !initialUrls.has(sample.url)),
    ],
  };
  if (resumedWaveUrls === undefined && markerDir !== undefined) {
    writeContentStageMarker(markerDir, buildContentStageMarker(stageBinding, admittedWaveUrls));
  }
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
    requestStartCount: scheduler.requestStartCount,
    currentDelayMs: scheduler.effectiveDelayMs,
    plannedSlotsPerPage: 1,
  });

  const pages: PageScanResult[] = [];
  const analysisCoverageByUrl = new Map<string, PageAnalysisCoverage>();
  const lighthouseAttemptsByUrl = new Map<string, AcquisitionAttemptRecord[]>();
  const measurementSetsByUrl = new Map<string, PerformanceMeasurementSet>();
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
        surfaceSample: finalizedPlan.surfaceSampling.find((sample) => sample.url === url) ?? {
          url,
          selected: true,
          reason: 'unique-family',
        },
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
    const measurementSet = measurementSetsByUrl.get(url);
    if (measurementSet !== undefined) pageResult.performanceMeasurement = measurementSet;
    const performanceAttempts = lighthouseAttemptsByUrl.get(url);
    if (performanceAttempts !== undefined && performanceAttempts.length > 0) {
      pageResult = {
        ...pageResult,
        acquisitionAttempts: [...(pageResult.acquisitionAttempts ?? []), ...performanceAttempts],
      };
    }
    if (context.writePagesAsScanned) context.holdLease();
    const kept = persistPageIfConfigured(
      pageResult,
      context.screenshotDir,
      context.auditDir,
      context.writePagesAsScanned,
    );
    if (kept !== undefined) pages.push(kept);
    // Resumed pages seed `scanned` from completedByUrl.size, even when a
    // selected page still needs Lighthouse. Persist its updated result
    // without counting the same page a second time.
    if (!completedByUrl.has(url)) scanned += 1;
    onProgress?.({ type: 'scan-page', scanned, totalPages, url, durationMs });
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
      // never re-run the pass. Read from disk here, one page at a time,
      // since the resume keeps only a slim record (issue #500).
      const persisted = readPageScanJson(context.screenshotDir, url);
      emit(
        url,
        {
          ...(persisted?.lighthouse !== undefined ? { lighthouse: persisted.lighthouse } : {}),
          ...(persisted?.lighthouseError !== undefined
            ? { lighthouseError: persisted.lighthouseError }
            : {}),
        },
        false,
        0,
      );
      continue;
    }
    const workStartedAtMs = Date.now();
    const {
      result: lighthouseResult,
      records,
      measurementSet,
    } = await acquirePerformanceMeasurement(url, decision, debugPort, scheduler, context);
    lighthouseAttemptsByUrl.set(url, records);
    if (measurementSet !== undefined) measurementSetsByUrl.set(url, measurementSet);
    const durationMs = Date.now() - workStartedAtMs;
    emit(url, lighthouseResult, true, durationMs);
    lighthouseCompleted += 1;
    onProgress?.({
      type: 'lighthouse-page',
      completed: lighthouseCompleted,
      totalPages: selectedUrls.size,
      url,
      durationMs,
      requestStartCount: scheduler.requestStartCount,
      currentDelayMs: scheduler.effectiveDelayMs,
    });
  }

  onProgress?.({ type: 'analysis-complete' });

  return {
    pages,
    fullAuditPlan: finalizedPlan,
    analysisCoverageByUrl,
    discoveryAdmittedUrls: admittedWaveUrls,
    discoveryAdmittedPages: admittedWaveUrls.map((url) => ({
      url,
      // A resumed run no longer knows the wave depth; below the crawl is
      // the only thing a surface link can be.
      depth: depthByUrl.get(url) ?? 1,
      status: 'visited',
      discoveryMethod: 'link',
    })),
  };
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
    scopeDigest: options.scopeDigest,
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

/** Plan 059 step 22: stops a superseded worker before it writes into an
 *  audit directory another worker now holds. No lease, no check. */
function holdLease(options: ScanSiteOptions): void {
  if (options.acquisitionLeaseId !== undefined && options.auditDir !== undefined) {
    assertAcquisitionLease(options.auditDir, options.acquisitionLeaseId);
  }
}

/**
 * Plan 059 section 13: persists the crawl's opening anchors and takes the
 * closing probe of the start page once every acquisition phase is done. A
 * probe the robots policy now forbids, or that fails, is left out: the
 * coherence verdict is then unknown, which blocks approval rather than
 * pretending the window closed cleanly.
 */
async function closeTemporalWindow(
  crawl: CrawlResult,
  options: ScanSiteOptions,
  scheduler: HostRequestScheduler,
  robotsPolicyRuntime: RobotsPolicyRuntime | undefined,
  onNetworkSafetyBlocked: NetworkSafetyBlockHandler | undefined,
): Promise<void> {
  const auditDir = options.auditDir!;
  const startProbes = crawl.startAnchors ?? [];
  let endProbe: StructuralAnchor | undefined;
  try {
    if (robotsPolicyRuntime !== undefined) {
      await robotsPolicyRuntime.refresh([crawl.startUrl]);
      robotsPolicyRuntime.assertAllowed(crawl.startUrl);
    }
    endProbe = await scheduler.schedule(() =>
      captureStructuralAnchor(options.browser, crawl.startUrl, {
        userAgent: options.userAgent ?? getCrawlerUserAgent(),
        timeoutMs: options.timeoutMs ?? getPageTimeoutMs(),
        ...(options.networkPolicy !== undefined ? { networkPolicy: options.networkPolicy } : {}),
        ...(onNetworkSafetyBlocked !== undefined ? { onNetworkSafetyBlocked } : {}),
      }),
    );
  } catch {
    endProbe = undefined;
  }
  holdLease(options);
  writeTemporalAnchors(auditDir, { startProbes, ...(endProbe !== undefined ? { endProbe } : {}) });
}

export async function scanSite(
  startUrl: string,
  options: ScanSiteOptions,
): Promise<SiteScanResult> {
  if (options.writePagesAsScanned && options.auditDir === undefined) {
    throw new Error('scanSite: writePagesAsScanned requires auditDir to be set.');
  }
  if (options.acquisitionLeaseId !== undefined && options.auditDir === undefined) {
    throw new Error('scanSite: acquisitionLeaseId requires auditDir to be set.');
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
  const pushbackEvents: HostPushbackEvent[] = [];
  const pacingRecoveryEvents: HostPacingRecoveredEvent[] = [];
  const scheduler = new HostRequestScheduler({
    floorDelayMs: options.delayMs ?? getCrawlDelayMs(),
    maxConcurrency: options.concurrency ?? getScanConcurrency(),
    onPushback: (event) => {
      pushbackEvents.push(event);
      options.onProgress?.({ type: 'pushback', event });
    },
    onPacingRecovered: (event) => {
      pacingRecoveryEvents.push(event);
      options.onProgress?.({ type: 'pacing-recovered', event });
    },
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
    throw new Error(`scanSite: network safety blocked ${url} (${verdict.disposition.reason})`);
  };
  const sitemapMode = options.sitemapMode ?? 'supplement';
  // Plan 059 section 13: only a scoped full audit that persists its evidence
  // opens a temporal-coherence window; every other run has no graph to feed.
  const captureTemporalAnchors =
    options.fullAuditPlanning === true &&
    options.scopeDigest !== undefined &&
    options.auditDir !== undefined &&
    options.skipLighthouse !== true;
  const crawlOptions = (frontier: CrawlOptions['frontier']): CrawlOptions => ({
    scheduler,
    browser: options.browser,
    guard: runGuard,
    evidenceEpoch: 1,
    ...(options.scopeDigest !== undefined ? { scopeDigest: options.scopeDigest } : {}),
    ...(captureTemporalAnchors ? { captureStartAnchors: true } : {}),
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
        scopeDigest: options.scopeDigest,
      });
      const frontierResumed = frontierState !== undefined && frontierVerdict.reusable;
      const writeFrontierState = (state: CrawlFrontierSnapshot): void => {
        holdLease(options);
        writeCrawlFrontierState(auditDir, {
          format: 'full-audit-crawl-frontier-v1',
          startedAt: checkpointContext.startedAt.toISOString(),
          config: checkpointContext.config,
          toolIdentity,
          ...(options.scopeDigest !== undefined ? { scopeDigest: options.scopeDigest } : {}),
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
    // Checked ahead of the coverage gate because the gate's advice (slow the
    // crawl) is wrong for a host that banned the crawler outright.
    if (crawl.hostStoppedAnswering !== undefined) {
      throw new HostStoppedAnsweringError(crawl.hostStoppedAnswering);
    }
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
      holdLease(options);
      writeCrawlCheckpoint(options.auditDir, {
        checkpointVersion: 'v1',
        startedAt: checkpointContext.startedAt.toISOString(),
        config: checkpointContext.config,
        toolIdentity: buildScanToolIdentity(),
        ...(options.scopeDigest !== undefined ? { scopeDigest: options.scopeDigest } : {}),
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
  const servedUrlByIdentity = new Map(
    crawl.pages
      .filter((page) => page.status === 'visited' && page.servedUrl !== undefined)
      .map((page) => [page.url, page.servedUrl!] as const),
  );
  options.onProgress?.({ type: 'crawl-exclusions', excluded: countCrawlExclusions(crawl.pages) });

  const inventoryLedger =
    crawl.inventoryLedger === undefined
      ? undefined
      : InventoryLedger.fromSnapshot(crawl.inventoryLedger);
  if (inventoryLedger !== undefined && options.auditDir !== undefined) {
    holdLease(options);
    writeInventoryLedger(options.auditDir, inventoryLedger.snapshot());
  }
  const finalizeInventoryLedger = (
    ...extraScannedUrlGroups: readonly (readonly string[])[]
  ): InventoryLedgerSnapshot | undefined => {
    if (inventoryLedger === undefined) return undefined;
    const scannedUrls = [...pagesToScan.map((page) => page.url), ...extraScannedUrlGroups.flat()];
    for (const url of scannedUrls) {
      let candidate = inventoryLedger.candidate(url);
      if (candidate === undefined) {
        // A resumed frontier can contain a visited page written by an older
        // checkpoint before its inventory row was persisted. The page was
        // genuinely visited, so failing the whole audit loses valid work;
        // recover it with explicit provenance instead of pretending it was a
        // normal link discovery. The resulting ledger remains reconciled and
        // makes the repair visible to downstream evidence consumers.
        candidate = inventoryLedger.recordDiscovery({
          url,
          source: 'visited-page-recovery',
          discoveredAt: new Date(),
          observedUrl: url,
        });
      }
      if (candidate.disposition === undefined) {
        inventoryLedger.recordDisposition({
          url,
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
    if (options.auditDir !== undefined) {
      holdLease(options);
      writeInventoryLedger(options.auditDir, snapshot);
    }
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
          ? {
              onChainChanged: (chain) => {
                holdLease(options);
                writeRobotsPolicyChain(options.auditDir!, chain);
              },
            }
          : {}),
      })
    : undefined;
  if (robotsPolicyRuntime !== undefined) {
    if (options.auditDir !== undefined && robotsPolicyRuntime.chain.length > 0) {
      holdLease(options);
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
  const homepageIdentity = crawl.homepageUrl ?? crawl.startUrl;
  const homepagePage = pagesToScan.find((page) => page.url === homepageIdentity);
  const homepageUrlForScan = homepagePage?.url;
  const mentionsLegalesUrlForScan = crawl.mentionsLegalesPageUrl ?? homepageUrlForScan;
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
  const homepageWasVisited = homepageUrlForScan !== undefined;
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

  // llms.txt is a site-level fetch, same shape as sitemap.xml above -
  // fetched once here regardless of whether the homepage itself was
  // visited (unlike sitemapCheck, there is no per-page attribution
  // question blocking it: this is a single unconditional GET at the
  // site's origin, not something that needs a page to attach staleness
  // comparisons to), and attached to the homepage's scan.json below only
  // when the homepage was actually visited, the same attribution pattern
  // every other site-level check here uses.
  const siteOrigin = new URL(crawl.startUrl).origin;
  // Plan 059 step 17: site-level checks are first-class ledger entries with
  // their own attempts and recovery ladder, recorded against the origin. Off
  // (single request, no records) unless this is a scoped full audit.
  const siteAcquisition = {
    origin: siteOrigin,
    surfaceId: SITE_REQUEST_SURFACE_ID,
    scopeDigest: options.scopeDigest ?? '',
    evidenceEpoch: 1,
    retry: options.fullAuditPlanning === true && options.scopeDigest !== undefined,
  };
  const siteAttempts: AcquisitionAttemptRecord[] = [];
  const pageTimeoutMs = options.timeoutMs ?? getPageTimeoutMs();
  const boundFor = (profile: AttemptExecutionProfile): number =>
    profile === 'diagnostic-retry' ? pageTimeoutMs * 2 : pageTimeoutMs;
  const recordSite = async <T>(
    checkId: string,
    run: (profile: AttemptExecutionProfile) => Promise<SiteCheckRun<T>>,
  ): Promise<T> => {
    try {
      const { value, records } = await acquireSiteCheck(checkId, siteAcquisition, run);
      siteAttempts.push(...records);
      return value;
    } catch (error) {
      siteAttempts.push(
        ...((error as { acquisitionAttempts?: AcquisitionAttemptRecord[] }).acquisitionAttempts ??
          []),
      );
      throw error;
    }
  };
  const fetchFailure = (fetchError: string | undefined): string | undefined => {
    // A 404 is the absence finding. Authentication barriers, rate limits,
    // challenges and server errors are acquisition failures, never site facts.
    if (fetchError === undefined) return undefined;
    const status = /^HTTP (\d{3})$/u.exec(fetchError)?.[1];
    if (status === undefined) return fetchError;
    return [401, 403, 429].includes(Number(status)) || status.startsWith('5')
      ? fetchError
      : undefined;
  };

  // llms.txt is a site-level fetch, same shape as sitemap.xml above -
  // fetched once here regardless of whether the homepage itself was
  // visited (unlike sitemapCheck, there is no per-page attribution
  // question blocking it: this is a single unconditional GET at the
  // site's origin, not something that needs a page to attach staleness
  // comparisons to), and attached to the homepage's scan.json below only
  // when the homepage was actually visited, the same attribution pattern
  // every other site-level check here uses.
  await assertSafeDirectTarget(new URL('/llms.txt', siteOrigin).href);
  const llmsTxtCheck = await recordSite('llms-txt-check', async (profile) => {
    const value = await scheduler.schedule(() =>
      checkLlmsTxt(siteOrigin, boundFor(profile), options.userAgent ?? getCrawlerUserAgent(), {
        ...(options.networkPolicy !== undefined ? { networkPolicy: options.networkPolicy } : {}),
        ...(onNetworkSafetyBlocked !== undefined ? { onNetworkSafetyBlocked } : {}),
      }),
    );
    const failure = fetchFailure(value.fetchError);
    return { value, material: value, ...(failure !== undefined ? { failure } : {}) };
  });
  const llmsTxtCheckForScan = homepageWasVisited ? llmsTxtCheck : undefined;

  // Security response headers are a site-level fetch, same shape as
  // llms.txt/sitemap above: near-always identical across every page on a
  // site, so one request here (attached only to the homepage's scan.json
  // when it was visited) rather than repeating the same answer per page.
  await assertSafeDirectTarget(siteOrigin);
  const securityHeadersCheck = await recordSite('security-headers', async (profile) => {
    const value = await scheduler.schedule(() =>
      checkSecurityHeaders(
        siteOrigin,
        boundFor(profile),
        options.userAgent ?? getCrawlerUserAgent(),
        {
          ...(options.networkPolicy !== undefined ? { networkPolicy: options.networkPolicy } : {}),
          ...(onNetworkSafetyBlocked !== undefined ? { onNetworkSafetyBlocked } : {}),
        },
      ),
    );
    return {
      value,
      material: value,
      ...(value.fetched ? {} : { failure: value.fetchError ?? 'security headers not fetched' }),
    };
  });
  const securityHeadersCheckForScan = homepageWasVisited ? securityHeadersCheck : undefined;

  // C1: cookies and trackers active before consent. One extra navigation
  // per audit, in a brand-new context so nothing from the crawl's own
  // passes can be mistaken for the visitor having consented - which is
  // why this cannot reuse a page the lanes already loaded. Same
  // site-level, attributed-to-the-homepage shape as the checks above,
  // and skipped entirely when the homepage was never visited, since
  // there would be no page to attribute the finding to.
  const cookieConsentCheck = homepageWasVisited
    ? await recordSite('cookie-consent', async (profile) => {
        const value = await scheduler.schedule(() =>
          checkCookieConsent(options.browser, homepageUrlForScan!, {
            timeoutMs: boundFor(profile),
            guard: runGuard,
            ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
            ...(options.networkPolicy !== undefined
              ? { networkPolicy: options.networkPolicy }
              : {}),
            ...(onNetworkSafetyBlocked !== undefined ? { onNetworkSafetyBlocked } : {}),
          }),
        );
        return {
          value,
          material: value,
          ...(value.checkError !== undefined ? { failure: value.checkError } : {}),
        };
      })
    : undefined;

  // C4: URL-pattern only, over the pages this crawl actually reached, so
  // it costs no request at all. Skipped when the homepage was not
  // visited, for the same reason as the checks above.
  const accessibilityStatementCheck = homepageWasVisited
    ? await recordSite('accessibility-statement', async () => {
        const value = checkAccessibilityStatement(pagesToScan.map((page) => page.url));
        return { value, material: value };
      })
    : undefined;

  // Sitemap state comes from the crawl, which already fetched and parsed it
  // under the same policy; recorded here so the site ledger names it.
  if (sitemapCheck !== undefined) {
    await recordSite('sitemap-check', async () => ({
      value: sitemapCheck,
      material: crawl.sitemap,
    }));
  }

  // CrUX is origin-level, not per-page, and only ever queried once per
  // audit regardless of page count - skipped entirely (not attempted and
  // failed) when no API key is configured, so a site without one never
  // pays a doomed auth-error round trip. Plan 059 step 19: "no public data"
  // is an answer and a provider failure is a gap; the two are recorded
  // differently and only the second retries.
  const cruxApiKey = getCruxApiKey();
  let cruxFieldData: CruxFieldDataResult | undefined;
  let cruxAcquisitionStatus: CruxAcquisitionStatus | undefined;
  if (cruxApiKey) {
    const acquisition = await recordSite(CRUX_FIELD_DATA_CHECK_ID, async () => {
      const value = await fetchCruxFieldDataAcquisition(siteOrigin, cruxApiKey);
      return {
        value,
        material: { status: value.status, fieldData: value.fieldData },
        ...(value.status === 'provider-error'
          ? { failure: `dependency: ${value.providerError ?? 'CrUX provider error'}` }
          : {}),
      };
    });
    cruxAcquisitionStatus = acquisition.status;
    if (acquisition.status === 'provider-error') {
      // Scoped full audits keep going and let the evidence assessment block
      // on the recorded gap; every other caller keeps the historical stop.
      if (!siteAcquisition.retry) {
        throw new Error(
          `CrUX acquisition failed: ${acquisition.providerError ?? 'unknown provider error'}`,
        );
      }
    } else {
      cruxFieldData = acquisition.fieldData;
    }
  }
  if (siteAcquisition.retry && options.auditDir !== undefined) {
    holdLease(options);
    appendSiteAcquisitionAttempts(options.auditDir, siteAttempts);
  }

  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? getScanConcurrency(), pagesToScan.length || 1),
  );

  // One cache for the whole site, shared across every lane, so a
  // booking-engine link repeated on every page (a real hotel site's nav)
  // costs one third-party navigation per audit, not one per page. See
  // transactional-flow.ts's RedirectHostCache doc comment.
  const redirectHostCache: RedirectHostCache = new Map();
  const canonicalTargetCache: Map<string, Promise<CanonicalTargetCheckResult | null>> = new Map();

  if (options.fullAuditPlanning) {
    const context: StagedScanContext = {
      screenshotDir: options.screenshotDir,
      auditDir: options.auditDir,
      writePagesAsScanned: options.writePagesAsScanned,
      resumeActive: resumedFromCheckpoint,
      timeoutMs: options.timeoutMs,
      userAgent: options.userAgent,
      servedUrlByIdentity,
      mentionsLegalesUrl: mentionsLegalesUrlForScan,
      mentionsLegalesCandidateUrls:
        crawl.mentionsLegalesCandidateUrls ??
        (crawl.mentionsLegalesPageUrl !== undefined ? [crawl.mentionsLegalesPageUrl] : undefined),
      mentionsLegalesSearchedUrls:
        crawl.mentionsLegalesCandidateUrls ?? crawl.mentionsLegalesSearchedUrls,
      mentionsLegalesHomepageFallback,
      redirectHostCache,
      canonicalTargetCache,
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
      scopeDigest: options.scopeDigest,
      evidenceEpoch: 1,
      launchRecoveryBrowser: options.launchRecoveryBrowser,
      holdLease: () => holdLease(options),
      // Plan 059 step 10/11: state surfaces run on the Plan 059 scoped
      // full-audit path only; the legacy/CLI path keeps its exact shape.
      mobileSurfaces: options.scopeDigest !== undefined,
      hydrationSweep: options.scopeDigest !== undefined,
      stateSurfaces: options.scopeDigest !== undefined,
      exclusionPatterns: options.exclusions ?? [],
      surfaceLinks: [],
      inventory: inventoryLedger ?? undefined,
      maxPages: crawl.maxPages,
      maxDepth: crawl.maxDepth,
      assertSafeUrl: assertSafeDirectTarget,
    };
    const {
      pages,
      fullAuditPlan,
      analysisCoverageByUrl,
      discoveryAdmittedUrls,
      discoveryAdmittedPages,
    } = await runStagedFullAuditScan(
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
    const finalInventory = finalizeInventoryLedger(discoveryAdmittedUrls);
    if (captureTemporalAnchors) {
      await closeTemporalWindow(
        crawl,
        options,
        scheduler,
        robotsPolicyRuntime,
        onNetworkSafetyBlocked,
      );
    }
    // A wave page is scanned like a crawled one, so it is listed like one:
    // the manifest is written from the crawl's page list, and a page left
    // off it would be scanned, stored, and then never analysed.
    const crawledUrls = new Set(crawl.pages.map((page) => page.url));
    const waveOnly = discoveryAdmittedPages.filter((page) => !crawledUrls.has(page.url));
    return {
      crawl: waveOnly.length === 0 ? crawl : { ...crawl, pages: [...crawl.pages, ...waveOnly] },
      pages,
      fullAuditPlan,
      analysisCoverageByUrl,
      ...(cruxFieldData !== undefined ? { cruxFieldData } : {}),
      ...(cruxAcquisitionStatus !== undefined ? { cruxAcquisitionStatus } : {}),
      ...(networkSafetyDispositions.length > 0 ? { networkSafetyDispositions } : {}),
      ...(finalInventory !== undefined ? { inventoryLedger: finalInventory } : {}),
      ...(pushbackEvents.length > 0 ? { pushbackEvents: [...pushbackEvents] } : {}),
      ...(pacingRecoveryEvents.length > 0
        ? { pacingRecoveryEvents: [...pacingRecoveryEvents] }
        : {}),
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
          servedUrlByIdentity,
          mentionsLegalesUrlForScan,
          crawl.mentionsLegalesCandidateUrls ??
            (crawl.mentionsLegalesPageUrl !== undefined
              ? [crawl.mentionsLegalesPageUrl]
              : undefined),
          crawl.mentionsLegalesCandidateUrls ?? crawl.mentionsLegalesSearchedUrls,
          mentionsLegalesHomepageFallback,
          redirectHostCache,
          canonicalTargetCache,
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
    ...(pushbackEvents.length > 0 ? { pushbackEvents: [...pushbackEvents] } : {}),
    ...(pacingRecoveryEvents.length > 0 ? { pacingRecoveryEvents: [...pacingRecoveryEvents] } : {}),
  };
}
