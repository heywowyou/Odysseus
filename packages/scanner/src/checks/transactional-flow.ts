/**
 * First-party transactional flow detection: the second, independent
 * input the obligation engine needs (see @odysseus/core's
 * assessObligations). Runs inside scan-page.ts's existing onRenderedPage
 * hook, on every page, using the already-rendered navigation - no third
 * page load, except for the redirect-following check below, which by
 * definition needs to load a different URL.
 *
 * The provider-domain allowlists below are a starting position, not a
 * measured result, the same status severityFromRenderDiff's thresholds
 * carry. Revisit once real-site scans surface providers missing here.
 *
 * Delegated booking-engine detection (haaitza.com bug, 2026-08-07): a
 * hotel's own "book now" button often redirects to a separate domain
 * (Availpro, D-EDGE, SiteMinder, Cloudbeds, Mews, and similar) that runs
 * a single-property booking flow on the operator's behalf. That is a
 * first-party transactional flow - the vendor ships the software, the
 * operator remains the service provider the guest experiences - and is
 * not the same thing as an outbound link to an OTA marketplace
 * (Booking.com, Expedia) where the guest picks among many unrelated
 * properties. Domain name alone cannot tell the two apart, so this
 * follows the link and inspects the destination page's own content
 * instead. See the milestone doc for the full reasoning; when the
 * destination is ambiguous either way, this resolves 'undetermined'
 * rather than guessing, per the same "prefer undetermined over a
 * confident wrong answer" principle used elsewhere in this codebase.
 */

import type { Browser, Page } from 'playwright';
import type { TransactionalFlowEvidence, TransactionalFlowRedirectCheck } from '@odysseus/core';
import { DEFAULT_TIMEOUT_MS } from '../browser.js';
import { getCrawlerUserAgent } from '../config.js';
import { isSocialPlatformHost } from '../social-hosts.js';

const CHECKOUT_FORM_SELECTOR =
  'form[action*="checkout"], form[action*="panier"], form[action*="cart"], [class*="add-to-cart"], [id*="add-to-cart"]';

const PAYMENT_SCRIPT_SUBSTRINGS = [
  'js.stripe.com',
  'checkout.stripe.com',
  'paypal.com/sdk',
  'paypalobjects.com',
];
const BOOKING_SCRIPT_SUBSTRINGS = ['simplebooking', 'resharmonics', 'thinkreservations'];

/** item 0.1 (La Corniche pass, confirmed live against lacoorniche.com): a
 *  same-origin JS booking widget (here, Diadao's "HSC" widget SDK) can
 *  reference its delegated booking engine's domain only inside an inline
 *  script/JSON config, with no crawlable script[src] or a[href] at all -
 *  the "Réserver" button was `href="javascript:void(0)"` until a date was
 *  picked. Checked against the page's full rendered HTML (inline scripts
 *  included), not just script[src], for exactly that reason. Same
 *  starting-position-not-measured-result caveat as BOOKING_SCRIPT_
 *  SUBSTRINGS above: the delegated engines named in this module's own
 *  doc comment (Availpro, D-EDGE, SiteMinder, Cloudbeds, Mews), plus the
 *  one domain actually observed (secure-hotel-booking.com, D-EDGE's
 *  booking domain). Revisit once more real-site scans surface others. */
const BOOKING_ENGINE_DOMAIN_SUBSTRINGS = [
  'secure-hotel-booking.com',
  'availpro.com',
  'siteminder.com',
  'cloudbeds.com',
  'mews.com',
];

/** item 0.1: a booking or reservation widget embedded directly as a
 *  third-party iframe is at least as strong a transactional-flow signal
 *  as an on-site script, and was previously never checked at all - no
 *  iframe detection existed anywhere in this file. Confirmed live against
 *  lacoorniche.com: its restaurant-table booking widget (TheFork/
 *  LaFourchette) is embedded this way inside a popup modal. Kept as its
 *  own list rather than reusing BOOKING_ENGINE_DOMAIN_SUBSTRINGS because a
 *  reservation iframe provider (a table-booking widget) is a distinct
 *  vendor family from a room/stay booking engine, even though both count
 *  as a transactional flow for obligation-scope purposes. */
