/**
 * Pure page-role selection for the hotel prescan (milestone 9c plan 004,
 * step 2). Given the homepage URL and the anchors found on it, decides which
 * at most two further pages are worth the two remaining page loads.
 *
 * Deliberately separate from the crawler. A breadth-first crawl capped at
 * three pages returns the first three pages it happens to reach, which on a
 * real hotel site is routinely the homepage plus a cookie policy and a news
 * post. The prescan's whole value is that its three pages are the three a
 * person would look at, so the choice is made from the homepage's own links
 * rather than left to traversal order.
 *
 * Two rules protect the choice from being quietly wrong:
 *
 * - **Same-site only.** A "Réserver" link almost always points at a
 *   third-party booking engine or an OTA. Loading it would spend the budget
 *   measuring somebody else's site and attribute the result to the hotel.
 *   Off-site booking links are still returned, because "this hotel delegates
 *   its booking funnel" is a real fact worth recording; they are just never
 *   selected as a page to scan.
 * - **An absent role is recorded, never backfilled.** Filling the cap with
 *   an arbitrary third page would make "no booking page found" and "a booking
 *   page was found" indistinguishable downstream, which is exactly the fact
 *   plan 006 scoring needs to be able to tell apart.
 */

import { normalizePageUrl } from '../links.js';
import { BOOKING_INTENT_TEXT_PATTERN, type AnchorLike } from '../checks/transactional-flow.js';

export type PrescanPageRole = 'homepage' | 'booking' | 'content';

/** Room and accommodation pages, French and English. Narrower than the
 *  booking pattern on purpose: this picks the page a guest browses, not the
 *  page they transact on, and a hotel site's nav labels that page in a small
 *  and stable vocabulary. */
const CONTENT_INTENT_PATTERN =
  /chambre|\brooms?\b|\bsuites?\b|h[ée]bergement|accommodation|appartement|\bloft\b|\bchalet\b|\bnos-chambres\b/i;

export type PrescanRoleSelectionReason =
  /** The start URL itself. */
  | 'start-url'
  /** Chosen on the anchor's visible text. */
  | 'link-text'
  /** Chosen on the URL path, where the anchor's text was an image or icon. */
  | 'link-path';

export type PrescanRoleAbsenceReason =
  /** No same-site anchor matched this role's vocabulary at all. */
  | 'no-candidate-link'
  /** The only matches pointed off-site, so scanning one would measure a
   *  third party rather than the hotel. */
  | 'offsite-only'
  /** The only match resolved to a page already selected under another role. */
  | 'duplicate-of-selected-page';

export interface PrescanRoleSelection {
  role: PrescanPageRole;
  url: string;
  reason: PrescanRoleSelectionReason;
  /** The anchor text that won, for a human reading the stored prescan and
   *  asking why this page. Empty for the homepage. */
  matchedText: string;
}

export interface PrescanRoleAbsence {
  role: PrescanPageRole;
  reason: PrescanRoleAbsenceReason;
}

export interface PrescanPageSelection {
  selected: PrescanRoleSelection[];
  absent: PrescanRoleAbsence[];
  /** Booking links leaving the site: an OTA, or a delegated booking engine.
   *  Evidence of how the funnel works, never a page this prescan loads. */
  offsiteBookingLinks: string[];
}

/** Hard cap. The prescan's page budget is its defining constraint, so it is
 *  enforced here in pure code where a test can prove it, not left to the
 *  orchestration to respect. */
export const PRESCAN_MAX_PAGES = 3;

interface RoleCandidate {
  url: string;
  reason: PrescanRoleSelectionReason;
  matchedText: string;
}

/** Collects same-site candidates for one role, plus a flag for whether the
 *  role matched anything at all off-site - the difference between "this
 *  hotel has no booking funnel we can see" and "its booking funnel is
 *  somebody else's domain", which are not the same finding. */
