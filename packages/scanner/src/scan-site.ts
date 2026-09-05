import type { Browser } from 'playwright';
import type { CruxFieldDataResult, PageAnalysisCoverage, SitemapMode } from '@odysseus/core';
import { getCruxApiKey, getPageTimeoutMs, getScanConcurrency } from './config.js';
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
  type RenderedCostProfile,
} from './full-audit-plan.js';
import type { PageAuditProfile } from './page-audit-profile.js';
import { derivePageAnalysisCoverage } from './analysis-coverage.js';
import { readPageScanJson, writePageScanJson } from './artifacts/page-scan-io.js';

/** Extends crawl's own events with the scan phase's. scan-start fires
 *  once, after the crawl finishes (the total page count isn't known
 *  until then). scan-page fires once per completed scanPage call, not
 *  per axe/Lighthouse sub-step - the progress indicator this feeds is
 *  scoped to crawl vs. scan, not page-internal sub-phases. */
export type ScanProgressEvent =
  | CrawlProgressEvent
  | { type: 'scan-start'; totalPages: number }
  | { type: 'scan-page'; scanned: number; totalPages: number; url: string }
  | { type: 'content-scan-start'; totalPages: number }
  | { type: 'content-scan-page'; completed: number; totalPages: number; url: string }
  | { type: 'select-performance' }
  | { type: 'lighthouse-start'; totalPages: number }
  | { type: 'lighthouse-page'; completed: number; totalPages: number; url: string }
  | { type: 'analysis-complete' };

