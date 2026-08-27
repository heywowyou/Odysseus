/**
 * The hotel-qualification decision for milestone 9c plan 003. Pure and
 * synchronous, handed already-resolved facts, exactly the posture of
 * qualify-prospect.ts and compliance/assessObligations.ts: this function never
 * fetches a page, reads a config file, or touches the database. The adapter
 * (packages/interface's check-hotel-site.ts) establishes what is true; this
 * decides what it means.
 *
 * Reasons accumulate rather than short-circuit, so a two-star hotel on a dead
 * domain awaiting review reports all three facts. The loss-reason table in the
 * coverage report is then a count of real conditions rather than a count of
 * whichever condition happened to be evaluated first.
 *
 * Outcome precedence, highest first, and it is load bearing:
 *
 *   1. `already-engaged` - the hotel publishes an accessibility statement.
 *      Highest because it changes the conversation entirely: approaching a
 *      site that already has one with this campaign's opening is wrong even
 *      if everything else about the candidate is perfect.
 *   2. `group-routed` - a chain or a vendor platform. Plan 002's own rule:
 *      getting these two backwards is the error that either excludes twelve
 *      independent businesses or fans one decision out across a chain.
 *   3. `rejected` - the site is not usable.
 *   4. `parked` - retained, may become eligible later without the site
 *      changing.
 *   5. `qualified`.
 *
 * Reject before park because an unreadable rating on a dead domain is a dead
 * domain first: parking it implies a human could resolve it, and no human
 * decision makes an unresolvable domain scannable.
 */

import type {
  HotelQualificationFacts,
  HotelQualificationNote,
  HotelQualificationOutcome,
  HotelQualificationReason,
  HotelQualificationResult,
  HotelRejectedReason,
} from '../types/hotel-qualification.js';
import { isCampaignEligibleRating } from './hotel-star-rating.js';
import { meetsEffectifThreshold } from './effectif-threshold.js';

/** Guest capacity below which, combined with an under-10 effectif band, the
 *  microenterprise scope test is recorded as unresolved. Both halves are
 *  required: a 12-room hotel with 15 salaried staff is not a microenterprise,
 *  and a large-capacity property with no declared employees is more likely a
 *  Sirene gap than a genuinely tiny business. */
const MICROENTERPRISE_CAPACITY_CEILING = 20;

/** Maps what the probe found to why the candidate is rejected. Total over the
 *  failing reachability values, so a new one cannot be added upstream without
 *  this switch failing to compile. */
function rejectionForReachability(
  reachability: HotelQualificationFacts['site']['reachability'],
): HotelRejectedReason | null {
  switch (reachability) {
    case 'ok':
      return null;
    case 'not-attempted':
      return 'no-own-domain';
    case 'not-checked':
      // Adds nothing. The reason this candidate does not proceed is already
      // recorded by the catalogue condition that made checking pointless.
      return null;
    case 'dns-unresolved':
      return 'dns-unresolved';
    case 'tls-invalid':
      return 'tls-invalid';
    case 'redirect-loop':
      return 'redirect-loop';
    case 'redirect-offsite':
      return 'redirect-offsite';
    case 'http-error':
      return 'http-error';
    case 'non-html-response':
      return 'non-html-response';
    case 'robots-denied':
      return 'robots-denied';
    case 'timeout':
      return 'fetch-timeout';
  }
}

export function qualifyHotelCandidate(facts: HotelQualificationFacts): HotelQualificationResult {
  const reasons: HotelQualificationReason[] = [];
  const notes: HotelQualificationNote[] = [];
  const { site } = facts;

  // Routing conditions first, so they are recorded even when the site also
  // has problems. A chain's dead domain is still a chain.
  const alreadyEngaged =
    site.accessibilityStatementUrl !== undefined && site.accessibilityStatementUrl !== null;
  if (alreadyEngaged) reasons.push('accessibility-statement-published');

  const routed = facts.groupStatus === 'group-member' || facts.groupStatus === 'vendor-hosted';
  if (facts.groupStatus === 'group-member') reasons.push('group-member');
  if (facts.groupStatus === 'vendor-hosted') reasons.push('vendor-hosted');

  // Rejection conditions.
  const hasOwnDomain =
    facts.ownRegistrableDomain !== undefined &&
    facts.ownRegistrableDomain !== null &&
    facts.ownRegistrableDomain !== '';
  if (!hasOwnDomain) reasons.push('no-own-domain');

  // A same-name redirect is the one offsite landing that is not evidence of a
  // dead domain, so it is withheld from the rejection set and parked below.
  const movedDomain =
    site.reachability === 'redirect-offsite' && site.redirectedToRelatedDomain === true;
  const reachabilityRejection = movedDomain ? null : rejectionForReachability(site.reachability);
  // `no-own-domain` is already recorded above; not-attempted maps to the same
  // reason and must not be pushed twice.
  if (reachabilityRejection !== null && reachabilityRejection !== 'no-own-domain') {
    reasons.push(reachabilityRejection);
  }
  if (site.reachability === 'ok' && site.parkedPage === true) {
    reasons.push('parked-domain-page');
  }
  const rejected =
    !hasOwnDomain ||
    reachabilityRejection !== null ||
    (site.reachability === 'ok' && site.parkedPage === true);

  // Parking conditions.
  const eligibility = isCampaignEligibleRating(facts.starRating);
  if (eligibility === 'parked-below-three-stars') reasons.push('below-three-stars');
  if (eligibility === 'parked-unknown-rating') reasons.push('unknown-star-rating');

  if (facts.reviewState === 'pending') reasons.push('awaiting-review');
  if (movedDomain) reasons.push('domain-moved');

  // Both halves required, and both must actually be known. An absent effectif
  // band means the Sirene join found nothing, which is not evidence of size.
  const smallEffectif =
    facts.effectifBandCode !== undefined &&
    facts.effectifBandCode !== null &&
    facts.effectifBandCode !== '' &&
    !meetsEffectifThreshold(facts.effectifBandCode);
  const smallCapacity =
    facts.capacity !== undefined &&
    facts.capacity !== null &&
    facts.capacity < MICROENTERPRISE_CAPACITY_CEILING;
  if (smallEffectif && smallCapacity) reasons.push('microenterprise-scope-unresolved');

  const parked =
    eligibility !== 'eligible' ||
    facts.reviewState === 'pending' ||
    movedDomain ||
    (smallEffectif && smallCapacity);

  // Non-blocking facts. Only meaningful when a page was actually read.
  if (site.reachability === 'ok') {
    const hasReservationPath =
      site.reservationUrl !== undefined &&
      site.reservationUrl !== null &&
      site.reservationUrl !== '';
    const hasBookingVendors = (site.bookingVendors ?? []).length > 0;
    if (!hasReservationPath) {
      notes.push(hasBookingVendors ? 'booking-path-offsite-only' : 'no-booking-path-detected');
    }
    const hasIdentifier =
      (site.siren !== undefined && site.siren !== null) ||
      (site.siret !== undefined && site.siret !== null);
    if (!hasIdentifier) notes.push('no-identification-published');
    if (site.redirectedWithinSite === true) notes.push('redirected-within-site');
  }

  const outcome: HotelQualificationOutcome = alreadyEngaged
    ? 'already-engaged'
    : routed
      ? 'group-routed'
      : rejected
        ? 'rejected'
        : parked
          ? 'parked'
          : 'qualified';

  return { outcome, reasons, notes };
}