function collectCandidates(
  homepageUrl: string,
  anchors: readonly AnchorLike[],
  pattern: RegExp,
): { candidates: RoleCandidate[]; offsite: string[] } {
  const candidates = new Map<string, RoleCandidate>();
  const offsite: string[] = [];

  for (const anchor of anchors) {
    const text = anchor.text.trim();
    const matchesText = pattern.test(text);

    let resolved: URL;
    try {
      resolved = new URL(anchor.href, homepageUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;

    const matchesPath = pattern.test(decodeURIComponent(resolved.pathname));
    if (!matchesText && !matchesPath) continue;

    // allowWwwApex, matching the crawler's own narrow site identity: a hotel
    // whose nav links the apex from a www homepage is one site, not two.
    const normalized = normalizePageUrl(anchor.href, homepageUrl, { allowWwwApex: true });
    if (normalized === undefined) {
      if (!offsite.includes(resolved.href)) offsite.push(resolved.href);
      continue;
    }
    if (candidates.has(normalized)) continue;
    candidates.set(normalized, {
      url: normalized,
      // Text is the stronger signal and is reported when it is what matched,
      // so a selection made only on a URL guess is visible as such.
      reason: matchesText ? 'link-text' : 'link-path',
      matchedText: matchesText ? text : '',
    });
  }

  return { candidates: [...candidates.values()], offsite };
}

/** Shallowest path first, then lexicographic on the normalized URL.
 *
 *  Depth is not arbitrary tidiness, it is what keeps the prescan on the site
 *  a French hotel actually sells through. A purely lexicographic order picked
 *  `/en/book.html` over `/reservation.html` on the fixture, because "e" sorts
 *  before "r" - so the measured evidence, and everything plan 005 builds from
 *  it, would have described the English translation of a French hotel's site
 *  rather than the pages its own guests use. A translated subtree is always
 *  deeper than the page it translates, so preferring the shallower candidate
 *  lands on the primary-language page without any language guessing, which
 *  trade-off 24 already establishes this repository will not do from URL
 *  shape.
 *
 *  Lexicographic order remains the tie-break, and the whole comparison stays
 *  total and deterministic: two prescans of an unchanged site must select the
 *  same pages, or their metrics are not comparable. */
function pathDepth(url: string): number {
  return new URL(url).pathname.split('/').filter(Boolean).length;
}

function pickStable(candidates: readonly RoleCandidate[]): RoleCandidate | undefined {
  return [...candidates].sort((a, b) => {
    const depthDifference = pathDepth(a.url) - pathDepth(b.url);
    return depthDifference !== 0 ? depthDifference : a.url.localeCompare(b.url);
  })[0];
}

export function selectPrescanPages(
  homepageUrl: string,
  anchors: readonly AnchorLike[],
): PrescanPageSelection {
  const normalizedHomepage = normalizePageUrl(homepageUrl, homepageUrl, { allowWwwApex: true });
  const selected: PrescanRoleSelection[] = [
    {
      role: 'homepage',
      url: normalizedHomepage ?? homepageUrl,
      reason: 'start-url',
      matchedText: '',
    },
  ];
  const absent: PrescanRoleAbsence[] = [];
  const taken = new Set<string>([selected[0]!.url]);

  const booking = collectCandidates(homepageUrl, anchors, BOOKING_INTENT_TEXT_PATTERN);
  const content = collectCandidates(homepageUrl, anchors, CONTENT_INTENT_PATTERN);

  // Booking is resolved first, so that when one page matches both
  // vocabularies (a "Réservez votre chambre" page) it is recorded as the
  // booking page and the content role reports a real absence, rather than
  // the same URL being loaded twice under two names.
  for (const [role, collected] of [
    ['booking', booking],
    ['content', content],
  ] as const) {
    const available = collected.candidates.filter((candidate) => !taken.has(candidate.url));
    const choice = pickStable(available);
    if (choice !== undefined) {
      selected.push({
        role,
        url: choice.url,
        reason: choice.reason,
        matchedText: choice.matchedText,
      });
      taken.add(choice.url);
      continue;
    }
    if (collected.candidates.length > 0) {
      absent.push({ role, reason: 'duplicate-of-selected-page' });
    } else if (collected.offsite.length > 0) {
      absent.push({ role, reason: 'offsite-only' });
    } else {
      absent.push({ role, reason: 'no-candidate-link' });
    }
  }

  return {
    selected: selected.slice(0, PRESCAN_MAX_PAGES),
    absent,
    offsiteBookingLinks: booking.offsite,
  };
}
