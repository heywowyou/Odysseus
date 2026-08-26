/**
 * Standard Core Web Vitals thresholds, shared between the report
 * (packages/report/src/template/sections/core-web-vitals-table.ts, the
 * bon/à améliorer/insuffisant status the client sees) and this package's
 * own Lighthouse normalization (normalize-lighthouse.ts). Moved here by
 * report-feedback-palais-gallien.md item 9: the two used to keep
 * independent copies of "what counts as a bad LCP", one driving the
 * displayed status, the other never consulted at all when
 * severityFromLighthouse (the locked severity.ts) decided a finding's
 * four-tier severity from Lighthouse's own nonlinear score curve instead.
 * A metric graded "à améliorer" (mid) by this table could and did produce
 * a "Critique" finding under the old, disconnected scheme. One source of
 * truth for the thresholds closes that gap; see
 * normalize-lighthouse.ts's capSeverityByRating for how it's applied.
 */

export type CoreWebVitalMetricKey = 'lcp' | 'tbt' | 'fcp' | 'speedIndex' | 'cls';

export interface CoreWebVitalThreshold {
  key: CoreWebVitalMetricKey;
  good: number;
  needsImprovement: number;
}

export const CORE_WEB_VITAL_THRESHOLDS: readonly CoreWebVitalThreshold[] = [
  { key: 'lcp', good: 2500, needsImprovement: 4000 },
  { key: 'tbt', good: 200, needsImprovement: 600 },
  { key: 'fcp', good: 1800, needsImprovement: 3000 },
  { key: 'speedIndex', good: 3400, needsImprovement: 5800 },
  { key: 'cls', good: 0.1, needsImprovement: 0.25 },
];

export type CoreWebVitalRating = 'good' | 'mid' | 'poor';

export function rateCoreWebVital(
  value: number,
  good: number,
  needsImprovement: number,
): CoreWebVitalRating {
  if (value <= good) return 'good';
  if (value <= needsImprovement) return 'mid';
  return 'poor';
}
