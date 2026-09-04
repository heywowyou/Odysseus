import type { Browser } from 'playwright';
import type { PageDiscoveryMethod, SitemapCoverageSummary, SitemapMode } from '@odysseus/core';
import {
  getCrawlDelayMs,
  getCrawlerUserAgent,
  getMaxCrawlDepth,
  getMaxPages,
  getPageTimeoutMs,
} from './config.js';
import {
  isLanguageHomepagePath,
  isSameSiteHostname,
  normalizeInternalLinks,
  normalizePageUrl,
} from './links.js';
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
import { checkSitemap, type SitemapCheckResult } from './checks/sitemap.js';
import {
  buildPageAuditProfile,
  extractRawPageAuditFacts,
  type PageAuditProfile,
  type RawPageAuditFacts,
} from './page-audit-profile.js';
import {
  ContinuationGuard,
  classifyContinuationLink,
  computeRepeatedQueryKeys,
  type ContinuationGuardSummary,
} from './continuation-guard.js';
import { isConfirmedListing } from './full-audit-plan.js';

export { isSameSiteHostname } from './links.js';

/** Progress events for a live ETA display. Purely additive: emitted only
 *  when a caller supplies onProgress, no behavior change otherwise.
 *  crawl-start fires once, right after effectiveDelayMs is known, so an
 *  ETA can be shown before the first page is even fetched. crawl-page
 *  fires once per page dequeued (visited, skipped, or errored alike),
 *  since all three consume one iteration of the politeness delay. */
export type CrawlProgressEvent =
  | { type: 'crawl-start'; maxPages: number; effectiveDelayMs: number; robotsTxtFound: boolean }
  | { type: 'crawl-page'; visited: number; maxPages: number; queued: number }
  | { type: 'continuation-guard'; omittedUrlCount: number; omittedFamilyCount: number };

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
  /** `none` preserves the standalone link crawler, `inspect` resolves the
   *  sitemap without scheduling its pages, and `supplement` appends eligible
   *  sitemap-only pages after the link frontier. */
  sitemapMode?: SitemapMode;
}

export type CrawledPageStatus =
  | 'visited'
  /** Fetched for link discovery only, never scanned. Keep in sync with
   *  packages/core's ManifestPageStatus, per the duplication note there. */
  | 'discovered-not-scanned'
  | 'skipped-robots'
  | 'skipped-non-html'
  | 'skipped-external-redirect'
  /** Navigated, but the server answered a non-2xx final status (issue #39):
   *  the URL stays inventoried with its failure reason (httpStatus), but it
   *  is not a page of the site, so it is never scanned and never counts as
   *  one. Keep in sync with packages/core's ManifestPageStatus. */
  | 'http-error-status'
  | 'error';

export interface CrawledPage {
  url: string;
  depth: number;
  status: CrawledPageStatus;
  httpStatus?: number;
  error?: string;
  discoveredFrom?: string;
  discoveryMethod: PageDiscoveryMethod;
  /** Plan 021 Step 3: only present for `status === 'visited'`, extracted
   *  from this same post-`load` navigation, no extra page fetch. Absent
   *  for every other status, including `discovered-not-scanned`, since
   *  nothing downstream schedules checks against a page that is never
   *  scanned. */
  auditProfile?: PageAuditProfile;
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
  /** Every URL observed in an internal anchor, whether or not a configured
   *  page cap left enough budget to navigate it. Includes the start URL. */
  linkDiscoveredUrls: string[];
  /** Plan 021 Step 6: present only when the continuation-family guard
   *  actually omitted at least one link-discovered URL, so absent means
   *  nothing was bounded and every discovered URL was traversed. Seeds and
   *  eligible sitemap-declared URLs are never governed by the guard, so
   *  they can never appear here. Bounded by construction: at most 100
   *  families and 3 example URLs each, with aggregate counts kept exact
   *  beyond the caps. */
  continuationGuardSummary?: ContinuationGuardSummary;
  sitemap?: SitemapCheckResult;
  sitemapCoverage?: SitemapCoverageSummary;
}

