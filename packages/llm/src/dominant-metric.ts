import type { AuditManifest, CoreWebVitalMeasurement } from '@odysseus/core';

/** "Poor" thresholds per the standard Core Web Vitals bands, matching
 *  packages/report's own performance-table rating (core-web-vitals-table.ts).
 *  Duplicated rather than shared via @odysseus/core because it's six
 *  numbers, not shared logic - see docs/report-v2-refactor.md 4.3. Keep
 *  the two in sync by hand if either changes. */
const POOR_THRESHOLDS = {
  lcp: 4000,
  cls: 0.25,
  tbt: 600,
} as const;

type MetricKey = keyof typeof POOR_THRESHOLDS;

function metricValues(manifest: AuditManifest, metric: MetricKey): number[] {
  return manifest.pages
    .map((page): CoreWebVitalMeasurement | undefined => page.coreWebVitals?.[metric])
    .filter(
      (measurement): measurement is CoreWebVitalMeasurement => measurement?.numericValue != null,
    )
    .map((measurement) => measurement.numericValue as number);
}

/** Which Core Web Vital dominates the site's performance problem, so the
 *  writing pass can be told to lead performance recommendedActions with
 *  it rather than defaulting to image/CSS advice regardless of cause
 *  (docs/report-v2-refactor.md A4: 16,490ms of TBT is a JavaScript
 *  execution problem, not an image-weight problem).
 *
 *  Ranks metrics with at least one page rated "poor" by their average
 *  ratio to the poor threshold, rather than by raw poor-page count alone:
 *  on a real scan (haaitza.com) both LCP and TBT are poor on all 20
 *  pages, a tie by count, but TBT runs proportionally far further past
 *  its threshold (~18x) than LCP does past its own (~8x), correctly
 *  identifying TBT as dominant. Returns null when no metric has any page
 *  rated poor - there is nothing to lead with. */
export function computeDominantPerformanceMetric(manifest: AuditManifest): MetricKey | null {
  const stats = (Object.keys(POOR_THRESHOLDS) as MetricKey[]).map((metric) => {
    const threshold = POOR_THRESHOLDS[metric];
    const poorValues = metricValues(manifest, metric).filter((value) => value > threshold);
    const averageRatio =
      poorValues.length === 0
        ? 0
        : poorValues.reduce((sum, value) => sum + value / threshold, 0) / poorValues.length;
    return { metric, poorPageCount: poorValues.length, averageRatio };
  });

  const withPoorPages = stats.filter((entry) => entry.poorPageCount > 0);
  if (withPoorPages.length === 0) return null;

  withPoorPages.sort(
    (a, b) => b.averageRatio - a.averageRatio || b.poorPageCount - a.poorPageCount,
  );
  return withPoorPages[0]!.metric;
}