export interface ScanSiteOptions {
  browser: Browser;
  debugPort: number;
  maxPages?: number;
  maxDepth?: number;
  delayMs?: number;
  timeoutMs?: number;
  userAgent?: string;
  /** Number of pages scanned at once. Each lane keeps the exact same
   *  delayMs pacing a single sequential run always had; this only adds
   *  lanes, it does not shorten the delay between requests. Defaults to
   *  getScanConcurrency() (SCAN_CONCURRENCY env var, default 3). */
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
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
export const RENDERED_ANALYSIS_WATCHDOG_MS = 420_000;
export const FULL_SCAN_PAGE_WATCHDOG_MS = 600_000;

/**
 * Resolves with `work`'s result, or, if `work` is still pending after
 * `watchdogMs`, with a synthesized failed result so the lane can move on
 * and the manifest can record the page as failed coverage. The result's
 * empty checkOutcomes is what makes the persisted pass record honest:
 * derivePageAnalysisCoverage derives failed for every content pass with
 * no completed checks, and the error string carries the reason.
 */
export async function withPageWatchdog<T extends RenderedAnalysisResult | PageScanResult>(
  url: string,
  work: Promise<T>,
  watchdogMs: number,
): Promise<T | RenderedAnalysisResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<RenderedAnalysisResult>((resolve) => {
    timer = setTimeout(() => {
      resolve({
        url,
        renderDiffError: `watchdog: page analysis did not complete within ${watchdogMs}ms; abandoned so the audit could continue`,
        checkOutcomes: {},
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
 * Runs one lane of the scan phase: a sequential slice of pagesToScan,
 * pacing itself with the exact same delayMs sleep-between-pages a single
 * sequential scan always used. `startDelayMs` staggers this lane's very
 * first request (laneIndex * delayMs) so N lanes don't all fire their
 * opening request in the same instant; every request after that is spaced
 * by the ordinary delayMs within the lane. Multiple lanes running
 * concurrently is what raises throughput; no lane's own request cadence
 * changes.
 */
async function runScanLane(
  laneUrls: string[],
  browser: Browser,
  debugPort: number,
  delayMs: number,
  startDelayMs: number,
  screenshotDir: string,
  timeoutMs: number | undefined,
  userAgent: string | undefined,
  mentionsLegalesUrl: string | undefined,
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
  onPageDone: (pageResult: PageScanResult) => void,
): Promise<void> {
  let nextDelayMs = startDelayMs;

  for (const url of laneUrls) {
    if (nextDelayMs > 0) {
      await sleep(nextDelayMs);
    }
    nextDelayMs = delayMs;

    const pageResult = await withPageWatchdog(
      url,
      scanPage(browser, debugPort, url, {
        delayMs,
        screenshotDir,
        redirectHostCache,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        ...(userAgent !== undefined ? { userAgent } : {}),
        ...(mentionsLegalesUrl !== undefined ? { mentionsLegalesUrl } : {}),
        ...(homepageUrl !== undefined ? { homepageUrl } : {}),
        ...(sitemapCheck !== undefined ? { sitemapCheck } : {}),
        ...(llmsTxtCheck !== undefined ? { llmsTxtCheck } : {}),
        ...(securityHeadersCheck !== undefined ? { securityHeadersCheck } : {}),
        ...(cookieConsentCheck !== undefined ? { cookieConsentCheck } : {}),
        ...(accessibilityStatementCheck !== undefined ? { accessibilityStatementCheck } : {}),
        ...(bookingEngineUrl !== undefined ? { bookingEngineUrl } : {}),
        ...(skipLighthouse ? { skipLighthouse } : {}),
      }),
      FULL_SCAN_PAGE_WATCHDOG_MS,
    );
    onPageDone(pageResult as PageScanResult);
  }
}

/** Every field `runRenderedAnalysisLane` needs to forward into each page's
 *  `runRenderedAnalysis` call, bundled once per `scanSite` run rather than
 *  threaded as a long positional parameter list a second time. */
interface StagedScanContext {
  screenshotDir: string;
  auditDir: string | undefined;
  writePagesAsScanned: boolean | undefined;
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
}

/**
 * Rendered-analysis equivalent of `runScanLane`: same sequential,
 * staggered-start, delay-paced lane shape, but calling
 * `runRenderedAnalysis` (no Lighthouse) instead of the all-in-one
 * `scanPage`, since the full-audit planner's Lighthouse selection cannot
 * be decided until every lane's rendered-cost facts exist.
 */
async function runRenderedAnalysisLane(
  laneUrls: string[],
  browser: Browser,
  delayMs: number,
  startDelayMs: number,
  context: StagedScanContext,
  onPageDone: (url: string, result: RenderedAnalysisResult) => void,
): Promise<void> {
  let nextDelayMs = startDelayMs;

  for (const url of laneUrls) {
    if (nextDelayMs > 0) {
      await sleep(nextDelayMs);
    }
    nextDelayMs = delayMs;

    const result = await withPageWatchdog(
      url,
      runRenderedAnalysis(browser, url, {
        delayMs,
        screenshotDir: context.screenshotDir,
        redirectHostCache: context.redirectHostCache,
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
      }),
      RENDERED_ANALYSIS_WATCHDOG_MS,
    );
    onPageDone(url, result as RenderedAnalysisResult);
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

  const renderedResults = new Map<string, RenderedAnalysisResult>();
  const renderedCosts = new Map<string, RenderedCostProfile>();
  let contentCompleted = 0;
  onProgress?.({ type: 'content-scan-start', totalPages: pagesToScan.length });

  const lanes: string[][] = Array.from({ length: concurrency }, () => []);
  pagesToScan.forEach((page, index) => {
    lanes[index % concurrency]!.push(page.url);
  });

  await Promise.all(
    lanes
      .filter((laneUrls) => laneUrls.length > 0)
      .map((laneUrls, laneIndex) =>
        runRenderedAnalysisLane(
          laneUrls,
          browser,
          delayMs,
          laneIndex * delayMs,
          context,
          (url, result) => {
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
              // selection is known.
              if (context.auditDir === undefined) {
                throw new Error('scanSite: writePagesAsScanned requires auditDir to be set.');
              }
              writePageScanJson(context.screenshotDir, context.auditDir, content as PageScanResult);
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
  onProgress?.({ type: 'lighthouse-start', totalPages: selectedUrls.size });

  const pages: PageScanResult[] = [];
  const analysisCoverageByUrl = new Map<string, PageAnalysisCoverage>();
  const decisionByUrl = new Map(
    finalizedPlan.decisions.map((decision) => [decision.url, decision]),
  );
  let scanned = 0;
  const emit = (url: string, lighthouseResult: LighthouseAnalysisResult | undefined): void => {
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
    onProgress?.({ type: 'scan-page', scanned, totalPages: pagesToScan.length, url });
  };

  // Pages not selected for Lighthouse are already fully done once the
  // rendered stage finishes; emitting for them first (rather than
  // interleaving) keeps this stage a clean two-phase run. Step 8 revisits
  // progress ordering for the staged pipeline; this is a correct, if not
  // yet interleaved, signal.
  for (const url of renderedResults.keys()) {
    if (!selectedUrls.has(url)) emit(url, undefined);
  }

  // Lighthouse calls are already serialized process-wide (see
  // runLighthouseSerialized's own doc comment in scan-page.ts), so running
  // them through a second lane structure would add complexity without
  // adding real parallelism - a plain sequential loop gets the same
  // throughput while keeping the pre-call politeness delay simple.
  let lighthouseCompleted = 0;
  for (const url of selectedUrls) {
    const lighthouseResult = await runLighthouseAnalysis(url, debugPort, { delayMs });
    emit(url, lighthouseResult);
    lighthouseCompleted += 1;
    onProgress?.({
      type: 'lighthouse-page',
      completed: lighthouseCompleted,
      totalPages: selectedUrls.size,
      url,
    });
  }

  onProgress?.({ type: 'analysis-complete' });

  return { pages, fullAuditPlan: finalizedPlan, analysisCoverageByUrl };
}

/**
 * Crawls a site, then scans every page the crawl actually visited (skipping
 * robots-disallowed and errored pages, since there is nothing rendered to
 * scan there). Reuses crawlSite's own stricter-of-config-and-robots delay
 * for pacing between pages, so the scanning phase's ~3x request volume per
 * page stays exactly as polite as the crawl phase - concurrency only adds
 * parallel lanes, it never shortens that delay.
 *
 * The crawl phase itself stays fully sequential (unaffected by
 * concurrency): it is the phase CLAUDE.md's politeness rule names most
 * directly, and it is not the bottleneck. Only the scan phase (render-diff
 * + axe + Lighthouse per page) is split into `concurrency` lanes, each a
 * contiguous round-robin slice of pagesToScan so lane sizes stay balanced.
 * The resulting `pages` array is in completion order, not crawl order;
 * every downstream consumer matches pages by `.url`, never by position
 * (writeAuditArtifacts builds its own url-keyed map), so this is safe.
 */
export async function scanSite(
  startUrl: string,
  options: ScanSiteOptions,
): Promise<SiteScanResult> {
  if (options.writePagesAsScanned && options.auditDir === undefined) {
    throw new Error('scanSite: writePagesAsScanned requires auditDir to be set.');
  }
  const sitemapMode = options.sitemapMode ?? 'supplement';
  const crawl = await crawlSite(startUrl, {
    browser: options.browser,
    ...(options.maxPages !== undefined ? { maxPages: options.maxPages } : {}),
    ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
    ...(options.delayMs !== undefined ? { delayMs: options.delayMs } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
    ...(options.onProgress !== undefined ? { onProgress: options.onProgress } : {}),
    ...(options.seeds !== undefined ? { seeds: options.seeds } : {}),
    ...(options.exclusions !== undefined ? { exclusions: options.exclusions } : {}),
    sitemapMode,
  });

  const pagesToScan = crawl.pages.filter((page) => page.status === 'visited');

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
  const llmsTxtCheck = await checkLlmsTxt(
    new URL(crawl.startUrl).origin,
    options.timeoutMs ?? getPageTimeoutMs(),
  );
  const llmsTxtCheckForScan = homepageWasVisited ? llmsTxtCheck : undefined;

  // Security response headers are a site-level fetch, same shape as
  // llms.txt/sitemap above: near-always identical across every page on a
  // site, so one request here (attached only to the homepage's scan.json
  // when it was visited) rather than repeating the same answer per page.
  const securityHeadersCheck = await checkSecurityHeaders(
    new URL(crawl.startUrl).origin,
    options.timeoutMs ?? getPageTimeoutMs(),
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
    ? await checkCookieConsent(options.browser, crawl.startUrl, {
        timeoutMs: options.timeoutMs ?? getPageTimeoutMs(),
        ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
      })
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
    };
    const { pages, fullAuditPlan, analysisCoverageByUrl } = await runStagedFullAuditScan(
      pagesToScan,
      options.browser,
      options.debugPort,
      crawl.effectiveDelayMs,
      concurrency,
      options.skipLighthouse ?? false,
      context,
      options.onProgress,
    );
    return {
      crawl,
      pages,
      fullAuditPlan,
      analysisCoverageByUrl,
      ...(cruxFieldData !== undefined ? { cruxFieldData } : {}),
    };
  }

  options.onProgress?.({ type: 'scan-start', totalPages: pagesToScan.length });

  const lanes: string[][] = Array.from({ length: concurrency }, () => []);
  pagesToScan.forEach((page, index) => {
    lanes[index % concurrency]!.push(page.url);
  });

  const pages: PageScanResult[] = [];
  let scannedCount = 0;
  const onPageDone = (pageResult: PageScanResult): void => {
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
    });
  };

  await Promise.all(
    lanes
      .filter((laneUrls) => laneUrls.length > 0)
      .map((laneUrls, laneIndex) =>
        runScanLane(
          laneUrls,
          options.browser,
          options.debugPort,
          crawl.effectiveDelayMs,
          laneIndex * crawl.effectiveDelayMs,
          options.screenshotDir,
          options.timeoutMs,
          options.userAgent,
          mentionsLegalesUrlForScan,
          redirectHostCache,
          homepageUrlForScan,
          sitemapCheck,
          llmsTxtCheckForScan,
          securityHeadersCheckForScan,
          cookieConsentCheck,
          accessibilityStatementCheck,
          options.bookingEngineUrl,
          options.skipLighthouse ?? false,
          onPageDone,
        ),
      ),
  );

  return { crawl, pages, ...(cruxFieldData !== undefined ? { cruxFieldData } : {}) };
}