interface QueueItem {
  url: string;
  depth: number;
  discoveredFrom?: string;
  discoveryMethod: PageDiscoveryMethod;
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
    robotsText === null
      ? { found: false, disallow: [], allow: [], sitemapUrls: [] }
      : parseRobotsTxt(robotsText, userAgent);
  const effectiveDelayMs = Math.max(delayMs, robotsRules.crawlDelayMs ?? 0);
  const sitemapMode = options.sitemapMode ?? 'none';
  const sitemap =
    sitemapMode === 'none'
      ? undefined
      : await checkSitemap(start.origin, robotsRules.sitemapUrls, timeoutMs, {
          userAgent,
          delayMs: effectiveDelayMs,
        });
  const eligibleSitemapUrls = new Set<string>();
  let filteredSitemapPageCount = 0;
  if (sitemap !== undefined) {
    for (const entry of sitemap.pageEntries) {
      const normalized = normalizePageUrl(entry.url, start.toString(), {
        allowWwwApex: true,
        exclusionPatterns: options.exclusions ?? [],
      });
      if (normalized === undefined) filteredSitemapPageCount += 1;
      else eligibleSitemapUrls.add(normalized);
    }
  }

  options.onProgress?.({
    type: 'crawl-start',
    maxPages,
    effectiveDelayMs,
    robotsTxtFound: robotsRules.found,
  });

