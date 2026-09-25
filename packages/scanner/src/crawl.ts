import type { Browser, BrowserContext } from 'playwright';
import { AUDIT_BROWSER_LOCALE } from './audit-locale.js';
import type {
  AuditConfigSnapshot,
  HostStoppedAnswering,
  PageDiscoveryMethod,
  SitemapCoverageSummary,
  SitemapMode,
} from '@odysseus/core';
import {
  auditedHostAliases,
  classifyDocumentWall,
  classifyHostResponse,
  connectionRefusalCode,
  HOST_REFUSAL_STOP_THRESHOLD,
  isChallengeTitle,
} from '@odysseus/core';
import {
  getCrawlDelayMs,
  getCrawlerUserAgent,
  getMaxCrawlDepth,
  getMaxPages,
  getPageTimeoutMs,
} from './config.js';
import type { HostRequestScheduler } from './host-request-scheduler.js';
import {
  installBrowserNetworkSafety,
  type NetworkSafetyBlockHandler,
} from './browser-network-safety.js';
import { checkNetworkTarget, type NetworkTargetPolicy } from './network-target-policy.js';
import {
  globToRegExp,
  isLanguageHomepagePath,
  isSameSiteHostname,
  normalizeInternalLinks,
  normalizePageIdentityUrl,
  normalizePageUrl,
  relativeLinkNestingEvidence,
  classifyNonPublicPluginObject,
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
import { findMentionsLegalesUrl, findMentionsLegalesUrls } from './checks/mentions-legales.js';
import { analyzeRawDocument } from './raw-document-signals.js';
import { extractTextFromHtml } from './extract-text.js';
import { isSocialPlatformHost } from './social-hosts.js';
import { checkSitemap, type SitemapCheckResult } from './checks/sitemap.js';
import {
  createPageWorkGuard,
  PageWorkDeadlineError,
  withPageWorkDeadline,
  type PageWorkGuard,
} from './page-work-guard.js';
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
  type ContinuationGuardSnapshot,
  type ContinuationGuardSummary,
} from './continuation-guard.js';
import { isConfirmedListing } from './full-audit-plan.js';
import type { ScanToolIdentity } from './artifacts/crawl-checkpoint-io.js';
import { buildRobotsPolicySnapshot, type RobotsPolicySnapshot } from './robots-policy-snapshot.js';
import { captureStructuralAnchor, type StructuralAnchor } from './temporal-anchors.js';
import {
  InventoryLedger,
  type InventoryDiscoverySource,
  type InventoryDisposition,
  type InventoryLedgerSnapshot,
} from './inventory-ledger.js';

export { isSameSiteHostname } from './links.js';

/** Progress events for a live ETA display. Purely additive: emitted only
 *  when a caller supplies onProgress, no behavior change otherwise.
 *  crawl-setup fires once at the very start, before robots.txt and any
 *  sitemap document is fetched, because the crawler paces those setup
 *  fetches at the effective delay too and a slow-profile job would
 *  otherwise read as a stuck queue for that whole window (issue #121).
 *  crawl-start fires once, right after effectiveDelayMs is known, so an
 *  ETA can be shown before the first page is even fetched. crawl-page
 *  fires once per page dequeued (visited, skipped, or errored alike),
 *  since all three consume one iteration of the politeness delay. */
export type CrawlProgressEvent =
  | { type: 'crawl-setup'; maxPages: number; delayMs: number }
  | { type: 'crawl-start'; maxPages: number; effectiveDelayMs: number; robotsTxtFound: boolean }
  | { type: 'crawl-page'; visited: number; maxPages: number; queued: number }
  | { type: 'continuation-guard'; omittedUrlCount: number; omittedFamilyCount: number };

export interface CrawlOptions {
  browser: Browser;
  maxPages?: number;
  maxDepth?: number;
  delayMs?: number;
  timeoutMs?: number;
  /** Parent guard used to reclaim the crawl context on run cancellation. */
  guard?: PageWorkGuard;
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
  /** Plan 035 (issue #124): when set, the crawl writes periodic frontier
   *  snapshots through writeState, and a snapshot supplied as resumeState
   *  turns the crawl into a continuation of the interrupted run instead of
   *  a restart. Absent (the default) leaves the crawl's behavior exactly
   *  as it was before this option existed. */
  frontier?: CrawlFrontierOptions;
  /** Plan 059 decision 18: the run's single host-wide politeness scheduler.
   *  When supplied, every navigation this crawl makes takes its turn from it
   *  instead of from the crawl's own sleep, so the crawl phase and everything
   *  the scan phase later does share one request rate rather than each
   *  observing the delay privately. The crawl still owns the *value*: it
   *  computes the stricter-of-config-and-robots delay and raises the
   *  scheduler's floor to it, so a robots `Crawl-delay` slows the whole run
   *  and not merely the crawl.
   *
   *  Optional because the standalone crawl (the `crawl` CLI command, every
   *  crawl test) has no run to share a scheduler with. Absent, the crawl
   *  paces itself exactly as it did before this option existed. */
  scheduler?: HostRequestScheduler;
  /** Plan 059 production network policy. Omitted by standalone/test callers. */
  networkPolicy?: NetworkTargetPolicy;
  onNetworkSafetyBlocked?: NetworkSafetyBlockHandler;
  /** Plan 059 evidence epoch owning this crawl's robots policy chain. */
  evidenceEpoch?: number;
  /** Frozen AuditScopeSnapshot digest. Enables the private inventory ledger. */
  scopeDigest?: string;
  /** Plan 059 section 13: probe the start page twice, back to back, before
   *  the first crawl navigation, as the opening anchors of the audit's
   *  temporal-coherence window. Only a full audit with a shared scheduler
   *  asks for them; the probes are paced and robots-checked like any page. */
  captureStartAnchors?: boolean;
}

/** Per-iteration loop state the resumable crawl must survive a process
 *  restart with. crawl.ts owns this shape; the caller owns the file
 *  (scan-site.ts persists it via crawl-frontier-io.ts). */
export interface CrawlFrontierSnapshot {
  startUrlIdentity: string;
  homepageUrlIdentity?: string;
  /** Raw robots.txt text, persisted so the post-loop computations
   *  (robotsDisallowMatches, aiCrawlerBlocks) and the sitemap directive
   *  passthrough are identical on resume without re-fetching. */
  robotsText: string | null;
  /** Plan 059 policy history. Optional only for pre-059/frontier test fixtures. */
  robotsPolicyChain?: RobotsPolicySnapshot[];
  /** Private Plan 059 inventory state, checkpointed with the crawl frontier. */
  inventoryLedger?: InventoryLedgerSnapshot;
  /** Plan 059 opening temporal anchors, kept so a resumed crawl's window
   *  still starts where the interrupted attempt's did. */
  startAnchors?: StructuralAnchor[];
  supplementalPhaseStarted: boolean;
  queue: QueueItem[];
  visited: string[];
  pages: CrawledPage[];
  linkDiscoveredUrls: string[];
  linkDiscoveredFrom: [string, string][];
  guard: ContinuationGuardSnapshot;
  sitemap: SitemapCheckResult | undefined;
  eligibleSitemapUrls: string[];
  filteredSitemapPageCount: number;
  relativeLinkNestingSummary?: {
    omittedUrlCount: number;
    omittedExampleUrls: string[];
    repeatedSegments: string[];
  };
}

/** The frontier file's envelope (crawl-state.json): the same identity and
 *  config validation block the crawl checkpoint uses, wrapped around the
 *  loop state. Not persisted here: `enqueued` is rebuilt on restore as the
 *  union of every recorded page URL and every queue URL, and
 *  `effectiveDelayMs` is recomputed from the restored robotsText with the
 *  same parseRobotsTxt call the fresh path uses. */
export interface CrawlFrontierState {
  format: 'full-audit-crawl-frontier-v1';
  startedAt: string;
  config: AuditConfigSnapshot;
  toolIdentity: ScanToolIdentity;
  /** Plan 059: the frozen scope the frontier was crawled under. */
  scopeDigest?: string;
  state: CrawlFrontierSnapshot;
}

