/**
 * Milestone 10 benchmark percentile aggregation
 * (`docs/product/milestone-10-benchmark-study-design.md`, "Percentile
 * aggregation design"). Deterministic and pure - no model choice, no I/O.
 *
 * Site score reuses `computeBrokennessScore` (SEVERITY_ORDER weight over
 * distinct findings, critical 4 / serious 3 / moderate 2 / minor 1) rather
 * than a second weighting scheme, for the same double-counting reason that
 * function already documents.
 */

import type { Finding } from '../types/findings.js';
import { computeBrokennessScore } from '../cost-gating/brokenness.js';

/** One scored cohort member: the findings a full audit produced for one
 *  site, and the date it was scanned. `siteId` is never published - the
 *  design doc requires the study and report to name no domain - but is
 *  needed here to attach a percentile back to the right site. */
export interface BenchmarkCohortSite {
  readonly siteId: string;
  readonly findings: readonly Finding[];
  readonly scanDate: string;
}

export interface BenchmarkPercentileResult {
  readonly siteId: string;
  readonly score: number;
  /** Share, 0 to 100, of the cohort with a strictly lower (better) score
   *  than this site, ties on score broken by critical-finding count and
   *  not split further. Literal reading of the design doc: this is the
   *  fraction of the cohort that did better, not the fraction this site
   *  beat. */
  readonly percentile: number;
  readonly cohortSize: number;
  readonly scanDateRange: BenchmarkScanDateRange;
}

export interface BenchmarkScanDateRange {
  readonly earliest: string;
  readonly latest: string;
}

export interface BenchmarkTooSmall {
  readonly kind: 'too-small';
  readonly cohortSize: number;
  readonly minimumCohortSize: number;
}

export interface BenchmarkScored {
  readonly kind: 'scored';
  readonly results: readonly BenchmarkPercentileResult[];
}

export type BenchmarkPercentileOutcome = BenchmarkScored | BenchmarkTooSmall;

/** Recommended floor from the design doc: below this many scored sites the
 *  cohort is too small to publish or show a percentile for at all. */
export const MINIMUM_BENCHMARK_COHORT_SIZE = 20;

function criticalCount(findings: readonly Finding[]): number {
  return findings.filter((finding) => finding.severity === 'critical').length;
}

/** True when `a`'s (score, criticalCount) pair is strictly lower - meaning
 *  better - than `b`'s. Equal on both components is not strictly lower;
 *  the design doc says such ties "do not split further". */
function isStrictlyBetter(
  a: { score: number; critical: number },
  b: { score: number; critical: number },
): boolean {
  if (a.score !== b.score) return a.score < b.score;
  return a.critical < b.critical;
}

function computeScanDateRange(sites: readonly BenchmarkCohortSite[]): BenchmarkScanDateRange {
  const dates = [...sites.map((site) => site.scanDate)].sort();
  const earliest = dates[0];
  const latest = dates[dates.length - 1];
  if (earliest === undefined || latest === undefined) {
    throw new Error('computeScanDateRange requires a non-empty cohort');
  }
  return { earliest, latest };
}

/** Computes a percentile for every site in the cohort, or reports the
 *  cohort as too small to score at all. Never partially scores a
 *  below-floor cohort. */
export function computeBenchmarkPercentiles(
  cohort: readonly BenchmarkCohortSite[],
): BenchmarkPercentileOutcome {
  if (cohort.length < MINIMUM_BENCHMARK_COHORT_SIZE) {
    return {
      kind: 'too-small',
      cohortSize: cohort.length,
      minimumCohortSize: MINIMUM_BENCHMARK_COHORT_SIZE,
    };
  }

  const scored = cohort.map((site) => ({
    siteId: site.siteId,
    score: computeBrokennessScore(site.findings),
    critical: criticalCount(site.findings),
  }));
  const scanDateRange = computeScanDateRange(cohort);
  const cohortSize = cohort.length;

  const results = scored.map((site) => {
    const betterCount = scored.filter((other) => isStrictlyBetter(other, site)).length;
    return {
      siteId: site.siteId,
      score: site.score,
      percentile: (betterCount / cohortSize) * 100,
      cohortSize,
      scanDateRange,
    };
  });

  return { kind: 'scored', results };
}

/** A single site's outcome, shaped for the caller who only cares about
 *  one audited site's standing (the report renderer) rather than the
 *  whole cohort `computeBenchmarkPercentiles` returns. */
export type SiteBenchmarkPercentile =
  ({ readonly kind: 'scored' } & BenchmarkPercentileResult) | BenchmarkTooSmall;

/** Convenience wrapper for a caller who has the full cohort but wants only
 *  `siteId`'s own outcome - e.g. a report renderer comparing one client's
 *  audit against the frozen benchmark cohort's stored scores. Throws if
 *  `siteId` is not a member of `cohort`, since that is a caller error, not
 *  a case to render around. */
export function computeSiteBenchmarkPercentile(
  cohort: readonly BenchmarkCohortSite[],
  siteId: string,
): SiteBenchmarkPercentile {
  const outcome = computeBenchmarkPercentiles(cohort);
  if (outcome.kind === 'too-small') return outcome;
  const result = outcome.results.find((site) => site.siteId === siteId);
  if (!result) {
    throw new Error(`computeSiteBenchmarkPercentile: siteId "${siteId}" is not in the cohort`);
  }
  return { kind: 'scored', ...result };
}