const BOOKING_IFRAME_DOMAIN_SUBSTRINGS = [
  ...BOOKING_ENGINE_DOMAIN_SUBSTRINGS,
  'widget.thefork.com',
  'module.lafourchette.com',
];

const OUTBOUND_BOOKING_HOSTS = [
  /(^|\.)booking\.com$/i,
  /(^|\.)airbnb\.[a-z.]+$/i,
  /(^|\.)expedia\.[a-z.]+$/i,
];

/** Never followed regardless of link text, defense in depth alongside the
 *  \b word-boundary fix on BOOKING_INTENT_TEXT_PATTERN below (a live
 *  haaitza.com run without either safeguard matched "book" inside
 *  "Facebook" on a social icon present on every page, and repeatedly
 *  navigating a real browser context to a large, script-heavy, third-
 *  party page dozens of times over one crawl ran the process out of heap
 *  after 17 minutes). These platforms are never booking engines, so
 *  excluding them costs nothing and bounds a whole class of false
 *  positive, not just this one word. isSocialPlatformHost is the shared
 *  list, see social-hosts.ts. */

/** Link text/aria-label/class hinting the link leads to a booking or
 *  reservation flow, in French or English. Deliberately not a provider
 *  domain list - see module doc comment - this only decides which
 *  outbound links are worth following at all.
 *
 * \b around "book" is load-bearing, not cosmetic: a live haaitza.com run
 * without it matched "book" inside "Facebook" on a social-icon link found
 * on every crawled page, so the crawl kept navigating to a live,
 * dynamically-loading third-party page dozens of times and ran the Node
 * process out of heap after 17 minutes. Confirmed by reproducing the
 * match against real page text before and after adding the boundary. */
/** Exported for the prescan's page-role selection (plan 004), which needs
 *  the same booking vocabulary to pick a same-site booking page as this
 *  file uses to spot an off-site one. Exported rather than copied: two
 *  drifting definitions of "this link starts a booking" would make the
 *  page a prescan measures and the funnel a full audit reports disagree. */
export const BOOKING_INTENT_TEXT_PATTERN =
  /r[ée]serv|\bbook(ing)?\b|\bcheck-?in\b|disponibilit|availab/i;

/** Signals a destination page is a marketplace/aggregator rather than one
 *  operator's own booking engine: a multi-property or multi-destination
 *  picker. French and English phrasing that OTAs and multi-property
 *  booking engines commonly use. */
const MULTI_PROPERTY_SIGNAL_PATTERN =
  /choisir (un|votre) h[ôo]tel|choose (a|your) (hotel|property|destination)|s[ée]lectionner une (ville|destination)|select a (city|destination)|nos [ée]tablissements|our (hotels|properties)|search (hotels|destinations)|compare (thousands of )?hotels/i;

/** Generic hospitality words common to nearly any hotel site, excluded so
 *  a shared "hotel" or "reservation" alone can't produce a false
 *  single-property name match between two unrelated sites. */
const COMMON_HOSPITALITY_WORDS = new Set([
  'hotel',
  'hôtel',
  'reservation',
  'réservation',
  'reserver',
  'réserver',
  'accueil',
  'welcome',
  'home',
  'official',
  'book',
  'booking',
  'contact',
  'chambres',
  'rooms',
]);

const MAX_REDIRECT_FOLLOWS = 3;

/** Pure candidate-selection for the two evidence kinds added in item 0.1,
 *  kept separate from the Playwright $$eval calls so they are
 *  unit-testable without a browser, same pattern findBookingIntentLinks
 *  already established. */
export function findBookingEngineDomainReferences(inlineScriptTexts: readonly string[]): string[] {
  const matched = new Set<string>();
  for (const text of inlineScriptTexts) {
    for (const domain of BOOKING_ENGINE_DOMAIN_SUBSTRINGS) {
      if (text.includes(domain)) matched.add(domain);
    }
  }
  return [...matched];
}

export interface BookingIframeMatch {
  src: string;
  domain: string;
}

export function findBookingIframes(iframeSrcs: readonly string[]): BookingIframeMatch[] {
  const matches: BookingIframeMatch[] = [];
  for (const src of iframeSrcs) {
    const domain = BOOKING_IFRAME_DOMAIN_SUBSTRINGS.find((candidate) => src.includes(candidate));
    if (domain) matches.push({ src, domain });
  }
  return matches;
}

