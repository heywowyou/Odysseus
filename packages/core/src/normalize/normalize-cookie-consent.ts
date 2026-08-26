/**
 * C1 (2026-08-24): violation judgment for the cookie/consent check.
 * Site-level, attributed to the homepage, the same pattern
 * normalize-security-headers.ts and normalize-sitemap.ts already use.
 *
 * Three findings, in decreasing order of how certain the underlying fact
 * is:
 *
 *   cookie-non-essential-before-consent - a cookie belonging to a named
 *     measurement or advertising product was written on first arrival,
 *     before the visitor could have consented to anything. The most
 *     concrete of the three: the cookie is either there or it is not, and
 *     its vendor is identified from a documented name.
 *
 *   tracker-request-before-consent - a request reached a host whose only
 *     purpose is measurement or advertising, transmitting the visitor's
 *     IP and referring page whether or not a cookie followed. Separate
 *     from the above because a vendor can track without setting a cookie,
 *     and a client fixing only the cookie would believe they were done.
 *
 *   consent-mechanism-absent - non-essential cookies or trackers are
 *     active and no consent platform's own published marker was found
 *     anywhere on the page. Moderate rather than serious: absence of a
 *     recognised marker is weaker evidence than the presence of a cookie
 *     (a hand-rolled banner this table does not know would look the same),
 *     and the finding above already carries the concrete fact.
 *
 * Never emitted when the check itself did not run. Consistent with every
 * other check here: an unmeasured site produces no finding, never a pass
 * and never a guess.
 *
 * Per CLAUDE.md rule 6, none of these state that a particular business is
 * in breach. They state what was observed on one load with no
 * interaction, which is a measurement, and leave the conclusion to the
 * report's own copy and to the client's counsel.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const COOKIE_NON_ESSENTIAL_BEFORE_CONSENT_RULE_ID = 'cookie-non-essential-before-consent';
export const TRACKER_REQUEST_BEFORE_CONSENT_RULE_ID = 'tracker-request-before-consent';
export const CONSENT_MECHANISM_ABSENT_RULE_ID = 'consent-mechanism-absent';
export const YOUTUBE_TRACKING_EMBED_RULE_ID = 'youtube-tracking-embed';
export const THIRD_PARTY_DATA_TRANSFER_RULE_ID = 'third-party-data-transfer';

export interface CookieConsentCheckInput {
  checked: boolean;
  nonEssentialCookies: { name: string; domain: string; vendor?: string; isThirdParty: boolean }[];
  trackerRequests: { host: string; vendor: string }[];
  thirdPartyOrigins?: { origin: string; requestCount: number }[];
  consentPlatforms: string[];
  usesTrackingYouTubeEmbed: boolean;
}

function candidate(
  ruleId: string,
  title: string,
  description: string,
  pageUrl: string,
  rawEvidence: Record<string, unknown>,
): FindingCandidate {
  return {
    source: 'custom',
    ruleId,
    category: 'privacy',
    severity: severityFromCustom(ruleId),
    wcagCriteria: [],
    title,
    description,
    pageUrl,
    element: null,
    rawEvidenceForPage: rawEvidence,
  };
}

/** Distinct vendors, sorted, so the description is stable across runs and
 *  the same finding dedupes to the same key on a monitoring re-scan. */
function vendorList(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined))].sort();
}

export function normalizeCookieConsent(
  input: CookieConsentCheckInput,
  homepageUrl: string,
): FindingCandidate[] {
  if (!input.checked) return [];

  const candidates: FindingCandidate[] = [];

  if (input.nonEssentialCookies.length > 0) {
    const vendors = vendorList(input.nonEssentialCookies.map((cookie) => cookie.vendor));
    const names = [...new Set(input.nonEssentialCookies.map((cookie) => cookie.name))].sort();
    candidates.push(
      candidate(
        COOKIE_NON_ESSENTIAL_BEFORE_CONSENT_RULE_ID,
        'Non-essential cookies are set before any consent',
        `On a first visit with no interaction of any kind, this site wrote ${names.length} cookie(s) belonging to measurement or advertising products: ${vendors.join(', ')}. Cookies of this kind are not required to deliver the service the visitor asked for.`,
        homepageUrl,
        { cookieNames: names, vendors },
      ),
    );
  }

  if (input.trackerRequests.length > 0) {
    const vendors = vendorList(input.trackerRequests.map((request) => request.vendor));
    candidates.push(
      candidate(
        TRACKER_REQUEST_BEFORE_CONSENT_RULE_ID,
        'Third-party trackers are contacted before any consent',
        `On a first visit with no interaction, this site sent requests to ${input.trackerRequests.length} measurement or advertising host(s): ${vendors.join(', ')}. Such a request transmits the visitor's IP address and the page they are on to that provider, whether or not a cookie is set.`,
        homepageUrl,
        { hosts: input.trackerRequests.map((request) => request.host), vendors },
      ),
    );
  }

  const hasNonEssentialActivity = input.nonEssentialCookies.length > 0 || input.trackerRequests.length > 0;
  if (hasNonEssentialActivity && input.consentPlatforms.length === 0) {
    candidates.push(
      candidate(
        CONSENT_MECHANISM_ABSENT_RULE_ID,
        'No recognised consent mechanism was found',
        'Measurement or advertising components are active on first arrival, and no consent platform this audit recognises was present on the page. A consent mechanism built in-house would not be recognised here and should be confirmed manually.',
        homepageUrl,
        { consentPlatforms: [] },
      ),
    );
  }

  if (input.usesTrackingYouTubeEmbed) {
    candidates.push(
      candidate(
        YOUTUBE_TRACKING_EMBED_RULE_ID,
        'A YouTube embed uses the tracking domain',
        'A video is embedded from youtube.com, which sets advertising cookies as soon as the page loads. YouTube publishes youtube-nocookie.com for exactly this case: it serves the same video without the advertising cookies.',
        homepageUrl,
        {},
      ),
    );
  }

  // C5 (2026-08-24): the inventory, not a judgment. Every third-party
  // origin the homepage contacted receives the visitor's IP address and
  // the page they are on. A DPO needs that list; a scanner cannot decide
  // which of those transfers is lawful, and this finding does not try -
  // hence 'minor', which is this table's tier for "worth knowing, nothing
  // is broken". Emitted only when the list is non-trivially long, since
  // one font host is not an inventory worth a finding.
  const thirdPartyOrigins = input.thirdPartyOrigins ?? [];
  if (thirdPartyOrigins.length >= THIRD_PARTY_ORIGIN_REPORTING_THRESHOLD) {
    candidates.push(
      candidate(
        THIRD_PARTY_DATA_TRANSFER_RULE_ID,
        'The homepage contacts several third-party providers',
        `Loading the homepage sends requests to ${thirdPartyOrigins.length} external providers: ${thirdPartyOrigins
          .map((entry) => new URL(entry.origin).hostname)
          .join(', ')}. Each receives the visitor's IP address and the page being viewed. This is an inventory, not a judgment: some of these are necessary to deliver the page, and whether a given transfer needs to be disclosed or consented to depends on what the provider does with it.`,
        homepageUrl,
        { thirdPartyOrigins },
      ),
    );
  }

  return candidates;
}

/** One font host or one CDN is not an inventory worth a finding; a page
 *  reaching this many distinct external providers is a list the client's
 *  DPO has to hold, and almost certainly does not have. */
const THIRD_PARTY_ORIGIN_REPORTING_THRESHOLD = 5;
