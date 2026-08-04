import type { Browser } from 'playwright';
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
 * Crawls a site, then scans every page the crawl actually visited (skipping
 * robots-disallowed and errored pages, since there is nothing rendered to
 * scan there). Reuses crawlSite's own stricter-of-config-and-robots delay
 * for pacing between pages, so the scanning phase's ~3x request volume per
 * page stays exactly as polite as the crawl phase.
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

  const pages: PageScanResult[] = [];
  let isFirstScan = true;

  for (const crawledPage of pagesToScan) {
    if (!isFirstScan) {
      await sleep(crawl.effectiveDelayMs);
    }
    isFirstScan = false;

    const pageResult = await scanPage(options.browser, options.debugPort, crawledPage.url, {
      delayMs: crawl.effectiveDelayMs,
      screenshotDir: options.screenshotDir,
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
    });
    pages.push(pageResult);
    options.onProgress?.({ type: 'scan-page', scanned: pages.length, totalPages: pagesToScan.length, url: crawledPage.url });
  }

  return { crawl, pages };
}