export async function detectTransactionalFlow(
  page: Page,
  pageUrl: string,
): Promise<TransactionalFlowEvidence[]> {
  const evidence: TransactionalFlowEvidence[] = [];

  const formMatches = await page.$$eval(CHECKOUT_FORM_SELECTOR, (elements) =>
    elements.map((el, index) => ({
      selector: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}:nth-of-type(${index + 1})`,
      detail: el.getAttribute('action') ?? el.outerHTML.slice(0, 120),
    })),
  );
  for (const match of formMatches) {
    evidence.push({
      kind: 'checkout-form',
      selector: match.selector,
      pageUrl,
      detail: match.detail,
    });
  }

  const scriptSrcs = await page.$$eval('script[src]', (elements) =>
    elements.map((el) => el.getAttribute('src') ?? ''),
  );
  for (const src of scriptSrcs) {
    if (PAYMENT_SCRIPT_SUBSTRINGS.some((substring) => src.includes(substring))) {
      evidence.push({
        kind: 'payment-embed',
        selector: 'script[src]',
        pageUrl,
        detail: src,
      });
    } else if (BOOKING_SCRIPT_SUBSTRINGS.some((substring) => src.includes(substring))) {
      evidence.push({
        kind: 'booking-engine-script',
        selector: 'script[src]',
        pageUrl,
        detail: src,
      });
    }
  }

  // item 0.1: catches a delegated booking engine's domain referenced only
  // inside an inline script/JSON config (see BOOKING_ENGINE_DOMAIN_
  // SUBSTRINGS above for why script[src] alone misses this). Scans inline
  // script contents specifically, not the whole page HTML, so an unrelated
  // mention of a provider name in visible marketing copy or a blog post
  // can't produce a false positive.
  const inlineScriptTexts = await page.$$eval('script:not([src])', (elements) =>
    elements.map((el) => el.textContent ?? ''),
  );
  for (const domain of findBookingEngineDomainReferences(inlineScriptTexts)) {
    evidence.push({
      kind: 'booking-engine-domain-reference',
      selector: 'script:not([src])',
      pageUrl,
      detail: `Inline script references delegated booking engine domain ${domain}`,
      providerUrl: `https://${domain}`,
    });
  }

  // item 0.1: a booking/reservation widget embedded directly as a
  // third-party iframe, never checked before this fix (see
  // BOOKING_IFRAME_DOMAIN_SUBSTRINGS above).
  const iframeSrcs = await page.$$eval('iframe[src]', (elements) =>
    elements.map((el) => el.getAttribute('src') ?? ''),
  );
  for (const { src, domain } of findBookingIframes(iframeSrcs)) {
    evidence.push({
      kind: 'booking-iframe',
      selector: 'iframe[src]',
      pageUrl,
      detail: `Booking/reservation widget embedded as an iframe from ${domain}`,
      providerUrl: src,
    });
  }

  return evidence;
}

/** Confirms the negative case only: an outbound-only link to a
 *  third-party booking platform never sets hasTransactionalFlow, however
 *  many of these are found. Used by tests and by
 *  findDelegatedBookingRedirectChecks (as the fast, no-page-load
 *  negative for known OTA marketplace hosts), never to set anything
 *  true. */
export function detectOutboundBookingLinks(hrefs: readonly string[]): string[] {
  return hrefs.filter((href) => {
    try {
      const host = new URL(href).hostname;
      return OUTBOUND_BOOKING_HOSTS.some((pattern) => pattern.test(host));
    } catch {
      return false;
    }
  });
}

export interface AnchorLike {
  href: string;
  text: string;
}

/** Pure candidate-selection: external links whose visible text, aria
 *  label, or class hints at a booking flow. Kept separate from the
 *  Playwright $$eval call so it is unit-testable without a browser. */
