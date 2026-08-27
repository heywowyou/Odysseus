/**
 * Parses the official French tourism classification and applies milestone 9c's
 * hard three-star campaign gate. Pure and synchronous, the same posture as
 * qualify-prospect.ts: adapters extract the raw string, core decides what it
 * means, so the gate has exactly one implementation and one test surface.
 *
 * The gate is deliberately three-way rather than a boolean. A hotel rated
 * below three stars and a hotel whose rating could not be read are both
 * ineligible, but they are ineligible for different reasons and must stay
 * separately queryable: the first is a settled campaign decision, the second
 * is a review item that may become eligible once a human or a second source
 * resolves it. Collapsing them would silently discard the review queue that
 * the campaign gate's "never assumed eligible" rule exists to protect.
 */

import type { HotelStarRating } from '../types/hotel-catalogue.js';

/** Lowest rating this campaign contacts. Not configurable: raising or lowering
 *  it changes who is contacted and is an operator decision recorded in
 *  advisor-plans/README.md, not an environment variable. */
export const MINIMUM_CAMPAIGN_STAR_RATING = 3;

export type HotelCampaignEligibility =
  'eligible' | 'parked-below-three-stars' | 'parked-unknown-rating';

/** Atout France writes the classification as '3 étoiles', with the singular
 *  '1 étoile' for one star and the literal '-' where no value exists. Anything
 *  else is treated as unreadable rather than guessed at, so a contract drift
 *  parks rows for review instead of quietly rating them. */
const ATOUT_FRANCE_CLASSEMENT_PATTERN = /^([1-5])\s+étoiles?$/u;

export function parseAtoutFranceClassement(raw: string): HotelStarRating | null {
  const match = ATOUT_FRANCE_CLASSEMENT_PATTERN.exec(raw.trim());
  if (match === null) return null;
  // The capture group is constrained to 1-5 by the pattern itself, so this
  // cast narrows a known-safe value rather than asserting an unchecked one.
  return Number.parseInt(match[1] as string, 10) as HotelStarRating;
}

export function isCampaignEligibleRating(
  rating: HotelStarRating | null | undefined,
): HotelCampaignEligibility {
  if (rating === null || rating === undefined) return 'parked-unknown-rating';
  return rating >= MINIMUM_CAMPAIGN_STAR_RATING ? 'eligible' : 'parked-below-three-stars';
}
