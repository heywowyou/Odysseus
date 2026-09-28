/**
 * C1 (2026-08-24): cookies and third-party trackers active before the
 * visitor has consented to anything.
 *
 * This is the one obligation in the whole product whose scope is not
 * disputed. CLAUDE.md rule 6 exists because accessibility scope depends
 * on company size and sector and the case law is split; cookie rules do
 * not have that problem. The CNIL publishes its sanctions, they are
 * frequent, and they apply to any site setting a non-essential cookie
 * before consent regardless of how small the company is. For the French
 * SMB this product sells to, it is both more actionable and more
 * verifiable than the EAA reading.
 *
 * Site-level, one load, attributed to the homepage - the same shape as
 * checks/security-headers.ts and checks/sitemap.ts. Consent state is a
 * property of the visitor's first arrival on the site, not of any one
 * page, and a per-page repeat would spend the politeness budget
 * re-learning the same answer.
 *
 * "Before consent" is operationalised as: a brand-new browser context
 * with no stored state, one navigation, and no interaction of any kind.
 * Nothing is clicked, so nothing can be construed as consent. That is
 * exactly the state a first-time visitor is in while the banner is still
 * on screen.
 *
 * Detection only, per rule 1. This records which cookies and which
 * third-party origins were active, and whether a consent mechanism was
 * present at all. It does not decide whether a given site is in breach -
 * a cookie's purpose can depend on how the site uses it, and the
 * classification tables (cookie names in core's classify-cookie.ts, tracker
 * hosts below) are matched on names and hosts that are documented and
 * unambiguous, never guessed.
 */

import { classifyCookie } from '@odysseus/core';
import type { Browser } from 'playwright';
import { AUDIT_BROWSER_LOCALE } from '../audit-locale.js';
import { getCrawlerUserAgent, getRenderSettleTimeoutMs } from '../config.js';
import type { PageWorkGuard } from '../page-work-guard.js';
import {
  installBrowserNetworkSafety,
  type NetworkSafetyBlockHandler,
} from '../browser-network-safety.js';
import type { NetworkTargetPolicy } from '../network-target-policy.js';

/** Hosts whose only purpose is measurement, advertising or social
 *  tracking. A request to one of these before consent transmits the
 *  visitor's IP address and referring page to that vendor whether or not
 *  a cookie is set, which is the part a consent rule actually governs.
 *
 *  Matched on the registrable suffix, so a subdomain
 *  (`stats.g.doubleclick.net`) matches its parent. YouTube is
 *  deliberately absent: youtube.com is a content host, and the
 *  distinction that matters (youtube.com versus youtube-nocookie.com)
 *  is recorded separately below rather than treated as a tracker host. */
const TRACKER_HOSTS: readonly { host: string; vendor: string }[] = [
  { host: 'google-analytics.com', vendor: 'Google Analytics' },
  { host: 'analytics.google.com', vendor: 'Google Analytics' },
  { host: 'googletagmanager.com', vendor: 'Google Tag Manager' },
  { host: 'doubleclick.net', vendor: 'Google DoubleClick' },
  { host: 'googleadservices.com', vendor: 'Google Ads' },
  { host: 'googlesyndication.com', vendor: 'Google Ads' },
  { host: 'connect.facebook.net', vendor: 'Meta Pixel' },
  { host: 'facebook.com/tr', vendor: 'Meta Pixel' },
  { host: 'hotjar.com', vendor: 'Hotjar' },
  { host: 'hotjar.io', vendor: 'Hotjar' },
  { host: 'clarity.ms', vendor: 'Microsoft Clarity' },
  { host: 'bat.bing.com', vendor: 'Microsoft UET' },
  { host: 'ads.linkedin.com', vendor: 'LinkedIn Ads' },
  { host: 'snap.licdn.com', vendor: 'LinkedIn Insight' },
  { host: 'analytics.tiktok.com', vendor: 'TikTok' },
  { host: 'ct.pinterest.com', vendor: 'Pinterest' },
  { host: 'static.ads-twitter.com', vendor: 'X (Twitter) Ads' },
  { host: 'cdn.segment.com', vendor: 'Segment' },
  { host: 'api.mixpanel.com', vendor: 'Mixpanel' },
  { host: 'api.amplitude.com', vendor: 'Amplitude' },
  { host: 'js.hs-scripts.com', vendor: 'HubSpot' },
  { host: 'script.crazyegg.com', vendor: 'Crazy Egg' },
];

/** Markers published by the consent platforms themselves - a global the
 *  vendor's own script defines, or a container element its own
 *  documentation names. Presence means a consent mechanism exists, which
 *  is context for the reader; it is never taken as proof that the
 *  mechanism actually gates anything, since this check can see that
 *  directly from the cookies. */