export function findBookingIntentLinks(pageUrl: string, anchors: readonly AnchorLike[]): string[] {
  // Compared by full origin (host + port), not bare hostname: a booking
  // engine is almost always a genuinely different domain in production,
  // but comparing the fuller origin is strictly more correct and is what
  // lets this be exercised against two same-host, different-port local
  // fixture servers in tests without a false "first-party" exclusion.
  const pageOrigin = new URL(pageUrl).origin;
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const anchor of anchors) {
    if (!BOOKING_INTENT_TEXT_PATTERN.test(anchor.text)) continue;
    let resolved: URL;
    try {
      resolved = new URL(anchor.href, pageUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(resolved.protocol)) continue;
    if (resolved.origin === pageOrigin) continue;
    if (isSocialPlatformHost(resolved.hostname)) continue;
    if (seen.has(resolved.href)) continue;
    seen.add(resolved.href);
    candidates.push(resolved.href);
  }

  return candidates;
}

function significantWords(text: string): string[] {
  return text
    .split(/[^\p{L}]+/u)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= 4 && !COMMON_HOSPITALITY_WORDS.has(word));
}

/** Pure destination-page classification: does the content on the other
 *  side of the redirect represent the operator's own scoped inventory
 *  (single-property), a marketplace/aggregator (multi-property), or
 *  neither confidently (undetermined). originName is whatever
 *  identifying text the origin page offered (title + h1) - the closest
 *  proxy available at crawl time to the operator's real denomination,
 *  which is not resolved until the later Sirene lookup. */
export function classifyDestinationPage(
  originName: string,
  destinationTitle: string,
  destinationBodyText: string,
): {
  resolution: 'single-property' | 'marketplace' | 'undetermined';
  detail: string;
} {
  const combinedDestinationText = `${destinationTitle}\n${destinationBodyText}`;
  const hasMultiPropertySignal = MULTI_PROPERTY_SIGNAL_PATTERN.test(combinedDestinationText);

  const originWords = new Set(significantWords(originName));
  const destinationWords = new Set(significantWords(combinedDestinationText));
  const sharedDistinctiveWord = [...originWords].find((word) => destinationWords.has(word));

  if (sharedDistinctiveWord && !hasMultiPropertySignal) {
    return {
      resolution: 'single-property',
      detail: `Destination page shares the distinctive term "${sharedDistinctiveWord}" with the origin page and shows no multi-property search UI.`,
    };
  }

  if (hasMultiPropertySignal) {
    return {
      resolution: 'marketplace',
      detail: 'Destination page shows a multi-property or multi-destination search UI.',
    };
  }

  return {
    resolution: 'undetermined',
    detail:
      "Destination page matches neither the origin page's own identifying text nor a multi-property search UI.",
  };
}

async function inspectDestinationPage(
  browser: Browser,
  linkUrl: string,
  originName: string,
  timeoutMs: number,
  userAgent: string,
): Promise<Omit<TransactionalFlowRedirectCheck, 'pageUrl'>> {
  const context = await browser.newContext({ userAgent });
  try {
    context.setDefaultTimeout(timeoutMs);
    context.setDefaultNavigationTimeout(timeoutMs);
    const destinationPage = await context.newPage();
    await destinationPage.goto(linkUrl, { waitUntil: 'load' });
    const destinationUrl = destinationPage.url();
    const destinationTitle = await destinationPage.title();
    const destinationBodyText = await destinationPage.evaluate(() => document.body.innerText);

    const { resolution, detail } = classifyDestinationPage(
      originName,
      destinationTitle,
      destinationBodyText,
    );
    return { linkUrl, destinationUrl, resolution, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      linkUrl,
      resolution: 'undetermined',
      detail: `Redirect could not be followed: ${message}`,
    };
  } finally {
    await context.close();
  }
}

/**
 * Shared across every page of one scanSite() run (see scan-site.ts),
 * keyed by hostname rather than exact URL. A real hotel site put its
 * booking CTA in the nav on every page, so without this a 20-page crawl
 * cost 20 navigations to the one third-party booking engine - impolite,
 * and the plausible cause of that vendor rate-limiting or bot-blocking
 * us during the haaitza.com live verification (2026-08-08). Storing the
 * promise itself, not just the resolved value, means concurrent scan
 * lanes racing to check the same host share one in-flight navigation
 * instead of both starting one.
 */
export type RedirectHostCache = Map<
  string,
  Promise<Omit<TransactionalFlowRedirectCheck, 'pageUrl'>>
>;

