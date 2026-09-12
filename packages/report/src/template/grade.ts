/**
 * Deterministic letter grade for the plan 041 Part A scorecard. Two sources,
 * by the operator's own pick (docs/product/fix-snippets-and-scorecard-brainstorm.md,
 * "Operator direction pick"):
 *
 * - `computeComparativeGrade`: bands the milestone-10 benchmark percentile
 *   (`@odysseus/core`'s `computeSiteBenchmarkPercentile`). Report only - the
 *   percentile is a comparison against other sites, which the outreach
 *   preview's stricter rule (trade-off 42/16) forbids.
 * - `computeSeverityGrade`: bands the site's own distinct-finding severity
 *   counts, no comparison to anything, no per-page normalization (matching
 *   `computeBrokennessScore` and the cost gates below, which never
 *   normalize by page count either). Used by both the report (as its
 *   fallback when no benchmark cohort exists yet) and the outreach preview
 *   (always, per the operator's pick).
 *
 * `computeSeverityGrade` does not call the cost gates
 * (`isAuditFallbackEligible`/`isProspectingWorthy`, trade-off 23/38) at
 * runtime - a grading formula has no business depending on functions whose
 * contract is "should the LLM be called", and trade-off 38 already warns
 * against reusing them outside their own decision. But it deliberately
 * anchors its band cutoffs on the exact same numbers those two gates
 * already use: 0 critical/0 serious/moderate under 5 is word-for-word
 * `isAuditFallbackEligible`'s own definition of "clean enough", and
 * critical at least 1 or serious at least 2 is `isProspectingWorthy`'s own
 * definition of "clearly broken". Both were reviewed and approved as
 * policy (CLAUDE.md rule 6, docs/rules/llm-layer-rules.md section 10)
 * before this grade existed, so reusing their numbers here needed no new
 * calibration decision - only the two additional bands in between are new,
 * and both are exhaustively derived rather than invented (a lone serious
 * finding is one below the "clearly broken" line; a clean site with
 * moderate volume at or above 5 is one over the "clean enough" line).
 */

import type { BenchmarkPercentileResult, Severity } from '@odysseus/core';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface SeverityGrade {
  grade: Grade;
  /** Which reviewed rule decided the grade, kept for debugging and for
   *  render sites that want to explain the grade rather than just show
   *  the letter. */
  reason:
    | 'clean'
    | 'moderate-volume'
    | 'one-serious-finding'
    | 'critical-finding'
    | 'multiple-serious-findings';
}

export interface ComparativeGrade {
  grade: Grade;
  percentile: number;
}

/** Own-counts grade over distinct-finding severity counts, unnormalized -
 *  see the module doc comment for why each cutoff is the exact number an
 *  already-reviewed cost gate uses, not a newly invented one. */
export function computeSeverityGrade(
  severityCounts: Readonly<Record<Severity, number>>,
): SeverityGrade {
  const { critical, serious, moderate } = severityCounts;
  if (critical >= 1) return { grade: 'F', reason: 'critical-finding' };
  if (serious >= 2) return { grade: 'F', reason: 'multiple-serious-findings' };
  if (serious === 1) return { grade: 'D', reason: 'one-serious-finding' };
  if (moderate >= 5) return { grade: 'B', reason: 'moderate-volume' };
  return { grade: 'A', reason: 'clean' };
}

/** UNCALIBRATED placeholder bands. `manifest.benchmarkPercentile`'s
 *  `percentile` is "share of the cohort that scored strictly better than
 *  this site" (@odysseus/core's own doc comment on
 *  `BenchmarkPercentileResult.percentile`), so a LOW percentile is GOOD
 *  (few sites beat this one) and a HIGH percentile is BAD - the opposite of
 *  the everyday "90th percentile" meaning. Bands here read that value
 *  correctly: a site beaten by fewer than 20 percent of the cohort is the
 *  top band. Unlike `computeSeverityGrade`, there is no existing reviewed
 *  threshold to anchor these on - a percentile is already a normalized 0
 *  to 100 comparative scale with no natural break points, so these are
 *  even quartile-ish bands rather than an invented absolute scale. Report
 *  only; lower stakes than the own-counts bands since it only fires once a
 *  benchmark cohort exists (milestone 10, not yet built). */
const COMPARATIVE_PERCENTILE_BANDS: ReadonlyArray<{ grade: Grade; maxPercentile: number }> = [
  { grade: 'A', maxPercentile: 20 },
  { grade: 'B', maxPercentile: 40 },
  { grade: 'C', maxPercentile: 60 },
  { grade: 'D', maxPercentile: 80 },
];

/** Comparative grade from the milestone-10 benchmark percentile. Report
 *  only, per the operator's pick: the outreach preview never uses this. */
export function computeComparativeGrade(outcome: BenchmarkPercentileResult): ComparativeGrade {
  const band = COMPARATIVE_PERCENTILE_BANDS.find(
    (candidate) => outcome.percentile < candidate.maxPercentile,
  );
  return { grade: band?.grade ?? 'F', percentile: outcome.percentile };
}
