import type { Browser } from 'playwright';
import {
  getCrawlDelayMs,
  getCrawlerUserAgent,
  getMaxCrawlDepth,
  getMaxPages,
  getPageTimeoutMs,
} from './config.js';
import { normalizeInternalLinks } from './links.js';
import { fetchRobotsRules, isAllowedByRobots } from './robots.js';

export interface CrawlOptions {
  browser: Browser;
  maxPages?: number;
  maxDepth?: number;
  delayMs?: number;
  timeoutMs?: number;
  userAgent?: string;
}

export type CrawledPageStatus = 'visited' | 'skipped-robots' | 'error';

export interface CrawledPage {
  url: string;
  depth: number;
  status: CrawledPageStatus;
  httpStatus?: number;
  error?: string;
  discoveredFrom?: string;
}

export interface CrawlResult {
  startUrl: string;
  pages: CrawledPage[];
  visitedCount: number;
  maxPages: number;
  maxDepth: number;
  robotsTxtFound: boolean;
  /** The stricter-of-config-and-robots delay actually used between
   *  requests, so later stages (the scanner passes) can reuse the exact
   *  same politeness pacing without re-fetching robots.txt. */
  effectiveDelayMs: number;
}

interface QueueItem {
  url: string;
  depth: number;
  discoveredFrom?: string;
}

/**
 * Breadth-first crawl from startUrl, following only same-origin links.
 * Reuses one BrowserContext for the whole crawl (a fresh Page per URL,
 * closed after each navigation) per the "reuse browser instances across
 * pages within a job" guidance. robots.txt is fetched once up front;
 * disallowed URLs are recorded but never navigated to. The politeness
 * delay is the larger of the configured delay and the site's own
 * Crawl-delay, since a site's stated preference should never be
 * overridden downward by local config.
 */
export async function crawlSite(startUrl: string, options: CrawlOptions): Promise<CrawlResult> {
  const maxPages = options.maxPages ?? getMaxPages();
  const maxDepth = options.maxDepth ?? getMaxCrawlDepth();
  const delayMs = options.delayMs ?? getCrawlDelayMs();
  const timeoutMs = options.timeoutMs ?? getPageTimeoutMs();
  const userAgent = options.userAgent ?? getCrawlerUserAgent();

  const start = new URL(startUrl);
  const robotsRules = await fetchRobotsRules(start.origin, userAgent, timeoutMs);
  const effectiveDelayMs = Math.max(delayMs, robotsRules.crawlDelayMs ?? 0);

  const pages: CrawledPage[] = [];
  const visited = new Set<string>();
  const enqueued = new Set<string>([start.toString()]);
  const queue: QueueItem[] = [{ url: start.toString(), depth: 0 }];

  const context = await options.browser.newContext({ userAgent });
  context.setDefaultTimeout(timeoutMs);
  context.setDefaultNavigationTimeout(timeoutMs);

  try {
    let isFirstNavigation = true;

    while (queue.length > 0 && visited.size < maxPages) {
      const item = queue.shift()!;

      if (!isAllowedByRobots(robotsRules, new URL(item.url).pathname)) {
        const skipped: CrawledPage = { url: item.url, depth: item.depth, status: 'skipped-robots' };
        if (item.discoveredFrom !== undefined) skipped.discoveredFrom = item.discoveredFrom;
        pages.push(skipped);
        continue;
      }

      if (!isFirstNavigation) {
        await new Promise((resolve) => setTimeout(resolve, effectiveDelayMs));
      }
      isFirstNavigation = false;
      visited.add(item.url);

      const browserPage = await context.newPage();
      try {
        const response = await browserPage.goto(item.url, { waitUntil: 'load' });
        const httpStatus = response?.status();

        const visitedPage: CrawledPage = { url: item.url, depth: item.depth, status: 'visited' };
        if (httpStatus !== undefined) visitedPage.httpStatus = httpStatus;
        if (item.discoveredFrom !== undefined) visitedPage.discoveredFrom = item.discoveredFrom;
        pages.push(visitedPage);

        if (item.depth < maxDepth) {
          const hrefs = await browserPage.$$eval('a[href]', (anchors) =>
            anchors.map((a) => a.getAttribute('href')),
          );
          for (const link of normalizeInternalLinks(hrefs, item.url)) {
            if (enqueued.has(link) || enqueued.size >= maxPages) continue;
            enqueued.add(link);
            queue.push({ url: link, depth: item.depth + 1, discoveredFrom: item.url });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorPage: CrawledPage = { url: item.url, depth: item.depth, status: 'error', error: message };
        if (item.discoveredFrom !== undefined) errorPage.discoveredFrom = item.discoveredFrom;
        pages.push(errorPage);
      } finally {
        await browserPage.close();
      }
    }
  } finally {
    await context.close();
  }

  return {
    startUrl: start.toString(),
    pages,
    visitedCount: visited.size,
    maxPages,
    maxDepth,
    robotsTxtFound: robotsRules.found,
    effectiveDelayMs,
  };
}