const CMP_MARKERS: readonly { name: string; global?: string; selector?: string }[] = [
  { name: 'Tarteaucitron', global: 'tarteaucitron', selector: '#tarteaucitronRoot' },
  { name: 'Axeptio', global: 'axeptioSettings', selector: '#axeptio_overlay' },
  { name: 'Didomi', global: 'Didomi', selector: '#didomi-host' },
  { name: 'OneTrust', global: 'OneTrust', selector: '#onetrust-consent-sdk' },
  { name: 'Cookiebot', global: 'Cookiebot', selector: '#CybotCookiebotDialog' },
  { name: 'Osano', global: 'Osano', selector: '.osano-cm-window' },
  { name: 'Complianz', selector: '#cmplz-cookiebanner-container' },
  { name: 'CookieYes', global: 'cookieyes', selector: '#cookie-law-info-bar' },
  { name: 'Klaro', global: 'klaro', selector: '#klaro' },
  { name: 'Quantcast', global: '__tcfapi', selector: '.qc-cmp2-container' },
  { name: 'Sirdata', global: 'Sddan', selector: '#sd-cmp' },
  { name: 'Cookie Script', global: 'CookieScript', selector: '#cookiescript_injected' },
];

/** The container selectors of the consent platforms above, for checks that
 *  must recognise an open consent banner without judging it. */
export const CONSENT_BANNER_SELECTORS: readonly string[] = CMP_MARKERS.flatMap((marker) =>
  marker.selector === undefined ? [] : [marker.selector],
);

export interface ObservedCookie {
  name: string;
  domain: string;
  /** The vendor core's classifyCookie matched, when it matched. The
   *  normalizer re-classifies, so this is a scan-time convenience only. */
  vendor?: string;
  /** True when the cookie's domain is not a suffix of the audited site's
   *  own registrable domain - a third-party cookie. */
  isThirdParty: boolean;
}

export interface ObservedTrackerRequest {
  host: string;
  vendor: string;
}

/** C5 (2026-08-24): every distinct third-party origin the page contacted
 *  on first load, tracker or not. A font host, a map, a booking widget
 *  and a CDN are all recipients of the visitor's IP address and referring
 *  page, and a client's DPO needs the list, not just the subset this
 *  audit recognises as advertising. Recorded flat, with no judgment
 *  attached: naming a host is a fact, deciding whether a given transfer
 *  is lawful is not something a scanner can do. */
export interface ObservedThirdPartyOrigin {
  origin: string;
  requestCount: number;
}

export interface CookieConsentCheckResult {
  checked: boolean;
  /** Every cookie present after one navigation with no interaction. */
  cookies: ObservedCookie[];
  /** The subset of `cookies` core's classifyCookie matched. */
  nonEssentialCookies: ObservedCookie[];
  /** Distinct tracker hosts contacted before any interaction. */
  trackerRequests: ObservedTrackerRequest[];
  /** C5: every distinct third-party origin contacted, tracker or not. */
  thirdPartyOrigins: ObservedThirdPartyOrigin[];
  /** Names of consent platforms whose own published marker was found. */
  consentPlatforms: string[];
  /** True when a youtube.com embed was loaded where the privacy-enhanced
   *  youtube-nocookie.com host would have served the same video. */
  usesTrackingYouTubeEmbed: boolean;
  checkError?: string;
}

function emptyResult(): CookieConsentCheckResult {
  return {
    checked: false,
    cookies: [],
    nonEssentialCookies: [],
    trackerRequests: [],
    thirdPartyOrigins: [],
    consentPlatforms: [],
    usesTrackingYouTubeEmbed: false,
  };
}

/** Last two labels, which is right for the hosts this compares and wrong
 *  only for multi-part public suffixes (`.co.uk`). A false "third party"
 *  on `example.co.uk` versus `www.example.co.uk` would misreport, so the
 *  comparison below also accepts a plain suffix match, which covers that
 *  case without shipping a public-suffix list for one boolean. */
function registrableDomain(hostname: string): string {
  const labels = hostname.replace(/^\./u, '').toLowerCase().split('.');
  return labels.slice(-2).join('.');
}

function isSameSite(cookieDomain: string, siteHostname: string): boolean {
  const cookie = cookieDomain.replace(/^\./u, '').toLowerCase();
  const site = siteHostname.toLowerCase();
  if (site === cookie || site.endsWith(`.${cookie}`) || cookie.endsWith(`.${site}`)) return true;
  return registrableDomain(cookie) === registrableDomain(site);
}

export function classifyTrackerUrl(rawUrl: string): { host: string; vendor: string } | undefined {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return undefined;
  }
  const hostname = parsed.hostname.toLowerCase();
  const hostAndPath = `${hostname}${parsed.pathname}`;
  for (const entry of TRACKER_HOSTS) {
    const matchesHost = hostname === entry.host || hostname.endsWith(`.${entry.host}`);
    const matchesHostPath = entry.host.includes('/') && hostAndPath.startsWith(entry.host);
    if (matchesHost || matchesHostPath) return { host: hostname, vendor: entry.vendor };
  }
  return undefined;
}

