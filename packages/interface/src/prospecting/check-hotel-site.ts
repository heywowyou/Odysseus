/**
 * Plan 003's cheap stage: everything a bounded, no-browser look at a hotel's
 * own website can establish, and nothing more.
 *
 * The politeness shape is copied deliberately from mentions-legales-fetch.ts
 * rather than reinvented: one per-origin lock held for the whole visit,
 * robots.txt fetched once and honoured per path, the declared Crawl-delay
 * raising the floor on the configured delay, and a sleep before every request
 * including the second one. Non-negotiable rule 5 governs this stage exactly
 * as it governs a full audit crawl, and this pipeline points it at thousands
 * of unsolicited sites, which makes the politeness more load bearing here than
 * anywhere else in the tool, not less.
 *
 * The request budget is two: the homepage, and the mentions-legales page when
 * the homepage links to one. That second request is what recovers the SIREN
 * neither Atout France nor DATAtourisme carries - plan 002 built the exact
 * identity keys and the Sirene join, and this is the only place an identifier
 * to use them with ever arrives.
 *
 * What this deliberately does not do is judge. It reports what it saw; the
 * decision about what that means is core's qualifyHotelCandidate, which is
 * pure and testable without a network for exactly that reason.
 */

import type { OriginLock } from '@odysseus/scanner';
import {
  extractMentionsLegales,
  fetchRobotsRules,
  findAccessibilityStatementUrl,
  findMentionsLegalesUrl,
  isAllowedByRobots,
} from '@odysseus/scanner';
import type { HotelBookingVendorFact, HotelSiteFacts } from '@odysseus/core';
import {
  findHotelVendorHost,
  matchParkedPageSignature,
  normalizeDeclaredWebsite,
} from '@odysseus/core';
import { extractAnchorHrefs, htmlToText } from './fetch-candidate-page.js';
import { probeUrl, type ProbeFailure } from './probe-url.js';
import { sleep } from './sleep.js';

export interface CheckHotelSiteOptions {
  crawlDelayMs: number;
  userAgent: string;
  timeoutMs: number;
}

/** Path fragments that mean "book a room here" on a real French or English
 *  hotel site. Narrow on purpose, in the spirit of accessibility-statement.ts's
 *  own note about /chambres-accessibles/: 'offre' and 'tarif' describe prices
 *  on almost every hotel site without being a booking route, and matching them
 *  would report a reservation path for a brochure site. */
const RESERVATION_PATTERN =
  /reserv(?:er|ation|ez)|booking|book-now|book-online|disponibilit|chambres-libres/iu;

/** The probe's failure vocabulary maps one-to-one onto the reachability the
 *  decision reads. Written as a total map rather than a cast so a new probe
 *  failure cannot reach the decision unclassified. */
const REACHABILITY_FOR_FAILURE: Readonly<Record<ProbeFailure, HotelSiteFacts['reachability']>> = {
  'dns-unresolved': 'dns-unresolved',
  'tls-invalid': 'tls-invalid',
  'redirect-loop': 'redirect-loop',
  'redirect-offsite': 'redirect-offsite',
  'http-error': 'http-error',
  'non-html-response': 'non-html-response',
  timeout: 'timeout',
};

/** Atout France publishes scheme-less websites, and the campaign's own domain
 *  is a registrable domain rather than a URL. Both become an https homepage
 *  here; a site still serving only http fails the probe as unreachable and is
 *  recorded as such, which is the honest result in 2026. */
function homepageUrlFor(domain: string): string {
  const trimmed = domain.trim().replace(/\/+$/u, '');
  if (/^https?:\/\//iu.test(trimmed)) return trimmed;
  return `https://${trimmed}/`;
}

function registrableDomainOf(url: string): string | null {
  const resolution = normalizeDeclaredWebsite(url);
  return resolution.kind === 'unusable' ? null : resolution.registrableDomain;
}

/** Off-domain booking destinations, deduplicated. Only curated booking vendors
 *  count: an off-domain link to a payment processor or a tourist office is not
 *  a booking funnel, and treating every external link as one would make the
 *  fact meaningless.
 *
 *  Both kinds are collected, but they mean opposite things and
 *  findBookingEngineUrl below is what keeps them apart. An online travel agency
 *  is somebody else's funnel: the hotel pays commission and does not own the
 *  guest. A booking engine is the hotel's *own* funnel, merely hosted by a
 *  vendor - Reservit, Availpro and their peers are what a French independent
 *  hotel sells direct *with*. Measured on the first live batch, conflating them
 *  reported eight of ten qualified hotels as having no direct booking route
 *  when most of them plainly did. */
function collectBookingVendors(
  anchorUrls: readonly string[],
  ownRegistrableDomain: string | null,
): HotelBookingVendorFact[] {
  const byDomain = new Map<string, HotelBookingVendorFact>();
  for (const url of anchorUrls) {
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    const registrableDomain = registrableDomainOf(url);
    if (registrableDomain === null) continue;
    if (registrableDomain === ownRegistrableDomain) continue;
    const vendor = findHotelVendorHost(registrableDomain);
    if (vendor?.kind !== 'online-travel-agency' && vendor?.kind !== 'booking-engine') continue;
    if (!byDomain.has(registrableDomain))
      byDomain.set(registrableDomain, { hostname, registrableDomain });
  }
  return [...byDomain.values()];
}

/** The hotel's own booking funnel, hosted by a vendor. Counts as a reservation
 *  path: to the guest it is the "book now" button, and to the campaign it is a
 *  hotel that sells direct. */
function findBookingEngineUrl(
  anchorUrls: readonly string[],
  ownRegistrableDomain: string | null,
): string | null {
  for (const url of anchorUrls) {
    const registrableDomain = registrableDomainOf(url);
    if (registrableDomain === null || registrableDomain === ownRegistrableDomain) continue;
    if (findHotelVendorHost(registrableDomain)?.kind === 'booking-engine') return url;
  }
  return null;
}

function findReservationUrl(sameOriginUrls: readonly string[]): string | null {
  for (const url of sameOriginUrls) {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      continue;
    }
    if (RESERVATION_PATTERN.test(pathname)) return url;
  }
  return null;
}

