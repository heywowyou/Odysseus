import type { Browser } from 'playwright';
import { type CrawlResult, crawlSite } from './crawl.js';
import { type PageScanResult, scanPage } from './scan-page.js';

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
  screenshotDir?: string;
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
  });

  const pages: PageScanResult[] = [];
  let isFirstScan = true;

  for (const crawledPage of crawl.pages) {
    if (crawledPage.status !== 'visited') continue;

    if (!isFirstScan) {
      await sleep(crawl.effectiveDelayMs);
    }
    isFirstScan = false;

    const pageResult = await scanPage(options.browser, options.debugPort, crawledPage.url, {
      delayMs: crawl.effectiveDelayMs,
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
      ...(options.screenshotDir !== undefined ? { screenshotDir: options.screenshotDir } : {}),
    });
    pages.push(pageResult);
  }

  return { crawl, pages };
}