export interface CookieConsentCheckOptions {
  timeoutMs: number;
  /** Best-effort wait for the network to fall idle after `load`, so late
   *  trackers are seen. Defaults to the render settle timeout. */
  settleTimeoutMs?: number;
  userAgent?: string;
  /** Issue #200: tracks this call's context so an external watchdog can
   *  force-close it if it never returns on its own. */
  guard?: PageWorkGuard;
  networkPolicy?: NetworkTargetPolicy;
  onNetworkSafetyBlocked?: NetworkSafetyBlockHandler;
}

export async function checkCookieConsent(
  browser: Browser,
  homepageUrl: string,
  options: CookieConsentCheckOptions,
): Promise<CookieConsentCheckResult> {
  // A brand-new context is the whole point: no storage state carries over
  // from the crawl's own passes, so nothing that happened earlier in this
  // audit can be mistaken for the visitor having consented.
  const context = await browser.newContext({
    userAgent: options.userAgent ?? getCrawlerUserAgent(),
    locale: AUDIT_BROWSER_LOCALE,
  });
  if (options.networkPolicy !== undefined) {
    await installBrowserNetworkSafety(
      context,
      options.networkPolicy,
      options.onNetworkSafetyBlocked,
    );
  }
  options.guard?.track(context);
  try {
    const trackerRequests = new Map<string, ObservedTrackerRequest>();
    const thirdPartyOrigins = new Map<string, number>();
    let usesTrackingYouTubeEmbed = false;
    const siteRegistrable = registrableDomain(new URL(homepageUrl).hostname);

    context.on('request', (request) => {
      const url = request.url();
      const tracker = classifyTrackerUrl(url);
      if (tracker && !trackerRequests.has(tracker.host)) trackerRequests.set(tracker.host, tracker);
      if (/(^|\.)youtube\.com$/u.test(safeHostname(url))) usesTrackingYouTubeEmbed = true;

      // C5. data: and blob: URLs have no host and transfer nothing;
      // anything on the site's own registrable domain is first-party.
      const hostname = safeHostname(url);
      if (hostname && registrableDomain(hostname) !== siteRegistrable) {
        const origin = new URL(url).origin;
        thirdPartyOrigins.set(origin, (thirdPartyOrigins.get(origin) ?? 0) + 1);
      }
    });

    const page = await context.newPage();
    // Issue #494: 'load', then a bounded best-effort idle wait, as the
    // rendered pass does (render-diff.ts). networkidle never arrives on
    // sites with a chat widget, analytics heartbeat or video, which are
    // exactly the sites most likely to set trackers; as a hard wait it lost
    // their consent evidence entirely.
    await page.goto(homepageUrl, { waitUntil: 'load', timeout: options.timeoutMs });
    try {
      await page.waitForLoadState('networkidle', {
        timeout: options.settleTimeoutMs ?? getRenderSettleTimeoutMs(),
      });
    } catch {
      // Deliberately swallowed: what loaded by now is the evidence.
    }

    const consentPlatforms = await page.evaluate(
      (markers) => {
        const found: string[] = [];
        for (const marker of markers) {
          const byGlobal =
            marker.global !== undefined &&
            marker.global in (window as unknown as Record<string, unknown>);
          const bySelector =
            marker.selector !== undefined && document.querySelector(marker.selector) !== null;
          if (byGlobal || bySelector) found.push(marker.name);
        }
        return found;
      },
      CMP_MARKERS as { name: string; global?: string; selector?: string }[],
    );

    const siteHostname = new URL(homepageUrl).hostname;
    const cookies: ObservedCookie[] = (await context.cookies()).map((cookie) => {
      const classification = classifyCookie({ name: cookie.name, domain: cookie.domain });
      return {
        name: cookie.name,
        domain: cookie.domain,
        isThirdParty: !isSameSite(cookie.domain, siteHostname),
        ...(classification !== undefined ? { vendor: classification.vendor } : {}),
      };
    });

    return {
      checked: true,
      cookies,
      nonEssentialCookies: cookies.filter((cookie) => cookie.vendor !== undefined),
      trackerRequests: [...trackerRequests.values()].sort((a, b) => a.host.localeCompare(b.host)),
      thirdPartyOrigins: [...thirdPartyOrigins.entries()]
        .map(([origin, requestCount]) => ({ origin, requestCount }))
        .sort((a, b) => a.origin.localeCompare(b.origin)),
      consentPlatforms,
      usesTrackingYouTubeEmbed,
    };
  } catch (error) {
    return { ...emptyResult(), checkError: error instanceof Error ? error.message : String(error) };
  } finally {
    options.guard?.untrack(context);
    await context.close();
  }
}

function safeHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}
