import type { AuditManifest, CoreWebVitalMeasurement } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, renderSectionHeader } from '../html-utils.js';

/** Standard Core Web Vitals thresholds, verified against
 *  docs/report-v2-prototype-haaitza-fr.html's own legend (LCP <=2.5s
 *  good / <=4s needs improvement; CLS <=0.1 / <=0.25; TBT <=200ms /
 *  <=600ms, the lab-available proxy for responsiveness). Fixes A6/R6:
 *  a bare 46-second LCP with no context reads as broken tooling; a
 *  rated measurement reads as a real, defensible finding. */
const LCP_GOOD_MS = 2500;
const LCP_NEEDS_IMPROVEMENT_MS = 4000;
const CLS_GOOD = 0.1;
const CLS_NEEDS_IMPROVEMENT = 0.25;
const TBT_GOOD_MS = 200;
const TBT_NEEDS_IMPROVEMENT_MS = 600;

type Rating = 'good' | 'mid' | 'poor';

function rate(value: number, good: number, needsImprovement: number): Rating {
  if (value <= good) return 'good';
  if (value <= needsImprovement) return 'mid';
  return 'poor';
}

function ratingLabel(strings: ReportStrings, rating: Rating): string {
  const c = strings.coreWebVitals;
  return rating === 'good' ? c.ratingGoodLabel : rating === 'mid' ? c.ratingNeedsImprovementLabel : c.ratingPoorLabel;
}

function cell(
  strings: ReportStrings,
  measurement: CoreWebVitalMeasurement | undefined,
  good: number,
  needsImprovement: number,
): string {
  if (!measurement?.displayValue || measurement.numericValue == null) {
    return escapeHtml(strings.coreWebVitals.notMeasured);
  }
  const rating = rate(measurement.numericValue, good, needsImprovement);
  return `${escapeHtml(measurement.displayValue)}<span class="chip ${rating}">${escapeHtml(ratingLabel(strings, rating))}</span>`;
}

export function renderCoreWebVitalsTable(strings: ReportStrings, manifest: AuditManifest): string {
  const scannedPages = manifest.pages.filter((page) => page.pageDir !== undefined);
  if (scannedPages.length === 0) return '';

  const c = strings.coreWebVitals;
  const rows = scannedPages
    .map(
      (page) => `
        <tr>
          <td class="mono url">${escapeHtml(page.url)}</td>
          <td class="num">${cell(strings, page.coreWebVitals?.lcp, LCP_GOOD_MS, LCP_NEEDS_IMPROVEMENT_MS)}</td>
          <td class="num">${cell(strings, page.coreWebVitals?.cls, CLS_GOOD, CLS_NEEDS_IMPROVEMENT)}</td>
          <td class="num">${cell(strings, page.coreWebVitals?.tbt, TBT_GOOD_MS, TBT_NEEDS_IMPROVEMENT_MS)}</td>
        </tr>
      `,
    )
    .join('');

  return `
    <section class="new-page">
      ${renderSectionHeader(c.eyebrow, c.heading)}
      <p class="intro">${escapeHtml(c.intro)} ${escapeHtml(c.inpNote)}</p>
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(c.pageColumnLabel)}</th>
            <th class="num">${escapeHtml(c.lcpColumnLabel)}</th>
            <th class="num">${escapeHtml(c.clsColumnLabel)}</th>
            <th class="num">${escapeHtml(c.tbtColumnLabel)}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="legend">
        <span><span class="chip good">${escapeHtml(c.ratingGoodLabel)}</span> ${escapeHtml(c.legendGoodTemplate)}</span>
        <span><span class="chip mid">${escapeHtml(c.ratingNeedsImprovementLabel)}</span> ${escapeHtml(c.legendMidTemplate)}</span>
        <span><span class="chip poor">${escapeHtml(c.ratingPoorLabel)}</span> ${escapeHtml(c.legendPoorLabel)}</span>
      </div>
    </section>
  `;
}
