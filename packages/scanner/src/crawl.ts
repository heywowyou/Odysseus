import type { Browser } from 'playwright';
import {
  getCrawlDelayMs,
  getCrawlerUserAgent,
  getMaxCrawlDepth,
  getMaxPages,
  getPageTimeoutMs,
} from './config.js';
import { isLanguageHomepagePath, normalizeInternalLinks } from './links.js';
import {
  AI_CRAWLER_USER_AGENTS,
  checkAiCrawlerAccess,
  fetchRobotsText,
  findBlockingPattern,
  isAllowedByRobots,
  parseRobotsTxt,
  type RobotsRules,
} from './robots.js';
import { findMentionsLegalesUrl } from './checks/mentions-legales.js';
import { isSocialPlatformHost } from './social-hosts.js';

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
  /** Manual-input-layer milestone: extra absolute URLs force-enqueued at
   *  depth 0 alongside startUrl, e.g. a page link discovery never
   *  reaches. Same-origin filtering still applies - an off-origin seed is
   *  silently dropped, matching normalizeInternalLinks' own origin rule,
   *  since this crawler only ever audits one origin. */
  seeds?: string[];
  /** Glob patterns; a matching discovered URL is never enqueued. Passed
   *  straight through to normalizeInternalLinks. */
  exclusions?: string[];
}

export type CrawledPageStatus =
  | 'visited'
  /** Fetched for link discovery only, never scanned. Keep in sync with
   *  packages/core's ManifestPageStatus, per the duplication note there. */
  | 'discovered-not-scanned'
  | 'skipped-robots'
  | 'skipped-non-html'
  | 'skipped-external-redirect'
  | 'error';

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
  /** Milestone 8.6: which named AI crawlers (robots.ts's
   *  AI_CRAWLER_USER_AGENTS) are blocked from the site root by the same
   *  already-fetched robots.txt text, so this costs no extra network
   *  call. Only blocked agents are included - an agent that is allowed
   *  has nothing for normalize-crawl.ts to report. */
  aiCrawlerBlocks: { agent: string; disallowPattern: string }[];
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

/** browserPage.url() is "about:blank" before any navigation commits and
 *  can in principle be any malformed value; never let a URL parse failure
 *  here throw out of the crawl loop. */
function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** True when `landedHostname` is safe to treat as the same site as
 *  `requestedHostname` for the purpose of following its links and
 *  scanning it as the requested page - either an exact match, or one is
 *  the other with a leading "www." label added or removed (the only
 *  redirect-driven cross-hostname pattern confirmed in the wild:
 *  www.lacoorniche.com 301s to lacoorniche.com). Deliberately narrow:
 *  a real haaitza.com crawl showed /carte-cadeaux forwarding (via a
 *  same-origin page whose content then points off-site) into
 *  haaitza-lacoorniche.diadabox.fr, a third-party booking platform
 *  shared with another client. Before this check existed, the crawler's
 *  own redirect-following fix (landedUrl below) treated that foreign
 *  domain as safe to crawl deeper into, since it only checked whether
 *  the navigation succeeded, not whether it stayed on the audited
 *  business's own site - 58 of that one audit's pages, and 16 of its 18
 *  "critical" findings, turned out to belong to the vendor's platform,
 *  not the client's. Anything other than an exact or www-prefix match
 *  must be treated the same as a social-platform redirect: not
 *  followed, not scanned, never attributed to the audited site. */