  const pages: CrawledPage[] = [];
  const pagesByUrl = new Map<string, CrawledPage>();
  const visited = new Set<string>();
  const linkDiscoveredUrls = new Set<string>([start.toString()]);
  const linkDiscoveredFrom = new Map<string, string>();
  const enqueued = new Set<string>([start.toString()]);
  const queue: QueueItem[] = [{ url: start.toString(), depth: 0, discoveryMethod: 'link' }];
  // Plan 021 Step 6: one guard per crawlSite call, never shared across
  // crawls - a family key is only meaningful within the site it was
  // discovered on.
  const continuationGuard = new ContinuationGuard();

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
    queue.push({ url: normalizedSeed, depth: 0, discoveryMethod: 'seed' });
  }

  const context = await options.browser.newContext({ userAgent });
  context.setDefaultTimeout(timeoutMs);
  context.setDefaultNavigationTimeout(timeoutMs);

  const recordPage = (page: CrawledPage): void => {
    pages.push(page);
    pagesByUrl.set(page.url, page);
  };

  try {
    let isFirstNavigation = true;
    let supplementalPhaseStarted = false;

    while (true) {
      while (queue.length > 0 && visited.size < maxPages) {
        const item = queue.shift()!;
        const discoveryMethod = linkDiscoveredUrls.has(item.url) ? 'link' : item.discoveryMethod;
        const discoveredFrom = item.discoveredFrom ?? linkDiscoveredFrom.get(item.url);

        if (!isAllowedByRobots(robotsRules, new URL(item.url).pathname)) {
          recordPage({
            url: item.url,
            depth: item.depth,
            status: 'skipped-robots',
            discoveryMethod,
            ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
          });
          continue;
        }

        if (!isFirstNavigation) {
          await new Promise((resolve) => setTimeout(resolve, effectiveDelayMs));
        }
        isFirstNavigation = false;
        visited.add(item.url);
        options.onProgress?.({
          type: 'crawl-page',
          visited: visited.size,
          maxPages,
          queued: queue.length,
        });

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
            recordPage({
              url: item.url,
              depth: item.depth,
              status: 'skipped-external-redirect',
              discoveryMethod,
              ...(httpStatus !== undefined ? { httpStatus } : {}),
              ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
            });
          } else if (isNonHtmlContentType(contentType)) {
            recordPage({
              url: item.url,
              depth: item.depth,
              status: 'skipped-non-html',
              discoveryMethod,
              ...(httpStatus !== undefined ? { httpStatus } : {}),
              ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
            });
          } else if (httpStatus !== undefined && (httpStatus < 200 || httpStatus >= 300)) {
            // Issue #39: a non-2xx response means the URL has no page behind
            // it. It still cost a navigation (the politeness delay above was
            // already paid and the budget slot is spent), so it stays in the
            // inventory with its failure reason, but it must never be
            // scanned, never emit findings as if it were content, never have
            // its links followed, and never count as a page the client is
            // presented. The four /back-office/* 404s that reached the
            // Villas Foch report were exactly this failure.
            recordPage({
              url: item.url,
              depth: item.depth,
              status: 'http-error-status',
              discoveryMethod,
              ...(httpStatus !== undefined ? { httpStatus } : {}),
              ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
            });
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

            // Plan 021 Step 3: extracted from this same loaded page, no
            // extra navigation, and only for a page that will actually be
            // scanned. A DOM-evaluation failure here must never fail the
            // crawl (extractRawPageAuditFacts's own doc comment): falling
            // back to an all-empty fact set classifies as unknown/fallback,
            // which never reduces coverage, rather than leaving the page
            // with no profile at all.
            let auditProfile: PageAuditProfile | undefined;
            if (!discoverOnly) {
              const profileContext = {
                url: item.url,
                isHomepage: item.url === start.toString(),
                isOperatorSeed: item.discoveryMethod === 'seed',
              };
              try {
                const facts = await extractRawPageAuditFacts(browserPage);
                auditProfile = buildPageAuditProfile(facts, profileContext);
              } catch {
                const emptyFacts: RawPageAuditFacts = {
                  metaRobotsNoindex: false,
                  jsonLdTypes: [],
                  paginationRelNext: false,
                  paginationRelPrev: false,
                  numberedPaginationControlCount: 0,
                  bodyClassTokens: [],
                  transactionalFormSignalCount: 0,
                  repeatedTeaserLinkGroupSize: 0,
                  structuralTokens: [],
                };
                auditProfile = buildPageAuditProfile(emptyFacts, profileContext);
              }
            }

            recordPage({
              url: item.url,
              depth: item.depth,
              status: discoverOnly ? 'discovered-not-scanned' : 'visited',
              discoveryMethod,
              ...(httpStatus !== undefined ? { httpStatus } : {}),
              ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
              ...(auditProfile !== undefined ? { auditProfile } : {}),
            });

            if (discoveryMethod !== 'sitemap-only' && item.depth < maxDepth) {
              // Per-anchor structural evidence (plan 021 Step 6), read at
              // discovery time before URL normalization discards rel and
              // context: the anchor's own rel token and whether it sits in
              // a numbered pagination control. The pagination selector and
              // numeric-text filter here must stay byte-identical to
              // page-audit-profile.ts's page-level count, so the guard's
              // evidence and the profile's fact can never diverge.
              const anchors = await browserPage.$$eval('a[href]', (anchorEls) =>
                anchorEls.map((a) => ({
                  href: a.getAttribute('href'),
                  relNext: (a.getAttribute('rel') ?? '').split(/\s+/).includes('next'),
                  isNumberedPaginationControl:
                    a.matches('nav[class*="pag" i] a, [class*="pagination" i] a') &&
                    /^\d+$/.test((a.textContent ?? '').trim()),
                })),
              );
              const hrefs = anchors.map((anchor) => anchor.href);
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
              // Same normalization normalizeInternalLinks applies below, keyed per
              // canonical link so the guard can be consulted per candidate; two
              // anchors normalizing to one URL OR-merge, since either alone is
              // sufficient evidence.
              const anchorEvidenceByUrl = new Map<
                string,
                { relNext: boolean; isNumberedPaginationControl: boolean }
              >();
              for (const anchor of anchors) {
                if (anchor.href === null) continue;
                const normalized = normalizePageUrl(anchor.href, landedUrl, {
                  exclusionPatterns: options.exclusions ?? [],
                });
                if (normalized === undefined) continue;
                const existing = anchorEvidenceByUrl.get(normalized);
                anchorEvidenceByUrl.set(normalized, {
                  relNext: (existing?.relNext ?? false) || anchor.relNext,
                  isNumberedPaginationControl:
                    (existing?.isNumberedPaginationControl ?? false) ||
                    anchor.isNumberedPaginationControl,
                });
              }
              const links = normalizeInternalLinks(hrefs, landedUrl, options.exclusions ?? []);
              const repeatedQueryKeysOnSourcePage = computeRepeatedQueryKeys(links);
              for (const link of links) {
                linkDiscoveredUrls.add(link);
                if (!linkDiscoveredFrom.has(link)) linkDiscoveredFrom.set(link, item.url);
                const existingPage = pagesByUrl.get(link);
                if (existingPage !== undefined) {
                  existingPage.discoveryMethod = 'link';
                  existingPage.discoveredFrom ??= item.url;
                }
                // Only a continuation-classified link is governed: the guard
                // never sees an ordinary link, and returning false here omits
                // exactly this enqueue while keeping the discovery bookkeeping
                // above - the same posture as a frontier truncated by maxPages.
                const anchorEvidence = anchorEvidenceByUrl.get(link);
                if (anchorEvidence !== undefined) {
                  const classification = classifyContinuationLink({
                    targetUrl: link,
                    sourcePageUrl: item.url,
                    relNext: anchorEvidence.relNext,
                    isNumberedPaginationControl: anchorEvidence.isNumberedPaginationControl,
                    sourceIsConfirmedListing:
                      auditProfile !== undefined && isConfirmedListing(auditProfile),
                    repeatedQueryKeysOnSourcePage,
                  });
                  if (
                    classification.isContinuation &&
                    !continuationGuard.admit(classification, link)
                  ) {
                    continue;
                  }
                }
                if (enqueued.has(link)) continue;
                enqueued.add(link);
                queue.push({
                  url: link,
                  depth: item.depth + 1,
                  discoveredFrom: item.url,
                  discoveryMethod: 'link',
                });
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
            recordPage({
              url: item.url,
              depth: item.depth,
              status: 'skipped-external-redirect',
              discoveryMethod,
              ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
            });
          } else {
            const message = error instanceof Error ? error.message : String(error);
            recordPage({
              url: item.url,
              depth: item.depth,
              status: 'error',
              error: message,
              discoveryMethod,
              ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
            });
          }
        } finally {
          await browserPage.close();
        }
      }

      if (supplementalPhaseStarted || sitemapMode !== 'supplement') break;
      supplementalPhaseStarted = true;
      for (const url of eligibleSitemapUrls) {
        if (enqueued.has(url)) continue;
        enqueued.add(url);
        queue.push({
          url,
          depth: 0,
          discoveryMethod: linkDiscoveredUrls.has(url) ? 'link' : 'sitemap-only',
          ...(linkDiscoveredFrom.has(url) ? { discoveredFrom: linkDiscoveredFrom.get(url)! } : {}),
        });
      }
    }
  } finally {
    await context.close();
  }

  // A broken link (e.g. a malformed href) can still land on a URL whose
  // path matches the mentions-legales pattern but which answers a non-2xx
  // status - recorded 'http-error-status' since issue #39, so the status
  // test alone already excludes it; the 2xx condition stays as defense in
  // depth. Neither may win over an actual 200 page just because it appears
  // first.
  const resolvedUrls = pages
    .filter(
      (page) =>
        page.status === 'visited' &&
        (page.httpStatus === undefined || (page.httpStatus >= 200 && page.httpStatus < 300)),
    )
    .map((page) => page.url);
  const mentionsLegalesPageUrl = findMentionsLegalesUrl(resolvedUrls) ?? undefined;

  const disallowMatchCounts = new Map<string, number>();
  for (const page of pages) {
    if (page.discoveryMethod !== 'link') continue;
    const blockingPattern = findBlockingPattern(robotsRules, new URL(page.url).pathname);
    if (blockingPattern === undefined) continue;
    disallowMatchCounts.set(blockingPattern, (disallowMatchCounts.get(blockingPattern) ?? 0) + 1);
  }
  const robotsDisallowMatches = [...disallowMatchCounts.entries()].map(
    ([pattern, matchedPageCount]) => ({
      pattern,
      matchedPageCount,
    }),
  );

  const aiCrawlerBlocks = checkAiCrawlerAccess(robotsText, AI_CRAWLER_USER_AGENTS)
    .filter(
      (result): result is { agent: string; blocked: true; disallowPattern: string } =>
        result.blocked,
    )
    .map(({ agent, disallowPattern }) => ({ agent, disallowPattern }));

  const sitemapCoverage: SitemapCoverageSummary | undefined =
    sitemap === undefined
      ? undefined
      : {
          declaredPageCount: sitemap.pageEntries.length,
          eligiblePageCount: eligibleSitemapUrls.size,
          scannedPageCount: [...eligibleSitemapUrls].filter(
            (url) => pagesByUrl.get(url)?.status === 'visited',
          ).length,
          filteredPageCount: filteredSitemapPageCount,
          capOmittedPageCount:
            sitemapMode === 'supplement'
              ? [...eligibleSitemapUrls].filter((url) => !pagesByUrl.has(url)).length
              : 0,
          failedSitemapCount: sitemap.fetchErrors.length,
        };

  const continuationGuardSummary = continuationGuard.summary();
  if (continuationGuardSummary.totalOmittedUrlCount > 0) {
    options.onProgress?.({
      type: 'continuation-guard',
      omittedUrlCount: continuationGuardSummary.totalOmittedUrlCount,
      omittedFamilyCount:
        continuationGuardSummary.families.length +
        continuationGuardSummary.additionalFamiliesOmittedCount,
    });
  }

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
    linkDiscoveredUrls: [...linkDiscoveredUrls],
    ...(continuationGuardSummary.totalOmittedUrlCount > 0 ? { continuationGuardSummary } : {}),
    ...(sitemap !== undefined ? { sitemap } : {}),
    ...(sitemapCoverage !== undefined ? { sitemapCoverage } : {}),
  };
}
