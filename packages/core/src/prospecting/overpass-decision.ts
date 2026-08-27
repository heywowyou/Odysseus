/**
 * Binding decision 3 of advisor-plans/README.md, as a function.
 *
 * An OpenStreetMap Overpass source adapter is added only if measured usable
 * own-domain yield falls below 8,000, the lower bound of the 8,000 to 15,000
 * target. Encoded here rather than left to a judgment call at the end of a
 * long measurement run, for the reason the decision itself gives: the tempting
 * moment to add a speculative second source is exactly when the first one's
 * number comes in slightly disappointing, and a boundary written down in
 * advance is not negotiable with that impulse.
 */

/** Lower bound of the target population. Exactly 8,000 defers: the target
 *  range is inclusive of its own lower bound, so meeting it is meeting it. */
export const OVERPASS_YIELD_FLOOR = 8_000;

export type OverpassDecision =
  /** Yield meets the target. Keep Overpass unbuilt. */
  | 'defer'
  /** Yield is short. Stop and present the shortfall for approval; never
   *  ingest a new source on the strength of this function alone. */
  | 'propose';

export function decideOverpassNeed(qualifiedUsableOwnDomains: number): OverpassDecision {
  return qualifiedUsableOwnDomains >= OVERPASS_YIELD_FLOOR ? 'defer' : 'propose';
}
