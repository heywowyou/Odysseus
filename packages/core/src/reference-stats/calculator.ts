import type { ReferenceStat } from './types.js';

/**
 * Multiplies a scalable stat's ratio against a client's own revenue,
 * implementing the research doc's `annual revenue x uplift% = revenue
 * gain` recommendation. Refuses any 'context-only' stat outright -
 * there is no scale-down path for a named case study or an aggregate
 * (research doc sections 1.3/2.3/3.3); silently applying a ratio to
 * one would be exactly the mistake the doc warns against.
 *
 * Revenue is expected already resolved (e.g. from the existing
 * OperatorProfile.turnover.value) - this function pushes null-handling
 * to the caller, matching assessObligations's own pattern of leaving
 * "value not yet known" to a layer above the pure calculation.
 *
 * Only the revenue-gain formula is implemented. The doc also mentions
 * a `sessions x CTR delta = traffic gain` variant; that is a
 * documented gap, not a silent omission - no curated row above needs
 * it yet, and the pipeline does not expose a session-count input.
 */
export function estimateRevenueImpact(
  stat: ReferenceStat,
  annualRevenueEur: number,
): { revenueGainEur: number } | { error: 'not-scalable' } {
  if (stat.scalability !== 'scales-down' || !stat.ratio) return { error: 'not-scalable' };
  return { revenueGainEur: annualRevenueEur * stat.ratio.value };
}
