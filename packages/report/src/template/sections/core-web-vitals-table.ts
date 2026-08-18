import type { AuditManifest, CoreWebVitalMetricKey, CoreWebVitals, CoreWebVitalRating, ReportLanguage } from '@odysseus/core';
import { CORE_WEB_VITAL_THRESHOLDS, rateCoreWebVital } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';
import { SEVERITY } from '../design-tokens.js';

/** No "good" tone exists in design-tokens.ts's SEVERITY map (every entry
 *  there is bad-to-worse); reuses the same green already used for the
 *  quick-win tag in themes.ts rather than inventing a new colour. */
const GOOD_COLOR = '#7cd9a0';

/** Threshold values (good/needsImprovement) now live in
 *  `@odysseus/core`'s cwv-thresholds.ts, shared with normalize-
 *  lighthouse.ts (report-feedback-palais-gallien.md item 9) - this table
 *  is the reason that sharing matters: it is the one place a client sees
 *  a metric rated bon/à améliorer/insuffisant, and that rating must never
 *  disagree with the severity the same metric's underlying Finding
 *  carries. Only the display unit (ms vs seconds vs unitless) stays
 *  local, since core has no reason to know about report formatting. */
type Unit = 'ms-to-s' | 'ms' | 'unitless';

const METRIC_UNITS: Record<CoreWebVitalMetricKey, Unit> = {
  lcp: 'ms-to-s',
  tbt: 'ms',
  fcp: 'ms-to-s',
  speedIndex: 'ms-to-s',
  cls: 'unitless',
};

/** item 12: CLS at 2 decimal places rounds a real, healthy value like
 *  0.0035 down to "0", indistinguishable from an actual capture failure
 *  (report-feedback-palais-gallien.md's own suspicion, checked against
 *  the real manifest and confirmed to be genuine per-page CLS data, not a
 *  measurement bug: median 0.0035 across 20 real pages). 3 decimal places
 *  keeps a genuine near-zero CLS visibly distinct from a literal 0. */
const CLS_DECIMAL_PLACES = 3;

