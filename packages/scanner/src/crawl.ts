import type { Browser } from 'playwright';
import {
  getCrawlDelayMs,
  getCrawlerUserAgent,
  getMaxCrawlDepth,
  getMaxPages,
  getPageTimeoutMs,
} from './config.js';
import { normalizeInternalLinks } from './links.js';
import { fetchRobotsRules, findBlockingPattern, isAllowedByRobots } from './robots.js';
import { findMentionsLegalesUrl } from './checks/mentions-legales.js';

/** Progress events for a live ETA display. Purely additive: emitted only
 *  when a caller supplies onProgress, no behavior change otherwise.
 *  crawl-start fires once, right after effectiveDelayMs is known, so an
 *  ETA can be shown before the first page is even fetched. crawl-page
 *  fires once per page dequeued (visited, skipped, or errored alike),
 *  since all three consume one iteration of the politeness delay. */
export type CrawlProgressEvent =
  | { type: 'crawl-start'; maxPages: number; effectiveDelayMs: number; robotsTxtFound: boolean }
  | { type: 'crawl-page'; visited: number; maxPages: number; queued: number };

export interface CrawlOptions {
  browser: Browser;
  maxPages?: number;
  maxDepth?: number;
  delayMs?: number;
  timeoutMs?: number;
  userAgent?: string;
  onProgress?: (event: CrawlProgressEvent) => void;
}

export type CrawledPageStatus = 'visited' | 'skipped-robots' | 'skipped-non-html' | 'error';

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
  /** The one visited page URL matching the mentions-legales heuristic, if
   *  any. Resolved from URLs already collected during the crawl, no extra
   *  navigation. scanSite forwards this into scanPage so only that one
   *  page runs the SIREN/RCS/TVA text extraction. */
  mentionsLegalesPageUrl?: string;
  /** Sitemap: directive values from the already-fetched robots.txt (see
   *  RobotsRules.sitemapUrls), passed through so checks/sitemap.ts never
   *  fetches robots.txt a second time. */
  robotsSitemapUrls: string[];
  /** Milestone 8.5a: for every Disallow pattern that was actually the
   *  winning (blocking) rule for at least one URL this crawl discovered
   *  (visited or not - a page skipped-robots was still found via a real
   *  link), how many URLs it blocked. Computed here, not left for core to
   *  re-derive, because judging "which pattern blocked this page" needs
   *  robots.ts's own longest-match-wins logic (findBlockingPattern) -
   *  core does not and must not depend on scanner. The moderate/severe
   *  judgment of what counts as "broad enough to flag" is still core's
   *  call (see normalize-crawl.ts), same detect/decide split as every
   *  other custom check. */
  robotsDisallowMatches: { pattern: string; matchedPageCount: number }[];
}

interface QueueItem {
  url: string;
  depth: number;
  discoveredFrom?: string;
}

/**
 * Fallback for URLs whose extension doesn't reveal what they are;
 * links.ts's extension check already caught the common case (e.g.
 * wp-content/uploads/*.jpg) before a navigation ever happens. A missing
 * Content-Type is treated as HTML rather than skipped, since there's
 * nothing here to justify dropping the page.
 */
export function isNonHtmlContentType(contentType: string | undefined): boolean {
  return contentType !== undefined && !contentType.toLowerCase().includes('text/html');
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

  options.onProgress?.({
    type: 'crawl-start',
    maxPages,
    effectiveDelayMs,
    robotsTxtFound: robotsRules.found,
  });

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
      options.onProgress?.({ type: 'crawl-page', visited: visited.size, maxPages, queued: queue.length });

      const browserPage = await context.newPage();
      try {
        const response = await browserPage.goto(item.url, { waitUntil: 'load' });
        const httpStatus = response?.status();
        const contentType = response?.headers()['content-type'];

        if (isNonHtmlContentType(contentType)) {
          const skippedPage: CrawledPage = { url: item.url, depth: item.depth, status: 'skipped-non-html' };
          if (httpStatus !== undefined) skippedPage.httpStatus = httpStatus;
          if (item.discoveredFrom !== undefined) skippedPage.discoveredFrom = item.discoveredFrom;
          pages.push(skippedPage);
        } else {
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

  const visitedUrls = pages.filter((page) => page.status === 'visited').map((page) => page.url);
  const mentionsLegalesPageUrl = findMentionsLegalesUrl(visitedUrls) ?? undefined;

  const disallowMatchCounts = new Map<string, number>();
  for (const page of pages) {
    const blockingPattern = findBlockingPattern(robotsRules, new URL(page.url).pathname);
    if (blockingPattern === undefined) continue;
    disallowMatchCounts.set(blockingPattern, (disallowMatchCounts.get(blockingPattern) ?? 0) + 1);
  }
  const robotsDisallowMatches = [...disallowMatchCounts.entries()].map(([pattern, matchedPageCount]) => ({
    pattern,
    matchedPageCount,
  }));

  return {
    startUrl: start.toString(),
    pages,
    visitedCount: visited.size,
    maxPages,
    maxDepth,
    robotsTxtFound: robotsRules.found,
    effectiveDelayMs,
    ...(mentionsLegalesPageUrl !== undefined ? { mentionsLegalesPageUrl } : {}),
    robotsSitemapUrls: robotsRules.sitemapUrls,
    robotsDisallowMatches,
  };
}