export function isSameSiteHostname(requestedHostname: string, landedHostname: string): boolean {
  if (requestedHostname === landedHostname) return true;
  return requestedHostname === `www.${landedHostname}` || landedHostname === `www.${requestedHostname}`;
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
  // Fetched once as raw text (not via fetchRobotsRules) so the same
  // response can also be parsed against each AI_CRAWLER_USER_AGENTS
  // token below, without a second request to robots.txt.
  const robotsText = await fetchRobotsText(start.origin, timeoutMs);
  const robotsRules: RobotsRules =
    robotsText === null ? { found: false, disallow: [], allow: [], sitemapUrls: [] } : parseRobotsTxt(robotsText, userAgent);
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

  // Manual-input-layer milestone: extra seed URLs are enqueued at depth 0,
  // same as the start URL, before the crawl loop begins. Off-origin seeds
  // are silently dropped (this crawler only ever audits one origin, same
  // rule normalizeInternalLinks already enforces for discovered links);
  // an unparsable seed is dropped the same way a malformed href is.
  for (const seed of options.seeds ?? []) {
    let resolvedSeed: URL;
    try {
      resolvedSeed = new URL(seed);
    } catch {
      continue;
    }
    if (resolvedSeed.origin !== start.origin) continue;
    resolvedSeed.hash = '';
    const normalizedSeed = resolvedSeed.toString();
    if (enqueued.has(normalizedSeed)) continue;
    enqueued.add(normalizedSeed);
    queue.push({ url: normalizedSeed, depth: 0 });
  }

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

        // A stub URL like /facebook or /instagram that server-side or
        // client-side redirects out to a social platform is not a page of
        // the audited site - it must never reach a detector (broken-link,
        // render-diff, axe, Lighthouse), which is exactly what happened
        // before this check existed: navigating a real browser context
        // into facebook.com under headless conditions is slow and often
        // errors out, and the resulting 'error' status then got reported
        // as a broken internal link even though the redirect itself
        // worked exactly as the site intended.
        const finalHost = safeHostname(browserPage.url());
        const requestedHost = new URL(item.url).hostname;
        const isOffSite = finalHost !== null && !isSameSiteHostname(requestedHost, finalHost);

        if (isOffSite || (finalHost !== null && isSocialPlatformHost(finalHost))) {
          const skippedPage: CrawledPage = { url: item.url, depth: item.depth, status: 'skipped-external-redirect' };
          if (httpStatus !== undefined) skippedPage.httpStatus = httpStatus;
          if (item.discoveredFrom !== undefined) skippedPage.discoveredFrom = item.discoveredFrom;
          pages.push(skippedPage);
        } else if (isNonHtmlContentType(contentType)) {
          const skippedPage: CrawledPage = { url: item.url, depth: item.depth, status: 'skipped-non-html' };
          if (httpStatus !== undefined) skippedPage.httpStatus = httpStatus;
          if (item.discoveredFrom !== undefined) skippedPage.discoveredFrom = item.discoveredFrom;
          pages.push(skippedPage);
        } else {
          // A bare language homepage duplicates the homepage it translates,
          // yet is often the only route into that language's subtree
          // (lagnonu.fr, where /en and /es are the sole links in). So it is
          // always crawled for its links, and scanned only when the page
          // itself declares hreflang.
          //
          // That condition is exactly what trade-off 24's translation
          // clustering needs: a page declaring hreflang, including a self
          // reference, clusters with the variants it names, so its findings
          // collapse into the homepage's rather than multiplying them. With
          // no hreflang nothing can collapse them, and each language
          // homepage would restate every homepage defect once per language
          // (lacoorniche.com, five languages) - the defect this rule was
          // originally added for.
          //
          // Read off the DOM of the page already loaded here, not a second
          // fetch, and never inferred from URL shape: trade-off 24 rejected
          // prefix-guessing for clustering and the same reasoning binds here.
          let discoverOnly = isLanguageHomepagePath(new URL(browserPage.url()).pathname);
          if (discoverOnly) {
            const declaresHreflang = await browserPage
              .$$eval('link[rel="alternate"][hreflang]', (links) => links.length > 0)
              .catch(() => false);
            if (declaresHreflang) discoverOnly = false;
          }
          const visitedPage: CrawledPage = {
            url: item.url,
            depth: item.depth,
            status: discoverOnly ? 'discovered-not-scanned' : 'visited',
          };
          if (httpStatus !== undefined) visitedPage.httpStatus = httpStatus;
          if (item.discoveredFrom !== undefined) visitedPage.discoveredFrom = item.discoveredFrom;
          pages.push(visitedPage);

          if (item.depth < maxDepth) {
            const hrefs = await browserPage.$$eval('a[href]', (anchors) =>
              anchors.map((a) => a.getAttribute('href')),
            );
            // Resolved against browserPage.url() (where the navigation actually
            // landed), not item.url (what was requested). A same-origin request
            // can still land on a different origin after a server redirect - a
            // www-to-apex 301 is the common case - and every link on the landed
            // page is naturally absolute against that landed origin. Using
            // item.url as the base made those links look cross-origin and got
            // them all dropped, which silently reduced a real site's crawl to
            // just the one redirect-landing page (confirmed against
            // lacoorniche.com: www.lacoorniche.com 301s to lacoorniche.com,
            // visitedCount was 1 before this fix).
            const landedUrl = browserPage.url();
            for (const link of normalizeInternalLinks(hrefs, landedUrl, options.exclusions ?? [])) {
              if (enqueued.has(link) || enqueued.size >= maxPages) continue;
              enqueued.add(link);
              queue.push({ url: link, depth: item.depth + 1, discoveredFrom: item.url });
            }
          }
        }
      } catch (error) {
        // Playwright commits browserPage.url() to the in-progress
        // navigation target even when goto() itself rejects (e.g. a
        // timeout waiting for facebook.com to fire 'load' under headless
        // conditions) - the redirect already happened at the network
        // level before the failure, so this is still a social redirect,
        // not a broken link on the audited site.
        const finalHost = safeHostname(browserPage.url());
        const requestedHost = new URL(item.url).hostname;
        const isOffSite = finalHost !== null && !isSameSiteHostname(requestedHost, finalHost);
        if (isOffSite || (finalHost !== null && isSocialPlatformHost(finalHost))) {
          const skippedPage: CrawledPage = { url: item.url, depth: item.depth, status: 'skipped-external-redirect' };
          if (item.discoveredFrom !== undefined) skippedPage.discoveredFrom = item.discoveredFrom;
          pages.push(skippedPage);
        } else {
          const message = error instanceof Error ? error.message : String(error);
          const errorPage: CrawledPage = { url: item.url, depth: item.depth, status: 'error', error: message };
          if (item.discoveredFrom !== undefined) errorPage.discoveredFrom = item.discoveredFrom;
          pages.push(errorPage);
        }
      } finally {
        await browserPage.close();
      }
    }
  } finally {
    await context.close();
  }

  // A broken link (e.g. a malformed href) can still crawl to a 'visited'
  // page whose path matches the mentions-legales pattern but 404s - that
  // must never win over an actual 200 page just because it appears first.
  const resolvedUrls = pages
    .filter((page) => page.status === 'visited' && (page.httpStatus === undefined || (page.httpStatus >= 200 && page.httpStatus < 300)))
    .map((page) => page.url);
  const mentionsLegalesPageUrl = findMentionsLegalesUrl(resolvedUrls) ?? undefined;

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

  const aiCrawlerBlocks = checkAiCrawlerAccess(robotsText, AI_CRAWLER_USER_AGENTS)
    .filter((result): result is { agent: string; blocked: true; disallowPattern: string } => result.blocked)
    .map(({ agent, disallowPattern }) => ({ agent, disallowPattern }));

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
    aiCrawlerBlocks,
  };
}