function formatMetricValue(value: number, unit: Unit, language: ReportLanguage): string {
  if (unit === 'ms-to-s') return `${formatNumber(Math.round((value / 1000) * 10) / 10, language)} s`;
  if (unit === 'ms') return `${formatNumber(Math.round(value), language)} ms`;
  const factor = 10 ** CLS_DECIMAL_PLACES;
  return formatNumber(Math.round(value * factor) / factor, language);
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

function metricValues(vitalsList: readonly (CoreWebVitals | undefined)[], key: CoreWebVitalMetricKey): number[] {
  return vitalsList.map((v) => v?.[key]?.numericValue).filter((v): v is number => v !== null && v !== undefined);
}

function medianForMetric(vitalsList: readonly (CoreWebVitals | undefined)[], key: CoreWebVitalMetricKey): number | null {
  return median(metricValues(vitalsList, key));
}

/** item 1.7/B2: a finding's severity is the worst instance across all
 *  pages sharing its dedupeKey (severity.ts's maxSeverity, a general,
 *  deliberate dedupe rule - not specific to Core Web Vitals), while this
 *  table only ever showed the median. A metric that is genuinely critical
 *  on one or two outlier pages produced a "Critique" finding sitting next
 *  to a median-based "a ameliorer" status here, which reads as a
 *  contradiction even though both numbers are individually correct - they
 *  are just answering different questions ("typical page" vs "worst
 *  page"). Showing the worst page's value alongside the median lets the
 *  reader see why the finding's severity can outrank the median's rating,
 *  without adding reconciling prose. */
function worstForMetric(vitalsList: readonly (CoreWebVitals | undefined)[], key: CoreWebVitalMetricKey): number | null {
  const values = metricValues(vitalsList, key);
  if (values.length === 0) return null;
  return Math.max(...values);
}

function ratingLabel(strings: ReportStrings, rating: CoreWebVitalRating): string {
  const c = strings.coreWebVitals;
  return rating === 'good' ? c.ratingGoodLabel : rating === 'mid' ? c.ratingNeedsImprovementLabel : c.ratingPoorLabel;
}

function headCell(label: string, width: string): string {
  return `<th style="width:${width};padding:var(--space-2);font-size:11px;letter-spacing:0.02em;text-transform:uppercase;text-align:left;font-weight:400;color:color-mix(in srgb, var(--color-text) 60%, transparent);border-bottom:1px solid var(--color-divider)">${escapeHtml(label)}</th>`;
}

function cell(html: string, extra = ''): string {
  return `<td style="padding:var(--space-2);border-bottom:1px solid var(--color-divider);${extra}">${html}</td>`;
}

/** Doc §3 section 09: 5 aggregated medians (LCP, TBT, FCP, Speed Index,
 *  CLS) across the whole scan - the 20-row-per-page table with full URLs
 *  is removed from the PDF (that table broke words mid-token in a 130px
 *  column and is the correct thing to remove, not shrink). */
export function renderCoreWebVitalsTable(
  strings: ReportStrings,
  ordinal: number,
  language: ReportLanguage,
  manifest: AuditManifest,
): string {
  const vitalsList = manifest.pages.map((page) => page.coreWebVitals);
  const pagesScanned = manifest.pages.filter((page) => page.status === 'visited').length;
  const c = strings.coreWebVitals;
  const metricLabels: Record<CoreWebVitalMetricKey, string> = {
    lcp: c.lcpLabel,
    tbt: c.tbtLabel,
    fcp: c.fcpLabel,
    speedIndex: c.speedIndexLabel,
    cls: c.clsLabel,
  };

  const rows = CORE_WEB_VITAL_THRESHOLDS.map((metric) => {
    const unit = METRIC_UNITS[metric.key];
    const value = medianForMetric(vitalsList, metric.key);
    if (value === null) {
      return `
        <tr>
          ${cell(escapeHtml(metricLabels[metric.key]))}
          ${cell(escapeHtml(c.notMeasured))}
          ${cell('-')}
          ${cell(formatMetricValue(metric.good, unit, language))}
          ${cell('-')}
        </tr>
      `;
    }
    const rating = rateCoreWebVital(value, metric.good, metric.needsImprovement);
    const ratingColor = rating === 'good' ? GOOD_COLOR : rating === 'mid' ? SEVERITY.moderate.color : SEVERITY.critical.color;
    const worst = worstForMetric(vitalsList, metric.key);
    const worstCell =
      worst !== null && worst > value
        ? cell(formatMetricValue(worst, unit, language), 'opacity:0.7')
        : cell(escapeHtml(c.worstPageSameAsMedian), 'opacity:0.55;font-size:12px');
    return `
      <tr>
        ${cell(escapeHtml(metricLabels[metric.key]))}
        ${cell(formatMetricValue(value, unit, language))}
        ${worstCell}
        ${cell(`${'≤'} ${formatMetricValue(metric.good, unit, language)}`)}
        ${cell(escapeHtml(ratingLabel(strings, rating)), `color:${ratingColor}`)}
      </tr>
    `;
  }).join('');

  // item 2.2: this was a CSS grid of <div>s with no <thead>, so the header
  // row could never repeat when the table broke across a page - a
  // continuation page showed bare data with no column labels. Real
  // <table>/<thead>/<tbody> markup plus `thead { display: table-header-group }`
  // (paged.css) is the standard Paged.js pattern for a repeating header,
  // and lets each <tr> be a genuine row Paged.js can keep intact on its
  // own, replacing the earlier display:contents `.row-atomic` workaround
  // that only existed because the grid markup had no real rows to begin
  // with.
  return sheet(`
    ${renderSheetHeader(ordinal, c.eyebrow, c.heading)}
    <p style="font-size:12px;opacity:0.55;margin-bottom:var(--space-4)">${escapeHtml(fillTemplate(c.introTemplate, { pages: formatNumber(pagesScanned, language) }))}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr>
          ${headCell(c.metricColumnLabel, 'auto')}
          ${headCell(c.valueColumnLabel, '110px')}
          ${headCell(c.worstPageColumnLabel, '110px')}
          ${headCell(c.thresholdColumnLabel, '120px')}
          ${headCell(c.statusColumnLabel, '120px')}
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <p style="font-size:11px;opacity:0.5;margin-top:var(--space-3)">${escapeHtml(c.worstPageFootnote)}</p>
  `, '', 'section-09');
}
