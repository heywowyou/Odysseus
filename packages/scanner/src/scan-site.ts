import type { Browser } from 'playwright';
import { getScanConcurrency } from './config.js';
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
}

export interface SiteScanResult {
  crawl: CrawlResult;
  pages: PageScanResult[];
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
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(userAgent !== undefined ? { userAgent } : {}),
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
  });

  const pagesToScan = crawl.pages.filter((page) => page.status === 'visited');
  options.onProgress?.({ type: 'scan-start', totalPages: pagesToScan.length });

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
          onPageDone,
        ),
      ),
  );

  return { crawl, pages };
}