export interface CrawlFrontierOptions {
  /** Absent: fresh crawl that writes periodic snapshots. Present: resume
   *  exactly from this snapshot (its guard snapshot rides inside) and keep
   *  snapshotting under the same cadence with the restored state as the
   *  baseline. Its startUrlIdentity must match the crawl's own. */
  resumeState?: CrawlFrontierSnapshot;
  /** Called only at whole-iteration boundaries, never mid-page, with a
   *  fully consistent loop state. Must serialize synchronously: the
   *  snapshot aliases live in-memory structures, so a callback that
   *  defers the write can observe later mutations. writeCrawlFrontierState
   *  (sync temp-file write plus rename) is the intended implementation. */
  writeState: (state: CrawlFrontierSnapshot) => void;
  /** Minimum recorded pages between snapshots. Default 50. */
  everyPages?: number;
  /** Minimum milliseconds between snapshots. Default 60_000. */
  minIntervalMs?: number;
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
  | 'redirect-interstitial'
  | 'blocked'
  | 'error';

export interface CrawledPage {
  url: string;
  depth: number;
  status: CrawledPageStatus;
  httpStatus?: number;
  error?: string;
  discoveredFrom?: string;
  discoveryMethod: PageDiscoveryMethod;
  /** Identity-equivalent spelling returned by the server. Scan navigation
   * uses it to avoid reintroducing a slash redirect the crawl already saw. */
  servedUrl?: string;
  /** Same-site server redirect target recorded before content analysis. */
  redirectTargetUrl?: string;
  /** Plan 021 Step 3: only present for `status === 'visited'`, extracted
   *  from this same post-`load` navigation, no extra page fetch. Absent
   *  for every other status, including `discovered-not-scanned`, since
   *  nothing downstream schedules checks against a page that is never
   *  scanned. */
  auditProfile?: PageAuditProfile;
  /** E9: structural proof that a sitemap-only non-public plugin object was
   *  inventoried but deliberately not content-analysed. */
  pluginObject?: { postType: string; bodyClass: string };
}

export interface CrawlResult {
  startUrl: string;
  /** Identity of the page the requested start URL actually landed on. */
  homepageUrl?: string;
  pages: CrawledPage[];
  visitedCount: number;
  maxPages: number;
  maxDepth: number;
  robotsTxtFound: boolean;
  /** Exact versioned robots policy history for this evidence epoch. */
  robotsPolicyChain?: RobotsPolicySnapshot[];
  /** Private Plan 059 inventory; omitted for callers that did not supply scope. */
  inventoryLedger?: InventoryLedgerSnapshot;
  /** Plan 059 opening temporal anchors of the start page, when requested and
   *  captured. Absent means the coherence window has no start. */
  startAnchors?: StructuralAnchor[];
  /** The stricter-of-config-and-robots delay actually used between
   *  requests, so later stages (the scanner passes) can reuse the exact
   *  same politeness pacing without re-fetching robots.txt. */
  effectiveDelayMs: number;
  /** The one visited page URL matching the mentions-legales heuristic, if
   *  any. Resolved from URLs already collected during the crawl, no extra
   *  navigation. scanSite forwards this into scanPage so only that one
   *  page runs the SIREN/RCS/TVA text extraction. */
  mentionsLegalesPageUrl?: string;
  /** All resolved legal notice candidates, ordered by direct-notice preference. */
  mentionsLegalesCandidateUrls?: string[];
  /** Plan 036: every visited, non-error-status URL `findMentionsLegalesUrl`
   *  searched to produce the winner above (or to find nothing), so the
   *  finding's evidence can name what was actually checked, not just the
   *  one resolved page. Optional only for older hand-built `CrawlResult`
   *  fixtures in tests; the real crawl() always sets it. */
  mentionsLegalesSearchedUrls?: string[];
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
  /** Eligible sitemap identities retained for offline evidence decisions. */
  sitemapUrls?: string[];
  /** Relative-link nesting omissions, disclosed as a site-level crawl fact. */
  relativeLinkNestingSummary?: {
    omittedUrlCount: number;
    omittedExampleUrls: string[];
    repeatedSegments: string[];
  };
  /** Present only when the host stopped answering and the crawl ended early
   *  on HOST_REFUSAL_STOP_THRESHOLD refused navigations in a row. The URLs
   *  still queued were never requested. */
  hostStoppedAnswering?: HostStoppedAnswering;
}

export interface QueueItem {
  url: string;
  depth: number;
  discoveredFrom?: string;
  discoveryMethod: PageDiscoveryMethod;
  /** Carries the requested start URL's landed target through a redirect. */
  isHomepage?: boolean;
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

/** The crawl loop's mutable in-memory structures, rebuilt wholesale from a
 *  frontier snapshot on resume. */
export interface CrawlFrontierLoopState {
  pages: CrawledPage[];
  pagesByUrl: Map<string, CrawledPage>;
  visited: Set<string>;
  linkDiscoveredUrls: Set<string>;
  linkDiscoveredFrom: Map<string, string>;
  /** Rebuilt, never persisted: every dequeued URL is recorded in pages,
   *  and every enqueued URL is either still queued or already recorded,
   *  so this set is exactly the union of both. */
  enqueued: Set<string>;
  queue: QueueItem[];
  guard: ContinuationGuard;
  relativeLinkNestingSummary?: {
    omittedUrlCount: number;
    omittedExampleUrls: string[];
    repeatedSegments: string[];
  };
  homepageUrlIdentity?: string;
}

/** Pure rebuild of the crawl loop's bookkeeping from a frontier snapshot,
 *  so a resumed crawl makes identical enqueue and admit decisions to the
 *  uninterrupted crawl it replaces. Page and queue entries are shallow
 *  copies, so later link-discovery upgrades (a recorded page's
 *  discoveryMethod becoming 'link') mutate the rebuild, never the
 *  snapshot the caller passed in. Throws when the snapshot's guard state
 *  was written by a different guard version or family cap. */
export function restoreCrawlFrontierLoopState(
  state: CrawlFrontierSnapshot,
): CrawlFrontierLoopState {
  const pages = state.pages.map((page) => ({ ...page }));
  const pagesByUrl = new Map(pages.map((page) => [page.url, page]));
  const visited = new Set(state.visited);
  const linkDiscoveredUrls = new Set(state.linkDiscoveredUrls);
  const linkDiscoveredFrom = new Map(
    state.linkDiscoveredFrom.map(([url, discoveredFrom]) => [url, discoveredFrom] as const),
  );
  const queue = state.queue.map((item) => ({ ...item }));
  const enqueued = new Set<string>([
    ...pages.map((page) => page.url),
    ...queue.map((item) => item.url),
  ]);
  const guard = ContinuationGuard.fromSnapshot(state.guard);
  return {
    pages,
    pagesByUrl,
    visited,
    linkDiscoveredUrls,
    linkDiscoveredFrom,
    enqueued,
    queue,
    guard,
    ...(state.relativeLinkNestingSummary !== undefined
      ? { relativeLinkNestingSummary: { ...state.relativeLinkNestingSummary } }
      : {}),
    ...(state.homepageUrlIdentity !== undefined
      ? { homepageUrlIdentity: state.homepageUrlIdentity }
      : {}),
  };
}

/** Playwright's navigation timeout, recognised by its error name so a
 *  wording change in the message does not silently disable the retry. */
function isNavigationTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

function retryAfterMs(headers: Record<string, string>): number | undefined {
  const value = headers['retry-after'];
  if (value === undefined) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

/** An http-to-https upgrade is a same-site redirect too: an http:// start
 *  URL keeps a sitemap's http:// spellings, and without this every entry
 *  was visited, and then scanned, a second time beside its https twin. */
function sameSiteServerRedirect(requestedUrl: string, landedUrl: string): boolean {
  try {
    const requested = new URL(requestedUrl);
    const landed = new URL(landedUrl);
    const upgradedToHttps = requested.protocol === 'http:' && landed.protocol === 'https:';
    return (
      (requested.protocol === landed.protocol || upgradedToHttps) &&
      requested.port === landed.port &&
      isSameSiteHostname(requested.hostname, landed.hostname)
    );
  } catch {
    return false;
  }
}

/** browserPage.url() is "about:blank" before any navigation commits and
 *  can in principle be any malformed value; never let a URL parse failure
 *  here throw out of the crawl loop. */
function safeHostname(url: string): string | null {
  try {
    // A navigation that never committed leaves the tab on about:blank,
    // whose hostname is ''. That is "no answer", not "landed elsewhere":
    // treating it as a host recorded silent pages as external redirects.
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

/** robots.txt patterns apply to the path plus query string (RFC 9309), so a
 *  rule such as `Disallow: /*?sort=` can match. */
function robotsTarget(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}

/**
 * Breadth-first crawl from startUrl, following only same-origin links.
 * Reuses one BrowserContext for the whole crawl (a fresh Page per URL,
 * closed after each navigation) per the "reuse browser instances across
 * pages within a job" guidance. robots.txt is fetched once up front;
 * disallowed URLs are recorded but never navigated to. The politeness
 * delay is the larger of the configured delay and the site's own
 * Crawl-delay, since a site's stated preference should never be
 * overridden downward by local config. Who waits that delay depends on
 * `scheduler`: given one, the crawl takes each navigation's turn from the
 * run's shared host scheduler and only contributes the delay value to it;
 * given none, it sleeps between its own navigations as it always did.
 *
 * Plan 035 (issue #124): with `frontier` set the loop state (queue,
 * visited set, recorded pages, guard counters, robots/sitemap facts) is
 * snapshotted through writeState at a throttled cadence, and a snapshot
 * supplied as resumeState continues the interrupted crawl exactly - same
 * robots enforcement, same delay semantics, same guard decisions - without
 * re-visiting a single URL. On resume the robots.txt and sitemap fetches
 * are skipped entirely (their persisted results are used), and the first
 * resumed fetch still pays the politeness delay: a fast restart must never
 * fire immediately at a site that may be rejecting crawls. Without
 * `frontier` the behavior is unchanged.
 */
export async function crawlSite(startUrl: string, options: CrawlOptions): Promise<CrawlResult> {
  const maxPages = options.maxPages ?? getMaxPages();
  const maxDepth = options.maxDepth ?? getMaxCrawlDepth();
  const delayMs = options.delayMs ?? getCrawlDelayMs();
  const timeoutMs = options.timeoutMs ?? getPageTimeoutMs();
  const userAgent = options.userAgent ?? getCrawlerUserAgent();
  const exclusionRegexes = (options.exclusions ?? []).map(globToRegExp);
  const sitemapOperatorExclusions: string[] = [];

  const start = new URL(startUrl);
  // Issue #102: the start URL goes through the same page-identity rule as
  // every discovered link and sitemap entry, so a trailing-slash spelling
  // is the same page as its bare form before anything is enqueued - the
  // Briketenia audit crawled /fr and /fr/ as two visited pages and counted
  // both in every analyzed-page denominator. Applied once here and reused
  // for the queue seed, the visited-set bookkeeping, and CrawlResult.startUrl,
  // so every downstream "is this the homepage" comparison reads one
  // identity, and the duplicate variant is never fetched at all.
  const startUrlIdentity = normalizePageIdentityUrl(start.toString()) ?? start.toString();
  // Fired before the paced setup fetches so a slow-profile job reads as
  // active crawl work from the moment the crawler owns it, not only once
  // the first page is dequeued (issue #121).
  options.onProgress?.({ type: 'crawl-setup', maxPages, delayMs });

  const frontier = options.frontier;
  const resumeState = frontier?.resumeState;
  if (resumeState !== undefined && resumeState.startUrlIdentity !== startUrlIdentity) {
    throw new Error(
      'crawlSite: frontier resume state belongs to a different start URL than this crawl.',
    );
  }

  // Fetched once as raw text (not via fetchRobotsRules) so the same
  // response can also be parsed against each AI_CRAWLER_USER_AGENTS
  // token below, without a second request to robots.txt. On resume the
  // persisted text is reused verbatim instead of re-fetched, so the
  // post-loop computations (robotsDisallowMatches, aiCrawlerBlocks) and
  // the sitemap directive passthrough are identical without a request.
  let robotsText: string | null;
  let robotsRules: RobotsRules;
  let robotsPolicyChain: RobotsPolicySnapshot[];
  if (resumeState === undefined) {
    const robotsUrl = new URL('/robots.txt', start.origin).href;
    if (options.networkPolicy !== undefined) {
      const networkVerdict = await checkNetworkTarget(robotsUrl, options.networkPolicy);
      if (networkVerdict.kind === 'refused') {
        options.onNetworkSafetyBlocked?.(networkVerdict.disposition);
        throw new Error(
          `crawlSite: network safety blocked robots target (${networkVerdict.disposition.reason})`,
        );
      }
    }
    robotsText =
      options.scheduler === undefined
        ? await fetchRobotsText(start.origin, timeoutMs, userAgent, {
            ...(options.networkPolicy !== undefined
              ? { networkPolicy: options.networkPolicy }
              : {}),
            ...(options.onNetworkSafetyBlocked !== undefined
              ? { onNetworkSafetyBlocked: options.onNetworkSafetyBlocked }
              : {}),
          })
        : await options.scheduler.schedule(() =>
            fetchRobotsText(start.origin, timeoutMs, userAgent, {
              ...(options.networkPolicy !== undefined
                ? { networkPolicy: options.networkPolicy }
                : {}),
              ...(options.onNetworkSafetyBlocked !== undefined
                ? { onNetworkSafetyBlocked: options.onNetworkSafetyBlocked }
                : {}),
            }),
          );
    robotsRules =
      robotsText === null
        ? { found: false, disallow: [], allow: [], sitemapUrls: [] }
        : parseRobotsTxt(robotsText, userAgent);
    robotsPolicyChain = [
      buildRobotsPolicySnapshot({
        evidenceEpoch: options.evidenceEpoch ?? 1,
        revision: 0,
        origin: start.origin,
        userAgent,
        robotsText,
        retrievedAt: new Date(),
        rules: robotsRules,
        configuredDelayMs: delayMs,
      }),
    ];
  } else {
    robotsText = resumeState.robotsText;
    robotsRules =
      robotsText === null
        ? { found: false, disallow: [], allow: [], sitemapUrls: [] }
        : parseRobotsTxt(robotsText, userAgent);
    robotsPolicyChain = [...(resumeState.robotsPolicyChain ?? [])];
  }
  // Never persisted: recomputed from the restored robotsText with the
  // same parse the fresh path uses, under a config the resume validation
  // has already pinned.
  const effectiveDelayMs = Math.max(delayMs, robotsRules.crawlDelayMs ?? 0);
  // Plan 059 decision 18: the shared scheduler is constructed before robots.txt
  // has been read, so this is where the site's own Crawl-delay reaches it. The
  // raise is one-way inside the scheduler, so handing it the same value on a
  // resume (where the delay is recomputed rather than restored) is a no-op
  // rather than a way to walk a backed-off run's pacing back down.
  options.scheduler?.raiseDelayTo(effectiveDelayMs);
  let startAnchors: StructuralAnchor[] | undefined = resumeState?.startAnchors;
  const sitemapMode = options.sitemapMode ?? 'none';
  const eligibleSitemapUrls = new Set<string>();
  let filteredSitemapPageCount = 0;
  let sitemap: SitemapCheckResult | undefined;
  let supplementalPhaseStarted = false;
  if (resumeState === undefined) {
    sitemap =
      sitemapMode === 'none'
        ? undefined
        : await checkSitemap(start.origin, robotsRules.sitemapUrls, timeoutMs, {
            userAgent,
            delayMs: effectiveDelayMs,
            ...(options.scheduler !== undefined ? { scheduler: options.scheduler } : {}),
            ...(options.networkPolicy !== undefined
              ? { networkPolicy: options.networkPolicy }
              : {}),
            ...(options.onNetworkSafetyBlocked !== undefined
              ? { onNetworkSafetyBlocked: options.onNetworkSafetyBlocked }
              : {}),
          });
    if (sitemap !== undefined) {
      for (const entry of sitemap.pageEntries) {
        const normalizedWithoutExclusion = normalizePageUrl(entry.url, startUrlIdentity, {
          allowWwwApex: true,
        });
        const normalized = normalizePageUrl(entry.url, startUrlIdentity, {
          allowWwwApex: true,
          exclusionPatterns: options.exclusions ?? [],
        });
        if (normalized === undefined) {
          filteredSitemapPageCount += 1;
          if (
            normalizedWithoutExclusion !== undefined &&
            exclusionRegexes.some((pattern) => pattern.test(normalizedWithoutExclusion))
          ) {
            sitemapOperatorExclusions.push(normalizedWithoutExclusion);
          }
        } else {
          eligibleSitemapUrls.add(normalized);
        }
      }
    }
  } else {
    // The sitemap was resolved under the same config on the interrupted
    // run; restore its result and the eligibility bookkeeping computed
    // from it instead of refetching anything.
    sitemap = resumeState.sitemap;
    for (const url of resumeState.eligibleSitemapUrls) eligibleSitemapUrls.add(url);
    filteredSitemapPageCount = resumeState.filteredSitemapPageCount;
    supplementalPhaseStarted = resumeState.supplementalPhaseStarted;
  }

  options.onProgress?.({
    type: 'crawl-start',
    maxPages,
    effectiveDelayMs,
    robotsTxtFound: robotsRules.found,
  });

  const restored =
    resumeState !== undefined ? restoreCrawlFrontierLoopState(resumeState) : undefined;
  const pages: CrawledPage[] = restored?.pages ?? [];
  const pagesByUrl = restored?.pagesByUrl ?? new Map<string, CrawledPage>();
  const visited = restored?.visited ?? new Set<string>();
  const linkDiscoveredUrls = restored?.linkDiscoveredUrls ?? new Set<string>([startUrlIdentity]);
  const linkDiscoveredFrom = restored?.linkDiscoveredFrom ?? new Map<string, string>();
  const enqueued = restored?.enqueued ?? new Set<string>([startUrlIdentity]);
  const queue: QueueItem[] = restored?.queue ?? [
    { url: startUrlIdentity, depth: 0, discoveryMethod: 'link', isHomepage: true },
  ];
  let homepageUrlIdentity = restored?.homepageUrlIdentity ?? startUrlIdentity;
  // Plan 021 Step 6: one guard per crawlSite call, never shared across
  // crawls - a family key is only meaningful within the site it was
  // discovered on. A resumed crawl restores the interrupted run's guard
  // state instead, so it cannot re-admit URLs a family had exhausted.
  const continuationGuard = restored?.guard ?? new ContinuationGuard();
  const relativeLinkNesting = restored?.relativeLinkNestingSummary ?? {
    omittedUrlCount: 0,
    omittedExampleUrls: [] as string[],
    repeatedSegments: [] as string[],
  };

  const inventorySourceFor = (
    url: string,
    discoveryMethod: PageDiscoveryMethod,
  ): InventoryDiscoverySource => {
    if (url === startUrlIdentity) return 'start';
    if (discoveryMethod === 'seed') return 'seed';
    if (discoveryMethod === 'sitemap-only') return 'sitemap';
    return 'link';
  };
  const inventoryLedger = (() => {
    if (options.scopeDigest === undefined) return undefined;
    if (resumeState?.inventoryLedger !== undefined) {
      if (
        resumeState.inventoryLedger.scopeDigest !== options.scopeDigest ||
        resumeState.inventoryLedger.evidenceEpoch !== (options.evidenceEpoch ?? 1)
      ) {
        throw new Error('crawlSite: inventory frontier belongs to another scope or evidence epoch');
      }
      return InventoryLedger.fromSnapshot(resumeState.inventoryLedger);
    }
    return new InventoryLedger({
      evidenceEpoch: options.evidenceEpoch ?? 1,
      scopeDigest: options.scopeDigest,
    });
  })();

  const ensureInventoryDiscovery = (
    url: string,
    discoveryMethod: PageDiscoveryMethod,
    depth: number,
    discoveredFrom?: string,
  ): void => {
    if (inventoryLedger === undefined) return;
    inventoryLedger.recordDiscovery({
      url,
      source: inventorySourceFor(url, discoveryMethod),
      discoveredAt: new Date(),
      depth,
      ...(discoveredFrom !== undefined ? { referrer: discoveredFrom } : {}),
    });
  };

  const disposeInventory = (
    url: string,
    disposition: InventoryDisposition,
    details: { finalUrl?: string; httpStatus?: number; detail?: string } = {},
  ): void => {
    if (inventoryLedger === undefined) return;
    const candidate = inventoryLedger.candidate(url);
    if (candidate === undefined) {
      throw new Error(`crawlSite: cannot dispose undiscovered inventory target ${url}`);
    }
    if (candidate.disposition !== undefined) return;
    inventoryLedger.recordDisposition({
      url,
      disposition,
      decidedAt: new Date(),
      ...details,
    });
  };

  if (inventoryLedger !== undefined && resumeState?.inventoryLedger === undefined) {
    ensureInventoryDiscovery(startUrlIdentity, 'link', 0);
    for (const url of eligibleSitemapUrls) {
      inventoryLedger.recordDiscovery({
        url,
        source: 'sitemap',
        discoveredAt: new Date(),
        depth: 0,
      });
    }
    for (const url of sitemapOperatorExclusions) {
      inventoryLedger.recordDiscovery({
        url,
        source: 'sitemap',
        discoveredAt: new Date(),
        depth: 0,
      });
      disposeInventory(url, 'operator-excluded', {
        detail: 'matched an operator-supplied crawl exclusion',
      });
    }
    for (const page of pages) {
      ensureInventoryDiscovery(page.url, page.discoveryMethod, page.depth, page.discoveredFrom);
      const disposition: InventoryDisposition | undefined =
        page.status === 'discovered-not-scanned'
          ? 'link-discovery-only'
          : page.status === 'skipped-robots'
            ? 'robots'
            : page.status === 'skipped-non-html'
              ? 'non-html'
              : page.status === 'skipped-external-redirect'
                ? 'external'
                : page.status === 'http-error-status'
                  ? 'http-error-status'
                  : page.status === 'redirect-interstitial'
                    ? 'redirect'
                    : page.status === 'blocked'
                      ? 'blocked'
                      : page.status === 'error'
                        ? 'error'
                        : undefined;
      if (disposition !== undefined) {
        disposeInventory(page.url, disposition, {
          ...(page.httpStatus !== undefined ? { httpStatus: page.httpStatus } : {}),
          ...(page.error !== undefined ? { detail: page.error } : {}),
        });
      }
    }
    for (const item of queue) {
      ensureInventoryDiscovery(item.url, item.discoveryMethod, item.depth, item.discoveredFrom);
    }
  }

  // Manual-input-layer milestone: extra seed URLs are enqueued at depth 0,
  // same as the start URL, before the crawl loop begins. Off-origin seeds
  // are silently dropped (this crawler only ever audits one origin, same
  // rule normalizeInternalLinks already enforces for discovered links);
  // an unparsable seed is dropped the same way a malformed href is.
  // Safe to run on resume too: every seed the interrupted run enqueued is
  // already queued or recorded, so the enqueued check below makes this a
  // no-op for anything already in the restored state.
  for (const seed of options.seeds ?? []) {
    // Issue #102: seeds go through the same page-identity rule as the start
    // URL, so a seed spelled with a trailing slash cannot enqueue a second
    // copy of a page the start URL already carries (or become one itself).
    const normalizedSeed = normalizePageIdentityUrl(seed);
    if (normalizedSeed === undefined) continue;
    let resolvedSeed: URL;
    try {
      resolvedSeed = new URL(normalizedSeed);
    } catch {
      continue;
    }
    if (resolvedSeed.origin !== start.origin) continue;
    ensureInventoryDiscovery(normalizedSeed, 'seed', 0);
    if (enqueued.has(normalizedSeed)) continue;
    enqueued.add(normalizedSeed);
    queue.push({ url: normalizedSeed, depth: 0, discoveryMethod: 'seed' });
  }

  /** The crawl's one browsing context and the guard its watchdog closes.
   *  Reopened after a page outlives its deadline (issue #499), since the
   *  deadline closes every context the guard tracks. */
  const openCrawlContext = async (): Promise<{
    context: BrowserContext;
    crawlGuard: PageWorkGuard;
  }> => {
    const opened = await options.browser.newContext({ userAgent, locale: AUDIT_BROWSER_LOCALE });
    const guard = createPageWorkGuard(options.guard);
    guard.track(opened);
    if (options.networkPolicy !== undefined) {
      await installBrowserNetworkSafety(
        opened,
        options.networkPolicy,
        options.onNetworkSafetyBlocked,
      );
    }
    opened.setDefaultTimeout(timeoutMs);
    opened.setDefaultNavigationTimeout(timeoutMs);
    return { context: opened, crawlGuard: guard };
  };
  let { context, crawlGuard } = await openCrawlContext();

  const recordPage = (page: CrawledPage): void => {
    pages.push(page);
    pagesByUrl.set(page.url, page);
    ensureInventoryDiscovery(page.url, page.discoveryMethod, page.depth, page.discoveredFrom);
    const disposition: InventoryDisposition | undefined =
      page.status === 'discovered-not-scanned'
        ? 'link-discovery-only'
        : page.status === 'skipped-robots'
          ? 'robots'
          : page.status === 'skipped-non-html'
            ? 'non-html'
            : page.status === 'skipped-external-redirect'
              ? 'external'
              : page.status === 'http-error-status'
                ? 'http-error-status'
                : page.status === 'redirect-interstitial'
                  ? 'redirect'
                  : page.status === 'blocked'
                    ? 'blocked'
                    : page.status === 'error'
                      ? 'error'
                      : undefined;
    if (disposition !== undefined) {
      disposeInventory(page.url, disposition, {
        ...(page.httpStatus !== undefined ? { httpStatus: page.httpStatus } : {}),
        ...(page.error !== undefined ? { detail: page.error } : {}),
      });
    }
  };

  // Frontier snapshot cadence (plan 035): a snapshot fires only once at
  // least everyPages pages have been recorded since the last one AND at
  // least minIntervalMs have elapsed, so a fast fixture-sized crawl does
  // not write per page and a slow real crawl still checkpoints at bounded
  // staleness. On resume the restored state is the baseline, so the first
  // new snapshot waits for the same amount of fresh progress.
  const frontierWrite = frontier?.writeState;
  const frontierEveryPages = frontier?.everyPages ?? 50;
  const frontierMinIntervalMs = frontier?.minIntervalMs ?? 60_000;
  let pagesAtLastFrontierSnapshot = resumeState?.pages.length ?? 0;
  let lastFrontierSnapshotMs = Date.now();

  const buildFrontierSnapshot = (): CrawlFrontierSnapshot => ({
    startUrlIdentity,
    robotsText,
    ...(robotsPolicyChain.length > 0 ? { robotsPolicyChain: [...robotsPolicyChain] } : {}),
    ...(inventoryLedger !== undefined ? { inventoryLedger: inventoryLedger.snapshot() } : {}),
    ...(startAnchors !== undefined ? { startAnchors: [...startAnchors] } : {}),
    supplementalPhaseStarted,
    queue: queue.map((item) => ({ ...item })),
    visited: [...visited],
    pages: pages.map((page) => ({ ...page })),
    linkDiscoveredUrls: [...linkDiscoveredUrls],
    linkDiscoveredFrom: [...linkDiscoveredFrom],
    guard: continuationGuard.snapshot(),
    sitemap,
    eligibleSitemapUrls: [...eligibleSitemapUrls],
    filteredSitemapPageCount,
    ...(relativeLinkNesting.omittedUrlCount > 0
      ? { relativeLinkNestingSummary: { ...relativeLinkNesting } }
      : {}),
    homepageUrlIdentity,
  });

  // Called only at whole-iteration boundaries, where queue, visited, and
  // pages are mutually consistent (never mid-page), so restoring a
  // snapshot reproduces a state the loop could actually have been in.
  const maybeSnapshotFrontier = (): void => {
    if (frontierWrite === undefined) return;
    if (pages.length - pagesAtLastFrontierSnapshot < frontierEveryPages) return;
    if (Date.now() - lastFrontierSnapshotMs < frontierMinIntervalMs) return;
    frontierWrite(buildFrontierSnapshot());
    pagesAtLastFrontierSnapshot = pages.length;
    lastFrontierSnapshotMs = Date.now();
  };

  const scheduler = options.scheduler;

  // A host that bans the crawler's IP address mid-crawl closes every later
  // connection without a response, and it does so however slowly the crawl
  // goes. Counting the unbroken run of such refusals lets the crawl stop
  // sending requests instead of spending the rest of its queue on them.
  let answeredNavigationCount = 0;
  let consecutiveRefusals = 0;
  let lastRefusalCode: string | undefined;
  let hostStoppedAnswering: HostStoppedAnswering | undefined;

  try {
    // A resumed crawl starts false on purpose: the first resumed fetch
    // must pay the politeness delay, since a fast restart would otherwise
    // fire immediately at a site that may be rejecting crawls.
    let isFirstNavigation = resumeState === undefined;
    if (scheduler !== undefined && resumeState !== undefined) {
      // The same rule, expressed against a scheduler that has no memory of the
      // interrupted attempt and would therefore hand the first resumed
      // navigation a free opening slot. Claiming an empty turn charges that
      // slot to the requests the previous attempt already made, so the first
      // real resumed navigation waits exactly like every later one.
      await scheduler.schedule(async () => {});
    }

    /** One place decides how a navigation earns its turn, because exactly one
     *  pacer may apply to a given request: with the run's shared scheduler the
     *  wait is global and the crawl competes for the same request rate as every
     *  later phase, and without one the crawl keeps the private
     *  sleep-between-pages it has always had. Running both would pay the
     *  politeness delay twice for every page. */
    const paceNavigation = async <T>(navigate: () => Promise<T>): Promise<T> => {
      if (scheduler !== undefined) return scheduler.schedule(navigate);
      if (!isFirstNavigation) {
        await new Promise((resolve) => setTimeout(resolve, effectiveDelayMs));
      }
      isFirstNavigation = false;
      return navigate();
    };

    if (
      options.captureStartAnchors === true &&
      scheduler !== undefined &&
      startAnchors === undefined &&
      isAllowedByRobots(robotsRules, robotsTarget(startUrlIdentity))
    ) {
      const probe = () =>
        paceNavigation(() =>
          captureStructuralAnchor(options.browser, startUrlIdentity, {
            userAgent,
            timeoutMs,
            ...(options.networkPolicy !== undefined
              ? { networkPolicy: options.networkPolicy }
              : {}),
            ...(options.onNetworkSafetyBlocked !== undefined
              ? { onNetworkSafetyBlocked: options.onNetworkSafetyBlocked }
              : {}),
          }),
        );
      try {
        startAnchors = [await probe(), await probe()];
      } catch {
        // Left absent rather than retried into the crawl's budget: the
        // coherence verdict then stays unknown, which blocks approval.
        startAnchors = undefined;
      }
    }

    while (true) {
      while (hostStoppedAnswering === undefined && queue.length > 0 && visited.size < maxPages) {
        const item = queue.shift()!;
        const discoveryMethod = linkDiscoveredUrls.has(item.url) ? 'link' : item.discoveryMethod;
        const discoveredFrom = item.discoveredFrom ?? linkDiscoveredFrom.get(item.url);

        if (!isAllowedByRobots(robotsRules, robotsTarget(item.url))) {
          recordPage({
            url: item.url,
            depth: item.depth,
            status: 'skipped-robots',
            discoveryMethod,
            ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
          });
          maybeSnapshotFrontier();
          continue;
        }

        visited.add(item.url);
        options.onProgress?.({
          type: 'crawl-page',
          visited: visited.size,
          maxPages,
          queued: queue.length,
        });

        // Issue #499: an iteration that outlives its watchdog keeps running
        // until its closed context makes it throw. Its late writes are
        // dropped, so the watchdog's own error record is the page's only one.
        let abandoned = false;
        const recordFromIteration = (page: CrawledPage): void => {
          if (!abandoned) recordPage(page);
        };
        const enqueueFromIteration = (queued: (typeof queue)[number]): void => {
          if (!abandoned) queue.push(queued);
        };
        const pageWork = async (): Promise<void> => {
          // Every URL is requested as a first visit, the way a search engine
          // crawls. A cookie one page sets must not steer the next: a Next.js
          // site sets NEXT_LOCALE=es on its /es/ pages and then redirects every
          // French URL to its Spanish copy, so the French site was never
          // crawled. Only cookies go; the shared HTTP cache stays so the host
          // does not serve every image and script again for each page.
          await context.clearCookies();
          const browserPage = await context.newPage();
          try {
            // The politeness wait now sits around the navigation itself rather
            // than ahead of the whole iteration, so that a shared scheduler
            // measures the gap between the requests a site actually receives and
            // not between bookkeeping steps. Opening a Playwright page is local
            // work and sends nothing, so it is free to happen inside the gap.
            const navigate = () =>
              paceNavigation(() => browserPage.goto(item.url, { waitUntil: 'load' }));
            // A page whose `load` event never fires inside the timeout (a
            // hanging third-party resource, most often) still served its
            // document. One paced retry that waits only for the document
            // separates that from a page that really does not answer; before
            // it, a real 200 page was recorded as 'error' and reported as a
            // broken link and an invalid hreflang target.
            const navigateAfterLoadTimeout = async (): ReturnType<typeof navigate> => {
              try {
                return await navigate();
              } catch (error) {
                if (!isNavigationTimeout(error)) throw error;
                return paceNavigation(() =>
                  browserPage.goto(item.url, { waitUntil: 'domcontentloaded' }),
                );
              }
            };
            let response = await navigateAfterLoadTimeout();
            answeredNavigationCount += 1;
            consecutiveRefusals = 0;
            let httpStatus = response?.status();
            // A stub URL that redirects out to another site (a social link)
            // answers with that site's status and body. Its 429 or challenge
            // says nothing about the audited host, so it must neither slow
            // this host's scheduler nor buy a retry.
            const requestedHost = new URL(item.url).hostname;
            const hostAliases = auditedHostAliases(requestedHost);
            let consecutiveOriginServerErrors = 0;
            const observeResponse = async () => {
              const html =
                typeof browserPage.content === 'function'
                  ? await browserPage.content().catch(() => '')
                  : '';
              const markers = analyzeRawDocument(html).interstitialMarkers;
              const title =
                typeof browserPage.title === 'function'
                  ? await browserPage.title().catch(() => '')
                  : '';
              const status = httpStatus;
              const retryAfter =
                response === null || response === undefined
                  ? undefined
                  : retryAfterMs(response.headers());
              const landedHost = safeHostname(browserPage.url()) ?? requestedHost;
              const responseInput = {
                requestedHost,
                landedHost,
                auditedHostAliases: hostAliases,
                ...(status !== undefined ? { status } : {}),
                ...(retryAfter !== undefined ? { retryAfterMs: retryAfter } : {}),
              };
              const documentInput = {
                ...(status !== undefined ? { status } : {}),
                title,
                markupLength: html.length,
                visibleTextLength: extractTextFromHtml(html).length,
                markers,
              };
              let responseClassification;
              let documentClassification;
              if (options.scheduler !== undefined) {
                const observedResponse = options.scheduler.observeHostDocument({
                  response: responseInput,
                  document: documentInput,
                  signal: { pageUrl: item.url, fetcher: 'crawl' },
                });
                responseClassification = observedResponse.response;
                documentClassification = observedResponse.document;
              } else {
                const hostCheck = classifyHostResponse({
                  ...responseInput,
                  consecutiveOriginServerErrors: 0,
                });
                if (hostCheck.auditedHost) {
                  consecutiveOriginServerErrors =
                    (status ?? 0) >= 500 ? consecutiveOriginServerErrors + 1 : 0;
                }
                responseClassification = classifyHostResponse({
                  ...responseInput,
                  consecutiveOriginServerErrors,
                });
                documentClassification = classifyDocumentWall(documentInput);
              }
              const auditedDocumentWall =
                responseClassification.auditedHost &&
                documentClassification.classification === 'wall';
              return {
                responseClassification,
                documentClassification,
                auditedDocumentWall,
                markers:
                  auditedDocumentWall && isChallengeTitle(title)
                    ? [...markers, 'challenge-title']
                    : markers,
              };
            };
            let observed = await observeResponse();
            let challengeMarkers = observed.markers;
            // One paced retry distinguishes a transient audited-host refusal
            // from a stable page error. Off-site responses never earn a retry.
            if (observed.responseClassification.disposition === 'pushback') {
              response = await navigate();
              httpStatus = response?.status();
              observed = await observeResponse();
              challengeMarkers = observed.markers;
            }
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
            const isOffSite = finalHost !== null && !isSameSiteHostname(requestedHost, finalHost);
            const landedUrl = browserPage.url();
            const landedIdentity = normalizePageIdentityUrl(landedUrl);
            const isSameSiteRedirect =
              !isOffSite &&
              sameSiteServerRedirect(item.url, landedUrl) &&
              landedIdentity !== undefined &&
              landedIdentity !== item.url;

            if (isOffSite || (finalHost !== null && isSocialPlatformHost(finalHost))) {
              recordFromIteration({
                url: item.url,
                depth: item.depth,
                status: 'skipped-external-redirect',
                discoveryMethod,
                ...(httpStatus !== undefined ? { httpStatus } : {}),
                ...(finalHost !== null ? { redirectTargetUrl: landedUrl } : {}),
                ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
              });
            } else if (
              isSameSiteRedirect &&
              (finalHost === null ||
                isAllowedByRobots(robotsRules, robotsTarget(browserPage.url())))
            ) {
              // Server redirects are inventory facts, not content pages. Keep
              // the requested spelling visible, then enqueue the actual target
              // once so only its content is analysed.
              recordFromIteration({
                url: item.url,
                depth: item.depth,
                status: 'redirect-interstitial',
                discoveryMethod,
                ...(httpStatus !== undefined ? { httpStatus } : {}),
                redirectTargetUrl: landedIdentity,
                ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
              });
              if (inventoryLedger !== undefined && landedIdentity !== undefined) {
                inventoryLedger.recordDiscovery({
                  url: landedIdentity,
                  source: 'redirect',
                  discoveredAt: new Date(),
                  referrer: item.url,
                  depth: item.depth,
                });
              }
              if (
                landedIdentity !== undefined &&
                !enqueued.has(landedIdentity) &&
                !pagesByUrl.has(landedIdentity)
              ) {
                enqueued.add(landedIdentity);
                enqueueFromIteration({
                  url: landedIdentity,
                  depth: item.depth,
                  discoveredFrom: item.url,
                  discoveryMethod: 'link',
                  ...(item.isHomepage === true ? { isHomepage: true } : {}),
                });
              }
              if (item.isHomepage === true && landedIdentity !== undefined) {
                homepageUrlIdentity = landedIdentity;
                const queuedTarget = queue.find((queued) => queued.url === landedIdentity);
                if (queuedTarget !== undefined) queuedTarget.isHomepage = true;
              }
            } else if (
              finalHost !== null &&
              !isAllowedByRobots(robotsRules, robotsTarget(browserPage.url()))
            ) {
              // A redirect can land on a path robots.txt disallows even though
              // the requested URL was allowed; the landed page is then treated
              // exactly like a disallowed link and never analysed.
              recordFromIteration({
                url: item.url,
                depth: item.depth,
                status: 'skipped-robots',
                discoveryMethod,
                ...(httpStatus !== undefined ? { httpStatus } : {}),
                ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
              });
            } else if (isNonHtmlContentType(contentType)) {
              recordFromIteration({
                url: item.url,
                depth: item.depth,
                status: 'skipped-non-html',
                discoveryMethod,
                ...(httpStatus !== undefined ? { httpStatus } : {}),
                ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
              });
            } else if (observed.auditedDocumentWall) {
              recordFromIteration({
                url: item.url,
                depth: item.depth,
                status: 'blocked',
                discoveryMethod,
                ...(httpStatus !== undefined ? { httpStatus } : {}),
                error: `document wall: ${challengeMarkers.join(', ') || observed.documentClassification.reason}`,
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
              recordFromIteration({
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
              const isHomepageNavigation =
                item.isHomepage === true || item.url === startUrlIdentity;
              const landedPageIdentity = normalizePageIdentityUrl(browserPage.url());
              if (isHomepageNavigation && landedPageIdentity !== undefined) {
                homepageUrlIdentity = landedPageIdentity;
              }
              let discoverOnly =
                !isHomepageNavigation &&
                isLanguageHomepagePath(new URL(browserPage.url()).pathname);
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
              let rawFacts: RawPageAuditFacts | undefined;
              const mayBePluginObject =
                discoveryMethod === 'sitemap-only' && discoveredFrom === undefined;
              if (!discoverOnly || mayBePluginObject) {
                const profileContext = {
                  url: item.url,
                  isHomepage: isHomepageNavigation,
                  isOperatorSeed: item.discoveryMethod === 'seed',
                };
                try {
                  rawFacts = await extractRawPageAuditFacts(browserPage);
                } catch {
                  const emptyFacts: RawPageAuditFacts = {
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
                  rawFacts = emptyFacts;
                }
                if (!discoverOnly) auditProfile = buildPageAuditProfile(rawFacts, profileContext);
              }

              const pluginObject =
                rawFacts === undefined
                  ? undefined
                  : classifyNonPublicPluginObject({
                      discoveryMethod,
                      ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
                      bodyClassTokens: rawFacts.bodyClassTokens,
                    });
              if (pluginObject !== undefined) discoverOnly = true;

              recordFromIteration({
                url: item.url,
                depth: item.depth,
                status: discoverOnly ? 'discovered-not-scanned' : 'visited',
                discoveryMethod,
                ...(httpStatus !== undefined ? { httpStatus } : {}),
                ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
                ...(auditProfile !== undefined ? { auditProfile } : {}),
                ...(pluginObject !== undefined ? { pluginObject } : {}),
                ...(landedUrl !== item.url ? { servedUrl: landedUrl } : {}),
              });

              if (
                discoveryMethod !== 'sitemap-only' &&
                (item.depth < maxDepth || inventoryLedger !== undefined)
              ) {
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
                // Issue #497: a relative href resolves against the document's
                // base URL, which <base href> can move away from the page's
                // own URL; the browser (and checks/link-facts.ts, which reads
                // el.href) follows it, so discovery must too. Each href is made
                // absolute against document.baseURI first, and the landed URL
                // below still decides origin and redirect questions.
                const documentBase = await browserPage
                  .evaluate(() => document.baseURI)
                  .catch(() => browserPage.url());
                const againstBase = (href: string | null): string | null => {
                  if (href === null) return null;
                  try {
                    return new URL(href, documentBase).href;
                  } catch {
                    return href;
                  }
                };
                const hrefs = anchors.map((anchor) => againstBase(anchor.href));
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
                  const absoluteHref = againstBase(anchor.href)!;
                  const normalizedWithoutExclusion = normalizePageUrl(absoluteHref, landedUrl);
                  const normalized = normalizePageUrl(absoluteHref, landedUrl, {
                    exclusionPatterns: options.exclusions ?? [],
                  });
                  if (normalized === undefined) {
                    if (
                      inventoryLedger !== undefined &&
                      normalizedWithoutExclusion !== undefined &&
                      exclusionRegexes.some((pattern) => pattern.test(normalizedWithoutExclusion))
                    ) {
                      inventoryLedger.recordDiscovery({
                        url: normalizedWithoutExclusion,
                        source: 'link',
                        discoveredAt: new Date(),
                        referrer: item.url,
                        depth: item.depth + 1,
                        observedUrl: anchor.href,
                      });
                      disposeInventory(normalizedWithoutExclusion, 'operator-excluded', {
                        detail: 'matched an operator-supplied crawl exclusion',
                      });
                    }
                    continue;
                  }
                  const existing = anchorEvidenceByUrl.get(normalized);
                  anchorEvidenceByUrl.set(normalized, {
                    relNext: (existing?.relNext ?? false) || anchor.relNext,
                    isNumberedPaginationControl:
                      (existing?.isNumberedPaginationControl ?? false) ||
                      anchor.isNumberedPaginationControl,
                  });
                }
                const relativeNestingByUrl = new Map<
                  string,
                  ReturnType<typeof relativeLinkNestingEvidence>
                >();
                for (const anchor of anchors) {
                  if (anchor.href === null) continue;
                  const evidence = relativeLinkNestingEvidence(anchor.href, documentBase);
                  if (evidence === undefined) continue;
                  const normalized = normalizePageUrl(againstBase(anchor.href)!, landedUrl, {
                    exclusionPatterns: options.exclusions ?? [],
                  });
                  if (normalized !== undefined) relativeNestingByUrl.set(normalized, evidence);
                }
                const links = normalizeInternalLinks(hrefs, landedUrl, options.exclusions ?? []);
                const repeatedQueryKeysOnSourcePage = computeRepeatedQueryKeys(links);
                for (const link of links) {
                  linkDiscoveredUrls.add(link);
                  if (!linkDiscoveredFrom.has(link)) linkDiscoveredFrom.set(link, item.url);
                  ensureInventoryDiscovery(link, 'link', item.depth + 1, item.url);
                  const existingPage = pagesByUrl.get(link);
                  if (existingPage !== undefined) {
                    existingPage.discoveryMethod = 'link';
                    existingPage.discoveredFrom ??= item.url;
                  }
                  if (item.depth >= maxDepth && existingPage === undefined && !enqueued.has(link)) {
                    disposeInventory(link, 'depth-bound', {
                      detail: `discovered from depth ${item.depth}; maxDepth is ${maxDepth}`,
                    });
                    continue;
                  }
                  const nestingEvidence = relativeNestingByUrl.get(link);
                  if (
                    nestingEvidence !== undefined &&
                    existingPage === undefined &&
                    !enqueued.has(link)
                  ) {
                    relativeLinkNesting.omittedUrlCount += 1;
                    if (relativeLinkNesting.omittedExampleUrls.length < 20) {
                      relativeLinkNesting.omittedExampleUrls.push(nestingEvidence.resolvedUrl);
                    }
                    if (
                      !relativeLinkNesting.repeatedSegments.includes(
                        nestingEvidence.repeatedSegment,
                      )
                    ) {
                      relativeLinkNesting.repeatedSegments.push(nestingEvidence.repeatedSegment);
                    }
                    disposeInventory(link, 'relative-link-nesting', {
                      detail: `relative href ${nestingEvidence.href} repeated directory segment ${nestingEvidence.repeatedSegment}`,
                    });
                    continue;
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
                      if (existingPage === undefined && !enqueued.has(link)) {
                        disposeInventory(link, 'continuation-guard', {
                          detail: `continuation family ${classification.familyKey} reached its bound`,
                        });
                      }
                      continue;
                    }
                  }
                  if (enqueued.has(link)) continue;
                  enqueued.add(link);
                  enqueueFromIteration({
                    url: link,
                    depth: item.depth + 1,
                    discoveredFrom: item.url,
                    discoveryMethod: 'link',
                  });
                }

                // Plan 059 section 6: deterministic hreflang discovery from
                // the document head. A <link rel="alternate" hreflang> that
                // names an in-scope page is an explicit declaration of that
                // page even when no visible anchor links it, so it enters
                // the frontier with its own discovery provenance. Normalized
                // by the same admission policy as anchors (origin, non-HTML
                // extensions, operator exclusions); the continuation guard
                // does not apply, because a page's declared alternates are a
                // finite set the site itself controls.
                const hreflangTargets = await browserPage
                  .$$eval('link[rel="alternate"][hreflang]', (links) =>
                    links.map((link) => link.getAttribute('href')),
                  )
                  .catch(() => [] as (string | null)[]);
                const hreflangLinks = normalizeInternalLinks(
                  hreflangTargets.map(againstBase),
                  landedUrl,
                  options.exclusions ?? [],
                );
                for (const link of hreflangLinks) {
                  if (inventoryLedger !== undefined) {
                    inventoryLedger.recordDiscovery({
                      url: link,
                      source: 'hreflang',
                      discoveredAt: new Date(),
                      referrer: item.url,
                      depth: item.depth + 1,
                    });
                  }
                  if (enqueued.has(link) || pagesByUrl.has(link)) continue;
                  if (item.depth >= maxDepth) {
                    if (inventoryLedger !== undefined) {
                      const candidate = inventoryLedger.candidate(link);
                      if (candidate !== undefined && candidate.disposition === undefined) {
                        inventoryLedger.recordDisposition({
                          url: link,
                          disposition: 'depth-bound',
                          decidedAt: new Date(),
                          detail: `hreflang discovery from depth ${item.depth}; maxDepth is ${maxDepth}`,
                        });
                      }
                    }
                    continue;
                  }
                  enqueued.add(link);
                  enqueueFromIteration({
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
              recordFromIteration({
                url: item.url,
                depth: item.depth,
                status: 'skipped-external-redirect',
                discoveryMethod,
                ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
              });
            } else {
              if (abandoned) return;
              const message = error instanceof Error ? error.message : String(error);
              const refusalCode = connectionRefusalCode(message);
              if (refusalCode !== undefined) {
                consecutiveRefusals += 1;
                lastRefusalCode = refusalCode;
              } else {
                consecutiveRefusals = 0;
              }
              recordFromIteration({
                url: item.url,
                depth: item.depth,
                status: 'error',
                error: message,
                discoveryMethod,
                ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
              });
            }
          } finally {
            await browserPage.close().catch(() => undefined);
          }
          // Whole-iteration boundary: the page is fully recorded and its
          // links enqueued, so the structures are consistent for a snapshot.
          maybeSnapshotFrontier();
        };
        // The iteration may contain a load-timeout navigation followed by
        // one document-only retry. Budget both navigation windows, their
        // scheduler waits, and bounded document extraction under one outer
        // deadline so the watchdog does not preempt that recovery path.
        // A pending Retry-After window (capped at the backoff ceiling) holds
        // the next request start back on top of the delay (issue #490).
        const pacingBudgetMs =
          2 * Math.max(effectiveDelayMs, options.scheduler?.effectiveDelayMs ?? 0) +
          (options.scheduler?.retryAfterRemainingMs ?? 0);
        const crawlPageWatchdogMs = timeoutMs * 4 + pacingBudgetMs;
        try {
          await withPageWorkDeadline(
            `crawl page ${item.url}`,
            pageWork(),
            crawlPageWatchdogMs,
            crawlGuard,
          );
        } catch (error) {
          if (!(error instanceof PageWorkDeadlineError)) throw error;
          // Issue #499: one page that blocks its renderer is that page's
          // error, not the audit's. The deadline closed the crawl's context,
          // so the crawl continues on a fresh one, and the page is recorded
          // now, so a frontier snapshot never re-queues it on resume.
          abandoned = true;
          recordPage({
            url: item.url,
            depth: item.depth,
            status: 'error',
            error: error.message,
            discoveryMethod,
            ...(discoveredFrom !== undefined ? { discoveredFrom } : {}),
          });
          ({ context, crawlGuard } = await openCrawlContext());
          maybeSnapshotFrontier();
        }
        if (consecutiveRefusals >= HOST_REFUSAL_STOP_THRESHOLD && lastRefusalCode !== undefined) {
          hostStoppedAnswering = {
            answeredNavigationCount,
            refusedNavigationCount: consecutiveRefusals,
            errorCode: lastRefusalCode,
          };
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
    await crawlGuard.closeAll();
  }

  if (inventoryLedger !== undefined && queue.length > 0) {
    for (const item of queue) {
      ensureInventoryDiscovery(item.url, item.discoveryMethod, item.depth, item.discoveredFrom);
      if (inventoryLedger.candidate(item.url)?.disposition !== undefined) continue;
      if (!isAllowedByRobots(robotsRules, robotsTarget(item.url))) {
        disposeInventory(item.url, 'robots');
      } else if (hostStoppedAnswering !== undefined) {
        disposeInventory(item.url, 'blocked', {
          detail: `not requested: the host stopped answering (${hostStoppedAnswering.errorCode})`,
        });
      } else {
        disposeInventory(item.url, 'page-cap', {
          detail: `crawl stopped after reaching maxPages=${maxPages}`,
        });
      }
    }
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
  const mentionsLegalesCandidateUrls = findMentionsLegalesUrls(resolvedUrls);
  const mentionsLegalesPageUrl =
    mentionsLegalesCandidateUrls[0] ?? findMentionsLegalesUrl(resolvedUrls) ?? undefined;

  const disallowMatchCounts = new Map<string, number>();
  for (const page of pages) {
    if (page.discoveryMethod !== 'link') continue;
    const blockingPattern = findBlockingPattern(robotsRules, robotsTarget(page.url));
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
          // A sitemap URL that redirects within the site is reached through
          // its target: the crawl records the redirect and scans the page it
          // lands on, so counting only the spelling the sitemap used would
          // report every redirecting entry as missed.
          scannedPageCount: [...eligibleSitemapUrls].filter((url) => {
            const page = pagesByUrl.get(url);
            if (page?.status === 'visited') return true;
            return (
              page?.status === 'redirect-interstitial' &&
              page.redirectTargetUrl !== undefined &&
              pagesByUrl.get(page.redirectTargetUrl)?.status === 'visited'
            );
          }).length,
          settledUnscannedPageCount: [...eligibleSitemapUrls].filter((url) => {
            const page = pagesByUrl.get(url);
            return (
              page?.status === 'discovered-not-scanned' ||
              (page?.status === 'http-error-status' &&
                (page.httpStatus === 404 || page.httpStatus === 410))
            );
          }).length,
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
    startUrl: startUrlIdentity,
    ...(homepageUrlIdentity !== startUrlIdentity ? { homepageUrl: homepageUrlIdentity } : {}),
    pages,
    visitedCount: visited.size,
    maxPages,
    maxDepth,
    robotsTxtFound: robotsRules.found,
    ...(robotsPolicyChain.length > 0 ? { robotsPolicyChain } : {}),
    ...(inventoryLedger !== undefined ? { inventoryLedger: inventoryLedger.snapshot() } : {}),
    ...(startAnchors !== undefined ? { startAnchors } : {}),
    effectiveDelayMs,
    ...(mentionsLegalesPageUrl !== undefined ? { mentionsLegalesPageUrl } : {}),
    ...(mentionsLegalesCandidateUrls.length > 0 ? { mentionsLegalesCandidateUrls } : {}),
    mentionsLegalesSearchedUrls: resolvedUrls,
    robotsSitemapUrls: robotsRules.sitemapUrls,
    robotsDisallowMatches,
    aiCrawlerBlocks,
    linkDiscoveredUrls: [...linkDiscoveredUrls],
    ...(continuationGuardSummary.totalOmittedUrlCount > 0 ? { continuationGuardSummary } : {}),
    ...(sitemap !== undefined ? { sitemap } : {}),
    ...(sitemapCoverage !== undefined ? { sitemapCoverage } : {}),
    ...(eligibleSitemapUrls.size > 0 ? { sitemapUrls: [...eligibleSitemapUrls] } : {}),
    ...(relativeLinkNesting.omittedUrlCount > 0
      ? { relativeLinkNestingSummary: { ...relativeLinkNesting } }
      : {}),
    ...(hostStoppedAnswering !== undefined ? { hostStoppedAnswering } : {}),
  };
}
