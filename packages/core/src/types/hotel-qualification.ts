/**
 * Contracts for milestone 9c plan 003: what a cheap, no-browser look at a
 * hotel's own website concluded, and why.
 *
 * The reason vocabulary is the whole point of this file. A candidate that does
 * not proceed to a browser scan is far more common than one that does, and
 * "did not proceed" is worthless to a later conversion analysis unless it says
 * which of a dozen very different things happened: the domain never resolved,
 * the rating was too low, a human still has to look, the site is a registrar
 * holding page, or the hotel already publishes an accessibility statement and
 * therefore needs a different conversation than the one this campaign opens.
 *
 * Reasons accumulate rather than short-circuit, matching qualify-prospect.ts.
 * A dead domain belonging to a two-star hotel awaiting review has three
 * separate facts worth keeping, and recording only the first one found makes
 * the loss-reason table depend on evaluation order.
 */

import type { HotelStarRating } from './hotel-catalogue.js';
import type { HotelCandidateReviewState, HotelGroupStatus } from './hotel-candidate.js';

/** What happens to this candidate next.
 *
 *  `parked` and `rejected` are deliberately separate and the distinction is
 *  reversibility. A parked candidate may become eligible without anything
 *  about it changing - a later campaign lowers the star gate, a human clears
 *  the review queue - so it is retained and stays queryable. A rejected one
 *  needs the world to change: the domain has to start resolving, or the
 *  holding page has to become a website.
 *
 *  `group-routed` and `already-engaged` are neither. They are candidates a
 *  different process should pick up, not failures of this one. */
export type HotelQualificationOutcome =
  'qualified' | 'parked' | 'rejected' | 'already-engaged' | 'group-routed';

/** Retained, may become eligible later without the site changing. */
export type HotelParkedReason =
  | 'below-three-stars'
  | 'unknown-star-rating'
  /** The declared domain redirects to a different registrable domain carrying
   *  the same name, which is nearly always one business moving TLD rather than
   *  an abandoned domain. Parked rather than rejected because a person can
   *  settle it in one look, and parked rather than followed because the same
   *  shape also describes a domain that was sold. */
  | 'domain-moved'
  /** Effectif under 10 and capacity under 20. Named for what is actually
   *  known - that the microenterprise scope test has not been resolved - and
   *  never for a conclusion about whether an obligation applies to this
   *  business. Non-negotiable rule 6 binds this identifier as much as it binds
   *  report copy. */
  | 'microenterprise-scope-unresolved'
  | 'awaiting-review';

/** The site itself is not usable. Needs the world to change. */
export type HotelRejectedReason =
  | 'no-own-domain'
  | 'dns-unresolved'
  | 'tls-invalid'
  | 'redirect-loop'
  | 'redirect-offsite'
  | 'http-error'
  | 'non-html-response'
  | 'parked-domain-page'
  | 'robots-denied'
  | 'fetch-timeout';

/** Someone else's queue, not a failure of this one. */
export type HotelRoutedReason =
  'group-member' | 'vendor-hosted' | 'accessibility-statement-published';

export type HotelQualificationReason = HotelParkedReason | HotelRejectedReason | HotelRoutedReason;

/** A fact worth keeping that does not change the outcome.
 *
 *  `no-booking-path-detected` is the reason this concept exists. Plan 003 as
 *  first written made a discoverable reservation path a hard campaign
 *  condition; execution decision 3 downgraded it, because real hotel booking
 *  engines are routinely JS widgets or iframes that a no-browser fetch cannot
 *  see, so gating on it would park thousands of hotels on a detection weakness
 *  rather than on a fact about the hotel. Counting the note is what will later
 *  decide whether the gate can safely be made hard. */
export type HotelQualificationNote =
  | 'no-booking-path-detected'
  | 'booking-path-offsite-only'
  | 'no-identification-published'
  | 'redirected-within-site';

/** An off-domain booking destination seen on the page. Recorded because it is
 *  a real fact about how the hotel sells, but it proves neither an own site
 *  nor a direct first-party reservation path - an OTA listing is the OTA's
 *  funnel, not the hotel's. */
export interface HotelBookingVendorFact {
  hostname: string;
  registrableDomain: string;
}

/** What a bounded HTTP look at the site established. Produced by an adapter
 *  (packages/interface's check-hotel-site.ts), consumed here as plain data, so
 *  the decision stays pure and testable without a network. */
export interface HotelSiteFacts {
  /** The URL actually fetched, after any redirects that were followed. */
  finalUrl?: string;
  /** Absent when nothing was fetched at all, which is itself the reason. */
  reachability: HotelSiteReachability;
  /** True when the response body matched a registrar or holding-page
   *  signature. Only meaningful when reachability is `ok`. */
  parkedPage?: boolean;
  /** A same-origin reservation path found without executing JavaScript. */
  reservationUrl?: string | null;
  /** Off-domain booking destinations. Never treated as a reservation path. */
  bookingVendors?: HotelBookingVendorFact[];
  /** A published accessibility statement, which routes rather than qualifies. */
  accessibilityStatementUrl?: string | null;
  /** The identifier the catalogue never carried, recovered from the hotel's
   *  own published identification. This is what finally lets plan 002's exact
   *  identity keys and the Sirene join do something. */
  siren?: string | null;
  siret?: string | null;
  mentionsLegalesUrl?: string | null;
  /** True when a redirect chain stayed on the same registrable domain. */
  redirectedWithinSite?: boolean;
  /** Set only alongside `redirect-offsite`. Computed where the public suffix
   *  list already is, so this package stays free of domain parsing. */
  redirectedToRelatedDomain?: boolean;
}

export type HotelSiteReachability =
  | 'ok'
  | 'dns-unresolved'
  | 'tls-invalid'
  | 'redirect-loop'
  | 'redirect-offsite'
  | 'http-error'
  | 'non-html-response'
  | 'robots-denied'
  | 'timeout'
  /** The candidate had no own domain, so nothing was attempted. This is a
   *  fact about the candidate and is itself a rejection reason. */
  | 'not-attempted'
  /** Deliberately not checked, because the catalogue alone already settles the
   *  outcome: a chain property or a hotel below the star gate is excluded
   *  whatever its website turns out to look like. Distinct from
   *  `not-attempted`, and the distinction is the whole point - conflating them
   *  would report thousands of hotels as having no domain when they have a
   *  perfectly good one nobody looked at. Contributes no reason of its own. */
  | 'not-checked';

/** Everything the decision reads. Assembled by the caller from the candidate
 *  and the site probe, the same division of labour qualifyProspect uses. */
export interface HotelQualificationFacts {
  starRating?: HotelStarRating | null;
  groupStatus: HotelGroupStatus;
  ownRegistrableDomain?: string | null;
  reviewState: HotelCandidateReviewState;
  /** INSEE trancheEffectifsUniteLegale code from the Sirene join, when the
   *  join matched. Absent means unknown, not small. */
  effectifBandCode?: string | null;
  /** Guest capacity from the catalogue. */
  capacity?: number | null;
  site: HotelSiteFacts;
}

export interface HotelQualificationResult {
  outcome: HotelQualificationOutcome;
  /** Every failing or routing condition, in a fixed order independent of how
   *  the facts arrived. Empty exactly when the outcome is `qualified`. */
  reasons: HotelQualificationReason[];
  notes: HotelQualificationNote[];
}
