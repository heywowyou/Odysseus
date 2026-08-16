import type { AuditManifest, CoreWebVitals, ReportLanguage } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';
import { SEVERITY } from '../design-tokens.js';

/** No "good" tone exists in design-tokens.ts's SEVERITY map (every entry
 *  there is bad-to-worse); reuses the same green already used for the
 *  quick-win tag in themes.ts rather than inventing a new colour. */
const GOOD_COLOR = '#7cd9a0';

/** Standard Core Web Vitals thresholds, verified against
 *  docs/report-v2-prototype-haaitza-fr.html's own legend (LCP <=2.5s
 *  good / <=4s needs improvement; CLS <=0.1 / <=0.25; TBT <=200ms /
 *  <=600ms) plus the standard Lighthouse thresholds for FCP (<=1.8s /
 *  <=3s) and Speed Index (<=3.4s / <=5.8s), added alongside the metric
 *  itself (CLAUDE.md CWV-metrics-gap decision). Fixes A6/R6: a bare
 *  46-second LCP with no context reads as broken tooling; a rated
 *  measurement reads as a real, defensible finding. */
type MetricKey = 'lcp' | 'tbt' | 'fcp' | 'speedIndex' | 'cls';

interface MetricSpec {
  key: MetricKey;
  good: number;
  needsImprovement: number;
  /** 'ms-to-s' divides by 1000 and appends " s"; 'ms' appends " ms";
   *  'unitless' (CLS) has no unit and 2 decimal places. */
  unit: 'ms-to-s' | 'ms' | 'unitless';
}

const METRICS: readonly MetricSpec[] = [
  { key: 'lcp', good: 2500, needsImprovement: 4000, unit: 'ms-to-s' },
  { key: 'tbt', good: 200, needsImprovement: 600, unit: 'ms' },
  { key: 'fcp', good: 1800, needsImprovement: 3000, unit: 'ms-to-s' },
  { key: 'speedIndex', good: 3400, needsImprovement: 5800, unit: 'ms-to-s' },
  { key: 'cls', good: 0.1, needsImprovement: 0.25, unit: 'unitless' },
];

type Rating = 'good' | 'mid' | 'poor';

function rate(value: number, good: number, needsImprovement: number): Rating {
  if (value <= good) return 'good';
  if (value <= needsImprovement) return 'mid';
  return 'poor';
}

function formatMetricValue(value: number, unit: MetricSpec['unit'], language: ReportLanguage): string {
  if (unit === 'ms-to-s') return `${formatNumber(Math.round((value / 1000) * 10) / 10, language)} s`;
  if (unit === 'ms') return `${formatNumber(Math.round(value), language)} ms`;
  return formatNumber(Math.round(value * 100) / 100, language);
}

/** Plain median (not mean): a single very slow page must not be able to
 *  drag every page's aggregate number, matching how Lighthouse's own lab
 *  data is read elsewhere in this report (per-page, never averaged). */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function medianForMetric(vitalsList: readonly (CoreWebVitals | undefined)[], key: MetricKey): number | null {
  const values = vitalsList
    .map((v) => v?.[key]?.numericValue)
    .filter((v): v is number => v !== null && v !== undefined);
  return median(values);
}

function ratingLabel(strings: ReportStrings, rating: Rating): string {
  const c = strings.coreWebVitals;
  return rating === 'good' ? c.ratingGoodLabel : rating === 'mid' ? c.ratingNeedsImprovementLabel : c.ratingPoorLabel;
}

function headCell(label: string): string {
  return `<div style="padding:var(--space-2);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 60%, transparent);border-bottom:1px solid var(--color-divider)">${escapeHtml(label)}</div>`;
}

function cell(html: string, extra = ''): string {
  return `<div style="padding:var(--space-2);border-bottom:1px solid var(--color-divider);${extra}">${html}</div>`;
}

/** Doc §3 section 09: 5 aggregated medians (LCP, TBT, FCP, Speed Index,
 *  CLS) across the whole scan - the 20-row-per-page table with full URLs
 *  is removed from the PDF (that table broke words mid-token in a 130px
 *  column and is the correct thing to remove, not shrink). */
export function renderCoreWebVitalsTable(strings: ReportStrings, language: ReportLanguage, manifest: AuditManifest): string {
  const vitalsList = manifest.pages.map((page) => page.coreWebVitals);
  const pagesScanned = manifest.pages.filter((page) => page.status === 'visited').length;
  const c = strings.coreWebVitals;
  const metricLabels: Record<MetricKey, string> = {
    lcp: c.lcpLabel,
    tbt: c.tbtLabel,
    fcp: c.fcpLabel,
    speedIndex: c.speedIndexLabel,
    cls: c.clsLabel,
  };

  const rows = METRICS.map((metric) => {
    const value = medianForMetric(vitalsList, metric.key);
    if (value === null) {
      return `
        <div class="row-atomic">
          ${cell(escapeHtml(metricLabels[metric.key]))}
          ${cell(escapeHtml(c.notMeasured))}
          ${cell(formatMetricValue(metric.good, metric.unit, language))}
          ${cell('-')}
        </div>
      `;
    }
    const rating = rate(value, metric.good, metric.needsImprovement);
    const ratingColor = rating === 'good' ? GOOD_COLOR : rating === 'mid' ? SEVERITY.moderate.color : SEVERITY.critical.color;
    return `
      <div class="row-atomic">
        ${cell(escapeHtml(metricLabels[metric.key]))}
        ${cell(formatMetricValue(value, metric.unit, language))}
        ${cell(`${'≤'} ${formatMetricValue(metric.good, metric.unit, language)}`)}
        ${cell(escapeHtml(ratingLabel(strings, rating)), `color:${ratingColor}`)}
      </div>
    `;
  }).join('');

  return sheet(`
    ${renderSheetHeader(c.eyebrow, c.heading)}
    <p style="font-size:12px;opacity:0.55;margin-bottom:var(--space-4)">${escapeHtml(fillTemplate(c.introTemplate, { pages: formatNumber(pagesScanned, language) }))}</p>
    <div style="display:grid;grid-template-columns:1fr 130px 120px 120px;font-size:14px">
      ${headCell(c.metricColumnLabel)}
      ${headCell(c.valueColumnLabel)}
      ${headCell(c.thresholdColumnLabel)}
      ${headCell(c.statusColumnLabel)}
      ${rows}
    </div>
  `);
}
