import type {
  AuditManifest,
  CoreWebVitalMetricKey,
  CoreWebVitals,
  CoreWebVitalRating,
  CruxFieldDataResult,
  ReportLanguage,
} from '@odysseus/core';
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
export type Unit = 'ms-to-s' | 'ms' | 'unitless';

export const METRIC_UNITS: Record<CoreWebVitalMetricKey, Unit> = {
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

export function formatMetricValue(value: number, unit: Unit, language: ReportLanguage): string {
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

/** INP has no lab equivalent (TBT is Lighthouse's lab-only proxy for it),
 *  so it is not in @odysseus/core's shared CoreWebVitalMetricKey /
 *  CORE_WEB_VITAL_THRESHOLDS - those are consumed by both this table and
 *  normalize-lighthouse.ts's severity capping, neither of which ever
 *  handles INP. Kept local rather than extending that shared union for a
 *  metric the lab side can never produce. Same official web.dev
 *  thresholds scanner/src/crux.ts's CRUX_POOR_THRESHOLDS.inp already
 *  cites for the "poor" cutoff. */
const INP_GOOD_MS = 200;
const INP_NEEDS_IMPROVEMENT_MS = 500;

/** Milestone 8.6: real-user Chrome UX Report data, shown as a second
 *  block under the existing lab table rather than a new section - see
 *  manifest.ts's CruxFieldDataResult doc comment for why "no public
 *  record" and "CRUX_API_KEY not configured" render identically here:
 *  the distinction is internal, and this note must never read as a
 *  pass. */
function renderRealUserDataBlock(
  strings: ReportStrings,
  language: ReportLanguage,
  cruxFieldData: CruxFieldDataResult | undefined,
  /** 2026-08-22, La Corniche report review: true only when the lab table
   *  above this block actually rendered real medians - the gap note
   *  exists to explain a difference between two numbers, so it has
   *  nothing to explain when there is no lab number on the page at all
   *  (the all-unmeasured branch). */
  labDataWasMeasured: boolean,
): string {
  const c = strings.coreWebVitals;
  const header = `<h3 style="font-size:14px;margin-top:var(--space-6);margin-bottom:var(--space-2)">${escapeHtml(c.realUserHeading)}</h3>`;

  if (!cruxFieldData || !cruxFieldData.available) {
    return `
      ${header}
      <p style="font-size:12px;opacity:0.6;max-width:64ch">${escapeHtml(c.realUserNoDataNote)}</p>
    `;
  }

  const rows = [
    cruxFieldData.lcp
      ? { key: 'lcp' as const, label: c.lcpLabel, unit: 'ms-to-s' as Unit, value: cruxFieldData.lcp.p75, good: CORE_WEB_VITAL_THRESHOLDS.find((t) => t.key === 'lcp')!.good, needsImprovement: CORE_WEB_VITAL_THRESHOLDS.find((t) => t.key === 'lcp')!.needsImprovement }
      : null,
    cruxFieldData.inp
      ? { key: 'inp' as const, label: c.inpLabel, unit: 'ms' as Unit, value: cruxFieldData.inp.p75, good: INP_GOOD_MS, needsImprovement: INP_NEEDS_IMPROVEMENT_MS }
      : null,
    cruxFieldData.cls
      ? { key: 'cls' as const, label: c.clsLabel, unit: 'unitless' as Unit, value: cruxFieldData.cls.p75, good: CORE_WEB_VITAL_THRESHOLDS.find((t) => t.key === 'cls')!.good, needsImprovement: CORE_WEB_VITAL_THRESHOLDS.find((t) => t.key === 'cls')!.needsImprovement }
      : null,
  ].filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    return `
      ${header}
      <p style="font-size:12px;opacity:0.6;max-width:64ch">${escapeHtml(c.realUserNoDataNote)}</p>
    `;
  }

  const tableRows = rows
    .map((row) => {
      const rating = rateCoreWebVital(row.value, row.good, row.needsImprovement);
      const ratingColor = rating === 'good' ? GOOD_COLOR : rating === 'mid' ? SEVERITY.moderate.color : SEVERITY.critical.color;
      return `
        <tr>
          ${cell(escapeHtml(row.label))}
          ${cell(formatMetricValue(row.value, row.unit, language))}
          ${cell(escapeHtml(ratingLabel(strings, rating)), `color:${ratingColor}`)}
        </tr>
      `;
    })
    .join('');

  return `
    ${header}
    <p style="font-size:12px;opacity:0.55;margin-bottom:var(--space-3);max-width:64ch">${escapeHtml(c.realUserIntro)}</p>
    ${labDataWasMeasured ? `<p style="font-size:12px;opacity:0.7;margin-bottom:var(--space-3);max-width:64ch">${escapeHtml(c.realUserGapNote)}</p>` : ''}
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr>
          ${headCell(c.metricColumnLabel, 'auto')}
          ${headCell(c.valueColumnLabel, '110px')}
          ${headCell(c.statusColumnLabel, '120px')}
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;
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

/** report-feedback-la-corniche.md item 0.3: whether any page has any
 *  measured Core Web Vital at all - false for a real report where
 *  Lighthouse failed on every page (lighthouseError on all 18 pages,
 *  confirmed against the actual manifest), which is the case this
 *  function exists to let both this section and the cover (cover.ts)
 *  react to consistently. True the moment a single metric on a single
 *  page resolved; a report never needs every metric on every page to
 *  state that Performance measurement broadly succeeded. */
export function hasMeasuredCoreWebVitals(manifest: AuditManifest): boolean {
  return manifest.pages.some((page) => page.coreWebVitals !== undefined);
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
  // 2026-08-22, La Corniche report review: this used to count every
  // *visited* page, but medianForMetric/metricValues only average pages
  // that actually returned a numeric value - a page whose Lighthouse pass
  // timed out is visited but contributes no data point. A real report
  // stated "agregees sur les 27 pages" while only 25 of them had any
  // measurement, an inconsistency between this sentence and section 11's
  // own disclosed failure count. Counts pages with at least one measured
  // Core Web Vital instead, matching what the medians below actually
  // aggregate over.
  const pagesScanned = manifest.pages.filter((page) => page.coreWebVitals !== undefined).length;
  const c = strings.coreWebVitals;
  const metricLabels: Record<CoreWebVitalMetricKey, string> = {
    lcp: c.lcpLabel,
    tbt: c.tbtLabel,
    fcp: c.fcpLabel,
    speedIndex: c.speedIndexLabel,
    cls: c.clsLabel,
  };

  // item 0.3: when nothing at all was measured, the table used to print
  // as if it were real data (5 rows of "Non mesuré", thresholds and a
  // worst-page footnote that has nothing to explain), and the cover
  // still listed Performance among the audited categories. Reported
  // instead of concealed, per rule 1: state plainly that measurement did
  // not complete for this run, name where the reasoning is (methodology),
  // and stop there.
  if (!hasMeasuredCoreWebVitals(manifest)) {
    return sheet(`
      ${renderSheetHeader(ordinal, c.eyebrow, c.heading)}
      <p style="font-size:13.5px;opacity:0.85;max-width:64ch">${escapeHtml(c.allUnmeasuredNote)}</p>
      ${renderRealUserDataBlock(strings, language, manifest.cruxFieldData, false)}
    `, '', 'section-09');
  }

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
    ${renderRealUserDataBlock(strings, language, manifest.cruxFieldData, true)}
  `, '', 'section-09');
}
