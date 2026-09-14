/**
 * Issue #218: a durable, sector-neutral business identity that survives the
 * 90-day hotel-campaign candidate TTL (hotel_candidates, resolutionVersion
 * regeneration). The Prospect hub's canonical URL and long-lived artifacts
 * (audits, and eventually manual audit links) point at this stable
 * `businessId`, not at a campaign candidate generation that is designed to
 * expire and be re-minted.
 *
 * Deliberately minimal: a pointer/reconciliation record, not a second copy
 * of the catalogue. It never carries raw contact addresses, email bodies,
 * preview bearer material, or any other outreach-sensitive data - that
 * stays exactly where its own TTL-bound collection already puts it
 * (hotel_contacts, outreach_threads, outreach_drafts, ...). A viewer of an
 * expired campaign generation is meant to see "this operational artifact
 * expired", not find that data copied here to paper over the gap.
 */

export type BusinessIdentityKeyKind = 'own-registrable-domain';

/** One piece of evidence this durable record was reconciled against. Kept
 *  as a small append-only list (not overwritten) so a domain change is
 *  visible history, not silently replaced provenance - the safe-match rule
 *  itself only ever matches on the current entries, never invents new ones
 *  from a guess. */
export interface BusinessIdentityKey {
  kind: BusinessIdentityKeyKind;
  value: string;
  addedAt: Date;
}

/** A campaign candidate generation this business has been reconciled with.
 *  A reference, not a copy: the full generation's data stays in
 *  hotel_candidates under its own TTL and resolutionVersion. */
export interface BusinessCandidateGenerationRef {
  candidateId: string;
  resolutionVersion: string;
  linkedAt: Date;
}

export type BusinessSector = 'hospitality' | 'general';

export interface Business {
  businessId: string;
  displayName: string;
  /** The registrable domain the most recent safe-match reconciliation used.
   *  Undefined only for a business whose last known candidate generation
   *  had no own-registrable-domain (should not normally happen, since
   *  ambiguous candidates never create or reconcile a business - see
   *  resolveOrCreateBusinessForCandidate). */
  currentRegistrableDomain?: string;
  /** Every identity key ever safely matched to this business. Reconciling a
   *  later candidate generation appends here rather than replacing the
   *  list, so a rebrand or domain change is legible, not silently lost. */
  identityKeys: BusinessIdentityKey[];
  /** Set only for the hotel campaign today; left absent rather than
   *  defaulted so the type stays usable for a later non-hotel sector
   *  without a rename (acceptance criteria: sector-neutral primary
   *  identity). */
  sector?: BusinessSector;
  candidateGenerations: BusinessCandidateGenerationRef[];
  createdAt: Date;
  updatedAt: Date;
}
