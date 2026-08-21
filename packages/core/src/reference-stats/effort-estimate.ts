import type { Theme } from '../types/llm-output.js';

type Effort = Theme['effort'];

/**
 * P1.5 (2026-08-21 La Corniche feedback pass): every priority card gives a
 * qualitative effort label (Faible/Moyen/Élevé) but nothing a director can
 * put in a budget line - a real report had five of six priorities say
 * "Faible" with no aggregate translation. A genuine developer-day
 * estimation model (bands derived from rule family and occurrence
 * concentration, per the earlier-deferred item in report-feedback-
 * deferred-items.md) is a new domain model, out of scope here. This is a
 * coarser, purely deterministic band-computation off the six priority
 * cards' existing effort labels - a day-range lookup table, not a new
 * LLM-generated claim, per the project's architecture rule.
 */
const EFFORT_DAY_RANGE: Readonly<Record<Effort, { min: number; max: number }>> = {
  low: { min: 0.25, max: 1 },
  medium: { min: 1, max: 3 },
  high: { min: 3, max: 7 },
};

export interface AggregateEffortEstimate {
  minDays: number;
  maxDays: number;
}

/** Pure: no I/O, callable offline exactly like assessObligations. Sums
 *  the day range of each given effort label - deliberately coarse (a
 *  band of bands), stated as such in the report copy rather than implying
 *  false precision. */
export function estimateAggregateEffortDays(efforts: readonly Effort[]): AggregateEffortEstimate {
  return efforts.reduce<AggregateEffortEstimate>(
    (total, effort) => ({
      minDays: total.minDays + EFFORT_DAY_RANGE[effort].min,
      maxDays: total.maxDays + EFFORT_DAY_RANGE[effort].max,
    }),
    { minDays: 0, maxDays: 0 },
  );
}
