import type { Browser } from 'playwright';
import type { CruxFieldDataResult } from '@odysseus/core';
import { getCruxApiKey, getPageTimeoutMs, getScanConcurrency } from './config.js';
import type { RedirectHostCache } from './checks/transactional-flow.js';
import { checkSitemap, type SitemapCheckResult } from './checks/sitemap.js';
import { checkLlmsTxt, type LlmsTxtCheckResult } from './checks/llms-txt.js';
import { checkSecurityHeaders, type SecurityHeadersCheckResult } from './checks/security-headers.js';
import { checkCookieConsent, type CookieConsentCheckResult } from './checks/cookie-consent.js';
import { fetchCruxFieldData } from './crux.js';
import { type CrawlProgressEvent, type CrawlResult, crawlSite } from './crawl.js';
import { type PageScanResult, scanPage } from './scan-page.js';

/** Extends crawl's own events with the scan phase's. scan-start fires
 *  once, after the crawl finishes (the total page count isn't known
 *  until then). scan-page fires once per completed scanPage call, not
 *  per axe/Lighthouse sub-step - the progress indicator this feeds is
 *  scoped to crawl vs. scan, not page-internal sub-phases. */
export type ScanProgressEvent =
  | CrawlProgressEvent
  | { type: 'scan-start'; totalPages: number }
  | { type: 'scan-page'; scanned: number; totalPages: number; url: string };

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
}

export interface SiteScanResult {
  crawl: CrawlResult;
  pages: PageScanResult[];
  /** Milestone 8.6: origin-level, fetched once here (not per page) - see
   *  CruxFieldDataResult's own doc comment for why. Absent (not merely
   *  `available: false`) when CRUX_API_KEY was never configured, so this
   *  fetch was never attempted at all. */
  cruxFieldData?: CruxFieldDataResult;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
  sitemapCheck: (SitemapCheckResult & { crawledUrls: string[]; discoveredUrls: string[] }) | undefined,
  llmsTxtCheck: LlmsTxtCheckResult | undefined,
  securityHeadersCheck: SecurityHeadersCheckResult | undefined,
  cookieConsentCheck: CookieConsentCheckResult | undefined,
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

    const pageResult = await scanPage(browser, debugPort, url, {
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
      ...(bookingEngineUrl !== undefined ? { bookingEngineUrl } : {}),
      ...(skipLighthouse ? { skipLighthouse } : {}),
    });
    onPageDone(pageResult);
  }
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
export async function scanSite(startUrl: string, options: ScanSiteOptions): Promise<SiteScanResult> {
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
  });

  const pagesToScan = crawl.pages.filter((page) => page.status === 'visited');
  options.onProgress?.({ type: 'scan-start', totalPages: pagesToScan.length });

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
    crawl.mentionsLegalesPageUrl ?? (pagesToScan.some((page) => page.url === crawl.startUrl) ? crawl.startUrl : undefined);

  // Sitemap.xml is a site-level concept, not a per-page one, so its
  // check runs once here rather than inside scanPage, and its result is
  // attributed only to the homepage's scan.json - the same "attribute a
  // site-level fact to the one page every site has" pattern
  // mentionsLegalesUrlForScan's own fallback already established above.
  // Skipped entirely (both fields left undefined) when the homepage
  // itself was never visited (e.g. disallowed by its own robots.txt),
  // since there is no page to attribute the finding to.
  const homepageWasVisited = pagesToScan.some((page) => page.url === crawl.startUrl);
  const sitemapCheck = homepageWasVisited
    ? {
        ...(await checkSitemap(
          new URL(crawl.startUrl).origin,
          crawl.robotsSitemapUrls,
          options.timeoutMs ?? getPageTimeoutMs(),
        )),
        crawledUrls: pagesToScan.map((page) => page.url),
        // Every URL the crawl discovered at all (visited, robots-skipped,
        // non-HTML-skipped, or errored), not only the visited subset
        // crawledUrls above tracks - milestone 8.5a's sitemap-orphan-page
        // check needs "was this sitemap URL linked from anywhere on the
        // site", which a skipped-but-discovered page still answers yes
        // to. crawledUrls stays as-is (visited only) since staleness is
        // rightly judged against pages that were actually scanned.
        discoveredUrls: crawl.pages.map((page) => page.url),
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
  const llmsTxtCheck = await checkLlmsTxt(new URL(crawl.startUrl).origin, options.timeoutMs ?? getPageTimeoutMs());
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

  // CrUX is origin-level, not per-page, and only ever queried once per
  // audit regardless of page count - skipped entirely (not attempted and
  // failed) when no API key is configured, so a site without one never
  // pays a doomed auth-error round trip.
  const cruxApiKey = getCruxApiKey();
  const cruxFieldData = cruxApiKey
    ? await fetchCruxFieldData(new URL(crawl.startUrl).origin, cruxApiKey)
    : undefined;

  const concurrency = Math.max(1, Math.min(options.concurrency ?? getScanConcurrency(), pagesToScan.length || 1));

  const lanes: string[][] = Array.from({ length: concurrency }, () => []);
  pagesToScan.forEach((page, index) => {
    lanes[index % concurrency]!.push(page.url);
  });

  const pages: PageScanResult[] = [];
  const onPageDone = (pageResult: PageScanResult): void => {
    pages.push(pageResult);
    options.onProgress?.({ type: 'scan-page', scanned: pages.length, totalPages: pagesToScan.length, url: pageResult.url });
  };

  // One cache for the whole site, shared across every lane, so a
  // booking-engine link repeated on every page (a real hotel site's nav)
  // costs one third-party navigation per audit, not one per page. See
  // transactional-flow.ts's RedirectHostCache doc comment.
  const redirectHostCache: RedirectHostCache = new Map();

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
          options.bookingEngineUrl,
          options.skipLighthouse ?? false,
          onPageDone,
        ),
      ),
  );

  return { crawl, pages, ...(cruxFieldData !== undefined ? { cruxFieldData } : {}) };
}