export interface DelegatedBookingRedirectOptions {
  browser: Browser;
  timeoutMs?: number;
  userAgent?: string;
  /** Defaults to a fresh, call-scoped Map when omitted, so a direct call
   *  (tests, or any future standalone use) still dedupes within its own
   *  candidate list without requiring a caller to wire one up. scanSite()
   *  passes one shared cache through every page's scanPage() call. */
  hostCache?: RedirectHostCache;
  /** Manual-input-layer milestone: a known off-domain booking destination
   *  the operator has already confirmed. A followed redirect landing on
   *  this origin short-circuits straight to 'single-property' instead of
   *  re-guessing from the destination page's content - a confirmed fact
   *  should not be re-guessed, same spirit as SiteSignalOverride. */
  bookingEngineUrl?: string;
}

/**
 * Follows every outbound booking-intent link found on the page (up to
 * MAX_REDIRECT_FOLLOWS) and classifies each destination. Known OTA
 * marketplace hosts are recorded as 'marketplace' without being followed
 * at all, the same confirmed-negative fast path
 * detectOutboundBookingLinks already established. Every check is
 * returned regardless of outcome, per the milestone rule that whatever
 * the detector concludes must be visible in siteSignals, not only
 * recoverable by revisiting the site by hand.
 */
export async function findDelegatedBookingRedirectChecks(
  page: Page,
  pageUrl: string,
  options: DelegatedBookingRedirectOptions,
): Promise<TransactionalFlowRedirectCheck[]> {
  const anchors = await page.$$eval('a[href]', (elements) =>
    elements.map((el) => ({
      href: el.getAttribute('href') ?? '',
      text: `${el.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.className ?? ''}`,
    })),
  );

  const candidates = findBookingIntentLinks(pageUrl, anchors).slice(0, MAX_REDIRECT_FOLLOWS);
  if (candidates.length === 0) return [];

  const originTitle = await page.title().catch(() => '');
  const originHeading = await page.$eval('h1', (el) => el.textContent ?? '').catch(() => '');
  const originName = `${originTitle} ${originHeading}`.trim();

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = options.userAgent ?? getCrawlerUserAgent();
  const hostCache: RedirectHostCache = options.hostCache ?? new Map();
  const bookingEngineHost = (() => {
    if (!options.bookingEngineUrl) return undefined;
    try {
      return new URL(options.bookingEngineUrl).host;
    } catch {
      return undefined;
    }
  })();

  const checks: TransactionalFlowRedirectCheck[] = [];
  for (const linkUrl of candidates) {
    const resolvedLink = new URL(linkUrl);
    const hostname = resolvedLink.hostname;
    // Cache key includes the port (`.host`, not `.hostname`): real
    // booking-engine domains never differ by port, so this changes
    // nothing in production, but it avoids the two-different-vendors
    // colliding into one cache entry when tests run several fixture
    // servers on the same 127.0.0.1 with different ports.
    const cacheKey = resolvedLink.host;

    let resultPromise = hostCache.get(cacheKey);
    if (!resultPromise) {
      // Set before awaiting: a concurrent lane checking the same host
      // between this line and the await below must see this promise
      // already in the map, not start a second navigation.
      resultPromise = OUTBOUND_BOOKING_HOSTS.some((pattern) => pattern.test(hostname))
        ? Promise.resolve({
            linkUrl,
            resolution: 'marketplace' as const,
            detail: `${hostname} is a known third-party booking marketplace; not followed.`,
          })
        : cacheKey === bookingEngineHost
          ? Promise.resolve({
              linkUrl,
              resolution: 'single-property' as const,
              destinationUrl: linkUrl,
              detail: 'operator-supplied booking engine URL',
            })
          : inspectDestinationPage(options.browser, linkUrl, originName, timeoutMs, userAgent);
      hostCache.set(cacheKey, resultPromise);
    }

    const result = await resultPromise;
    // linkUrl is always overridden to the link actually found on this
    // page, even when the check itself was reused from cache -
    // destinationUrl/detail still describe whichever link first
    // triggered the check for this host within the audit, not
    // necessarily this exact URL (e.g. a different room ID or date on a
    // later page); that tradeoff is the whole point of the cache.
    checks.push({ ...result, linkUrl, pageUrl });
  }

  return checks;
}
