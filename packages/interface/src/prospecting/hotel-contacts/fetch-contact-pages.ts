/**
 * The bounded, no-browser read that plan 007's contact discovery decides over.
 *
 * The politeness shape is copied from mentions-legales-fetch.ts and
 * check-hotel-site.ts rather than reinvented: one per-origin lock held for the
 * whole visit, robots.txt fetched once and honoured per path, the declared
 * Crawl-delay raising the floor on the configured delay, and a sleep before
 * every request including the third. Non-negotiable rule 5 governs this stage
 * exactly as it governs a full audit crawl.
 *
 * The request budget is three: the homepage, the mentions legales page, and the
 * contact page. Nothing else is fetched, because nothing else is where a French
 * hotel publishes a professional mailbox, and every extra request is spent on
 * an unsolicited third-party site.
 *
 * A caller that already knows the mentions legales URL from the stored plan 003
 * qualification passes it in, which saves rediscovering it but never saves the
 * request: `HotelSiteFacts` stores derived facts, not page bodies, and prescans
 * store no page text either, so the text this stage reads has to be fetched.
 *
 * Sources come back in the order they should break a tie, not in fetch order:
 * an address on the contact page was put there to be written to, the mentions
 * legales block is the publisher's own identification, and the homepage footer
 * is the weakest of the three.
 */

import type { OriginLock } from '@odysseus/scanner';
import { fetchRobotsRules, findMentionsLegalesUrl, isAllowedByRobots } from '@odysseus/scanner';
import { findContactPageUrl, type ContactSourceKind, type ContactTextSource } from '@odysseus/core';
import { extractAnchorHrefs, extractMailtoTargets, htmlToText } from '../fetch-candidate-page.js';
import { registrableDomainOf } from '../check-hotel-site.js';
import { probeUrl } from '../probe-url.js';
import { sleep } from '../sleep.js';

export interface FetchContactPagesOptions {
  crawlDelayMs: number;
  userAgent: string;
  timeoutMs: number;
  /** The mentions legales URL plan 003 already found, when there is one. */
  knownMentionsLegalesUrl?: string | null;
}

export type ContactFetchOutcome = 'ok' | 'robots-denied' | 'unreachable';

export interface ContactPagesFetch {
  outcome: ContactFetchOutcome;
  /** In tie-break order: contact page, mentions legales, homepage. Empty
   *  whenever the outcome is not `ok`. */
  sources: ContactTextSource[];
  /** Requests actually made to the site, robots.txt excluded. Bounded at three
   *  and asserted by the tests, since this is the number that has to stay
   *  small. */
  requestCount: number;
}

const SOURCE_TIE_BREAK: Record<ContactSourceKind, number> = {
  'contact-page': 0,
  'mentions-legales': 1,
  homepage: 2,
};

function homepageUrlFor(domain: string): string {
  const trimmed = domain.trim().replace(/\/+$/u, '');
  if (/^https?:\/\//iu.test(trimmed)) return trimmed;
  return `https://${trimmed}/`;
}

export async function fetchContactPages(
  domain: string,
  originLock: OriginLock,
  options: FetchContactPagesOptions,
): Promise<ContactPagesFetch> {
  const homepageUrl = homepageUrlFor(domain);
  const ownRegistrableDomain = registrableDomainOf(homepageUrl);
  const origin = new URL(homepageUrl).origin;
  // A redirect off the hotel's own registrable domain is refused rather than
  // followed. Following it would read a stranger's contact page and attribute
  // the address it publishes to this hotel.
  const sameSite = (candidateUrl: string): boolean =>
    ownRegistrableDomain !== null && registrableDomainOf(candidateUrl) === ownRegistrableDomain;
  const release = await originLock.acquire(origin);
  const sources: ContactTextSource[] = [];
  let requestCount = 0;

  try {
    const robotsRules = await fetchRobotsRules(origin, options.userAgent, options.timeoutMs);
    const effectiveDelayMs = Math.max(options.crawlDelayMs, robotsRules.crawlDelayMs ?? 0);
    const allowed = (url: string): boolean => isAllowedByRobots(robotsRules, new URL(url).pathname);

    if (!allowed(homepageUrl)) {
      return { outcome: 'robots-denied', sources: [], requestCount };
    }

    await sleep(effectiveDelayMs);
    requestCount += 1;
    const homepage = await probeUrl(homepageUrl, {
      timeoutMs: options.timeoutMs,
      userAgent: options.userAgent,
      sameSite,
    });
    if (homepage.kind === 'failed') {
      return { outcome: 'unreachable', sources: [], requestCount };
    }

    sources.push({
      kind: 'homepage',
      url: homepage.finalUrl,
      text: htmlToText(homepage.html),
      mailtoTargets: extractMailtoTargets(homepage.html),
    });

    const sameOriginUrls = extractAnchorHrefs(homepage.html, homepage.finalUrl);
    const targets: { kind: ContactSourceKind; url: string }[] = [];

    const mentionsLegalesUrl =
      options.knownMentionsLegalesUrl ?? findMentionsLegalesUrl(sameOriginUrls);
    if (mentionsLegalesUrl !== null) {
      targets.push({ kind: 'mentions-legales', url: mentionsLegalesUrl });
    }
    const contactUrl = findContactPageUrl(sameOriginUrls);
    // Never the same request twice: a site whose contact page *is* its mentions
    // legales page would otherwise spend two of its three requests on one page.
    if (contactUrl !== null && contactUrl !== mentionsLegalesUrl) {
      targets.push({ kind: 'contact-page', url: contactUrl });
    }

    for (const target of targets) {
      if (!allowed(target.url)) continue;
      await sleep(effectiveDelayMs);
      requestCount += 1;
      const page = await probeUrl(target.url, {
        timeoutMs: options.timeoutMs,
        userAgent: options.userAgent,
        sameSite,
      });
      if (page.kind === 'failed') continue;
      sources.push({
        kind: target.kind,
        url: page.finalUrl,
        text: htmlToText(page.html),
        mailtoTargets: extractMailtoTargets(page.html),
      });
    }

    sources.sort((a, b) => SOURCE_TIE_BREAK[a.kind] - SOURCE_TIE_BREAK[b.kind]);
    return { outcome: 'ok', sources, requestCount };
  } finally {
    release();
  }
}