export async function checkHotelSite(
  domain: string,
  originLock: OriginLock,
  options: CheckHotelSiteOptions,
): Promise<HotelSiteFacts> {
  const homepageUrl = homepageUrlFor(domain);
  const ownRegistrableDomain = registrableDomainOf(homepageUrl);
  const origin = new URL(homepageUrl).origin;
  const release = await originLock.acquire(origin);

  try {
    const robotsRules = await fetchRobotsRules(origin, options.userAgent, options.timeoutMs);
    const effectiveDelayMs = Math.max(options.crawlDelayMs, robotsRules.crawlDelayMs ?? 0);

    if (!isAllowedByRobots(robotsRules, new URL(homepageUrl).pathname)) {
      return { reachability: 'robots-denied', finalUrl: homepageUrl };
    }

    await sleep(effectiveDelayMs);
    const homepage = await probeUrl(homepageUrl, {
      timeoutMs: options.timeoutMs,
      userAgent: options.userAgent,
      // A redirect that lands on a different registrable domain is the hotel's
      // web presence having moved elsewhere, which is a fact about the
      // candidate, not a transport detail.
      sameSite: (candidateUrl) =>
        ownRegistrableDomain !== null && registrableDomainOf(candidateUrl) === ownRegistrableDomain,
    });

    if (homepage.kind === 'failed') {
      // Where the redirect landed is recorded; what it means is not decided
      // here. A probe sees one hotel and cannot tell `accor.com` from
      // `lacoorniche.com` - only a count across the whole run can, which is
      // what reconcile-redirects.ts does with this finalUrl. An earlier
      // same-name heuristic tried to decide it per candidate and got the
      // measured majority wrong.
      const facts: HotelSiteFacts = { reachability: REACHABILITY_FOR_FAILURE[homepage.failure] };
      if (homepage.finalUrl !== undefined) facts.finalUrl = homepage.finalUrl;
      return facts;
    }

    const visibleText = htmlToText(homepage.html);
    const parkedAttribution = matchParkedPageSignature(visibleText);
    const sameOriginUrls = extractAnchorHrefs(homepage.html, homepage.finalUrl);
    const allUrls = extractAnchorHrefs(homepage.html, homepage.finalUrl, {
      includeOffOrigin: true,
    });

    const facts: HotelSiteFacts = {
      finalUrl: homepage.finalUrl,
      reachability: 'ok',
      parkedPage: parkedAttribution !== null,
      // Same-origin first: a hotel's own /reserver page is the least ambiguous
      // evidence. A vendor booking engine is the same fact one step removed.
      reservationUrl:
        findReservationUrl(sameOriginUrls) ?? findBookingEngineUrl(allUrls, ownRegistrableDomain),
      bookingVendors: collectBookingVendors(allUrls, ownRegistrableDomain),
      accessibilityStatementUrl: findAccessibilityStatementUrl(sameOriginUrls),
      siren: null,
      siret: null,
      mentionsLegalesUrl: null,
      redirectedWithinSite: homepage.redirectedWithinSite,
    };

    // A holding page has no identification worth fetching, and spending the
    // second request on one is the opposite of polite.
    if (facts.parkedPage === true) return facts;

    const mentionsLegalesUrl = findMentionsLegalesUrl(sameOriginUrls);
    if (
      mentionsLegalesUrl === null ||
      !isAllowedByRobots(robotsRules, new URL(mentionsLegalesUrl).pathname)
    ) {
      return facts;
    }

    await sleep(effectiveDelayMs);
    const mentionsLegales = await probeUrl(mentionsLegalesUrl, {
      timeoutMs: options.timeoutMs,
      userAgent: options.userAgent,
      sameSite: (candidateUrl) =>
        ownRegistrableDomain !== null && registrableDomainOf(candidateUrl) === ownRegistrableDomain,
    });
    if (mentionsLegales.kind === 'failed') return facts;

    facts.mentionsLegalesUrl = mentionsLegales.finalUrl;
    const extraction = extractMentionsLegales(
      mentionsLegales.finalUrl,
      htmlToText(mentionsLegales.html),
    );
    facts.siren = extraction.siren ?? null;
    return facts;
  } finally {
    release();
  }
}
