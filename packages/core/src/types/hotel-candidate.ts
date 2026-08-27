/**
 * Contracts for milestone 9c's canonical hotel candidate: the current, merged
 * view of one establishment, projected from the immutable observations in
 * types/hotel-catalogue.ts.
 *
 * Kept in its own file for the reason hotel-catalogue.ts already gives about
 * itself: the two model opposite directions of travel. A HotelSourceRecord is
 * one source's account of an establishment at one moment, never corrected. A
 * HotelCandidate is the tool's current belief about an establishment,
 * deliberately mutable, and rebuilt whenever the resolution rules change.
 *
 * That last point is why nearly everything here is stamped with a
 * `resolutionVersion`. Resolution rules are never edited in place: a changed
 * rule is a new version, re-resolved from the same source records, so a later
 * comparison of yield or conversion between two campaigns stays interpretable
 * rather than silently mixing two definitions of "independent hotel".
 */

import type { HotelStarRating } from './hotel-catalogue.js';
import type { HotelCampaignEligibility } from '../prospecting/hotel-star-rating.js';
import type { HotelVendorHost } from '../prospecting/hotel-vendor-hosts.js';
import type { DeclaredWebsiteUnusableReason } from '../prospecting/hotel-domain.js';

/** Which evidence merged an observation into a candidate. Ordered by strength,
 *  and the order is load bearing: `siret` names one establishment, `siren`
 *  names only a company and therefore needs a second agreeing fact, and
 *  `own-domain` is the only key actually available before plan 003 supplies an
 *  identifier from the hotel's own published identification. */
export type HotelIdentityKeyKind = 'siret' | 'siren-with-fact' | 'own-domain';

export interface HotelIdentityKey {
  kind: HotelIdentityKeyKind;
  /** The exact value matched on, already normalized. Stored so a merge can be
   *  explained after the fact without re-running resolution. */
  value: string;
  /** For `siren-with-fact`, the second fact that made the company identifier
   *  specific enough to name an establishment. Absent for the other kinds. */
  corroboratingFact?: 'postcode' | 'normalized-name';
}

export type HotelIdentityStatus =
  /** Exactly one candidate matched on exactly one kind of exact evidence. */
  | 'resolved'
  /** Something links this observation to a candidate, but not strongly enough
   *  to merge without a human: a name-plus-postcode agreement, or a website
   *  that cannot be turned into an own domain. */
  | 'needs-review'
  /** More than one candidate matched, or two kinds of exact evidence disagreed.
   *  Never merged, on the principle that conflicting exact keys are a data
   *  problem to look at, not a tie to break. */
  | 'ambiguous'
  /** No candidate matched. Becomes a new candidate. */
  | 'unmatched';

export type HotelCandidateConflictKind =
  | 'siret-disagreement'
  | 'siren-disagreement'
  | 'own-domain-disagreement'
  | 'star-rating-disagreement'
  | 'multiple-exact-matches';

/** A disagreement worth keeping. Conflicts are appended and never truncated:
 *  the point of recording one is that a later reader can see the evidence that
 *  was set aside, which a summary status alone would hide. */
export interface HotelCandidateConflict {
  kind: HotelCandidateConflictKind;
  detail: string;
  /** Candidates the conflicting evidence pointed at, when more than one did. */
  candidateIds: string[];
}

/** How this establishment relates to others sharing its web presence.
 *
 *  `group-member` and `vendor-hosted` are deliberately separate, and getting
 *  them backwards is the error plan 002 step 5 exists to prevent. Twelve
 *  properties on one corporate domain are a chain: exclude them, they are not
 *  an SMB. Twelve independent hotels on one site builder are twelve
 *  businesses: they must reach review, not the exclusion pile. */
export type HotelGroupStatus =
  | 'independent'
  | 'group-member'
  | 'vendor-hosted'
  /** No usable website at all, so nothing can be said about grouping yet. */
  | 'unknown';

/** One website a source declared for this establishment, plus what
 *  normalization made of it. The raw string is kept even when unusable: it is
 *  the only thing a human reviewing the row has to work from. */
export interface HotelWebsiteCandidate {
  raw: string;
  source: string;
  sourceId: string;
  kind: 'own-domain' | 'vendor-hosted' | 'unusable';
  hostname?: string;
  registrableDomain?: string;
  unusableReason?: DeclaredWebsiteUnusableReason;
  vendor?: HotelVendorHost;
}

/** Pointer back to the immutable observation a candidate fact came from. A
 *  candidate never absorbs a source record; it references it, so provenance
 *  survives a re-resolution that changes the candidate entirely. */
export interface HotelSourceRef {
  source: string;
  sourceId: string;
  sourceVersion: string;
  ingestRunId: string;
}

export type HotelCandidateReviewState =
  /** Resolution was unambiguous. Nothing for a human to do. */
  'not-required' | 'pending' | 'accepted' | 'rejected';

export interface HotelCandidateReview {
  state: HotelCandidateReviewState;
  /** Why the candidate is in the queue, written by code at resolution time. */
  queuedReason?: string;
  actor?: string;
  reason?: string;
  decidedAt?: Date;
}

/** Company facts from the Sirene join, kept separate from the establishment
 *  facts the catalogue supplies so a reader can always tell which register
 *  said what. `status` is present even when nothing matched, because "we
 *  looked and found nothing" and "we never had an identifier to look with"
 *  are different states and only one of them is fixable by plan 003. */
export type HotelSireneJoinStatus =
  'matched' | 'no-identifier' | 'siren-not-in-qualifying-sirene-set' | 'stock-file-unavailable';

export interface HotelSireneJoin {
  status: HotelSireneJoinStatus;
  stockVersion?: string;
  denomination?: string;
  naf?: string;
  effectifBandCode?: string;
  etatAdministratif?: string;
  checkedAt: Date;
}

/** The canonical projection. One per establishment per resolution version. */
export interface HotelCandidate {
  candidateId: string;
  resolutionVersion: string;
  /** The stable key this candidate is addressed by within its resolution
   *  version. Derived from the strongest available evidence, which today is
   *  almost always the registrable domain. */
  identityKey: string;
  identityStatus: HotelIdentityStatus;
  matchedOn?: HotelIdentityKey;
  siret?: string;
  siren?: string;
  sourceRefs: HotelSourceRef[];
  name: string;
  normalizedName: string;
  address?: string;
  postcode?: string;
  commune?: string;
  starRating?: HotelStarRating;
  roomCount?: number;
  capacity?: number;
  campaignEligibility: HotelCampaignEligibility;
  websiteCandidates: HotelWebsiteCandidate[];
  /** Set only when the establishment has a domain no other establishment in
   *  the same resolution run holds. This is the field plan 003 consumes. */
  ownRegistrableDomain?: string;
  groupStatus: HotelGroupStatus;
  /** The shared domain, and how many establishments hold it, when
   *  groupStatus is `group-member` or `vendor-hosted`. */
  groupDomain?: string;
  groupSize?: number;
  sireneJoin?: HotelSireneJoin;
  conflicts: HotelCandidateConflict[];
  review: HotelCandidateReview;
}
