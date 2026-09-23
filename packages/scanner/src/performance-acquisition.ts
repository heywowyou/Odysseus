/**
 * Plan 059 step 18: how the Lighthouse phase turns section 12's repeat policy
 * into runs, and how a finished run set picks the report the page keeps.
 *
 * `performance-measurement-set.ts` owns the record and its rules; this module
 * owns the two questions that record leaves to its caller: whether a
 * one-run page's result is severe or near a grading boundary (so it owes a
 * repeat), and which measured run's full Lighthouse report stands for the
 * page downstream. Normalization and the report read one Lighthouse report
 * per page, so that run is the one whose performance score is the set's
 * representative value: the median, with an even set resolved to the worse
 * middle run. It is never the best run.
 */
import {
  CORE_WEB_VITAL_THRESHOLDS,
  extractCoreWebVitals,
  LAB_METRIC_AUDIT_IDS,
  rateCoreWebVital,
  type LighthouseResultInput,
} from '@odysseus/core';
import type {
  LabMetricSample,
  PerformanceMeasurementSet,
  RepeatTrigger,
} from './performance-measurement-set.js';

/** The Lighthouse performance-category grade boundaries (0-49 poor, 50-89
 *  needs improvement, 90-100 good). */
const PERFORMANCE_SCORE_POOR_BELOW = 0.5;
const PERFORMANCE_SCORE_GOOD_FROM = 0.9;

/**
 * How close to a grade boundary a value must sit for one run to be
 * unconvincing: a tenth of the boundary for Core Web Vitals, five score
 * points for the category score. Provisional in the same sense as
 * PROVISIONAL_STABILITY_TOLERANCES: chosen, not measured, until the phase F
 * calibration corpus exists.
 */
const PROVISIONAL_THRESHOLD_NEAR_RELATIVE = 0.1;
const PROVISIONAL_SCORE_NEAR_ABSOLUTE = 0.05;

/** A run's raw numbers in Lighthouse's own units. A metric the report did not
 *  carry is absent, never zero. */
export function labMetricsFromLighthouse(report: unknown): LabMetricSample {
  const lhr = report as Partial<LighthouseResultInput> | undefined;
  if (lhr === undefined || lhr === null) return {};
  const sample: LabMetricSample = {};
  const score = lhr.categories?.['performance']?.score;
  if (typeof score === 'number') sample.performanceScore = score;
  if (lhr.audits === undefined) return sample;
  const vitals = extractCoreWebVitals({ categories: lhr.categories ?? {}, audits: lhr.audits });
  for (const key of ['lcp', 'cls', 'tbt', 'fcp', 'speedIndex'] as const) {
    const value = vitals[key].numericValue;
    if (typeof value === 'number' && Number.isFinite(value)) sample[key] = value;
  }
  return sample;
}

function isNear(value: number, boundary: number): boolean {
  return Math.abs(value - boundary) <= boundary * PROVISIONAL_THRESHOLD_NEAR_RELATIVE;
}

/**
 * Section 12's grading grounds for a repeat, read off one run: `severe` when
 * the score or any Core Web Vital grades poor, `threshold-near` when any of
 * them sits close enough to a boundary that run-to-run noise could move the
 * grade the client reads.
 */
export function gradingRepeatTriggers(sample: LabMetricSample): RepeatTrigger[] {
  let severe = false;
  let near = false;
  const score = sample.performanceScore;
  if (score !== undefined) {
    if (score < PERFORMANCE_SCORE_POOR_BELOW) severe = true;
    for (const boundary of [PERFORMANCE_SCORE_POOR_BELOW, PERFORMANCE_SCORE_GOOD_FROM]) {
      if (Math.abs(score - boundary) <= PROVISIONAL_SCORE_NEAR_ABSOLUTE) near = true;
    }
  }
  for (const threshold of CORE_WEB_VITAL_THRESHOLDS) {
    const value = sample[threshold.key];
    if (value === undefined) continue;
    if (rateCoreWebVital(value, threshold.good, threshold.needsImprovement) === 'poor') {
      severe = true;
    }
    if (isNear(value, threshold.good) || isNear(value, threshold.needsImprovement)) near = true;
  }
  return [...(severe ? (['severe'] as const) : []), ...(near ? (['threshold-near'] as const) : [])];
}

/**
 * The run whose full report stands for the page: the first measured run whose
 * performance score equals the set's representative score. A set with no
 * accepted score falls back to its first measured run, and a set with no
 * measured run has none.
 */
export function representativeRunId(set: PerformanceMeasurementSet): string | undefined {
  const measured = set.runs.filter((run) => run.outcome.kind === 'measured');
  const score = set.accepted.metrics.find((metric) => metric.metric === 'performanceScore');
  if (score !== undefined) {
    const match = measured.find(
      (run) =>
        run.outcome.kind === 'measured' && run.outcome.metrics.performanceScore === score.value,
    );
    if (match !== undefined) return match.runId;
  }
  return measured[0]?.runId;
}

/**
 * The report the page keeps, assembled metric by metric. The representative
 * run supplies the score and everything not tied to one metric; each metric's
 * audits come from the run whose value for that metric is the set's
 * representative value. Taking one whole run instead quoted, on a real hotel
 * page, a layout shift of 0.142 that one run of three produced while the
 * other two agreed on 0.035.
 */
export function composeRepresentativeReport<Report extends { audits?: Record<string, unknown> }>(
  set: PerformanceMeasurementSet,
  reports: ReadonlyMap<string, Report>,
): Report | undefined {
  const baseRunId = representativeRunId(set);
  const base = baseRunId === undefined ? undefined : reports.get(baseRunId);
  if (base === undefined || base.audits === undefined) return base;

  const audits: Record<string, unknown> = { ...base.audits };
  for (const [metric, auditIds] of Object.entries(LAB_METRIC_AUDIT_IDS)) {
    const accepted = set.accepted.metrics.find((entry) => entry.metric === metric);
    if (accepted === undefined) continue;
    const source = set.runs.find(
      (run) =>
        run.outcome.kind === 'measured' &&
        run.outcome.metrics[metric as keyof LabMetricSample] === accepted.value,
    );
    if (source === undefined || source.runId === baseRunId) continue;
    const sourceAudits = reports.get(source.runId)?.audits;
    if (sourceAudits === undefined) continue;
    for (const auditId of auditIds) {
      if (auditId in sourceAudits) audits[auditId] = sourceAudits[auditId];
      else delete audits[auditId];
    }
  }
  return { ...base, audits };
}
