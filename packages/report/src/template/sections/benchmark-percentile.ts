import type { AuditManifest, ReportLanguage } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';

/** Milestone 10. `manifest.benchmarkPercentile` is absent until the
 *  benchmark cohort's frozen scores exist (build slice 3) and a
 *  report-generation step has compared this audit against them - see
 *  manifest.ts's own doc comment on that field. This section renders
 *  nothing for every audit until then, which is the correct behaviour:
 *  a report must never claim a comparison that was never made. */
export function hasBenchmarkPercentile(manifest: AuditManifest): boolean {
  return manifest.benchmarkPercentile !== undefined;
}

/** A deterministic splice, never an LLM sentence (design doc, "In-report
 *  percentile section"): every number here comes straight from
 *  `manifest.benchmarkPercentile`, computed by
 *  `@odysseus/core`'s `computeSiteBenchmarkPercentile`. */
export function renderBenchmarkPercentile(
  strings: ReportStrings,
  ordinal: number,
  language: ReportLanguage,
  manifest: AuditManifest,
): string {
  const outcome = manifest.benchmarkPercentile;
  const b = strings.benchmarkPercentile;
  if (!outcome) return '';

  if (outcome.kind === 'too-small') {
    return sheet(
      `
      ${renderSheetHeader(ordinal, b.eyebrow, b.heading, 'var(--space-2)')}
      <p style="font-size:13.5px;opacity:0.85;max-width:var(--measure-prose)">${escapeHtml(b.tooSmallBody)}</p>
    `,
      '',
      'section-15',
    );
  }

  const body = fillTemplate(b.scoredBodyTemplate, {
    percentile: formatNumber(Math.round(outcome.percentile), language),
    cohortSize: formatNumber(outcome.cohortSize, language),
  });
  const dateRange = fillTemplate(b.scanDateRangeTemplate, {
    earliest: outcome.scanDateRange.earliest,
    latest: outcome.scanDateRange.latest,
  });

  return sheet(
    `
    ${renderSheetHeader(ordinal, b.eyebrow, b.heading, 'var(--space-2)')}
    <p style="font-size:13.5px;opacity:0.85;max-width:var(--measure-prose)">${escapeHtml(body)}</p>
    <p style="font-size:11px;opacity:0.55;margin-top:var(--space-2)">${escapeHtml(dateRange)}</p>
  `,
    '',
    'section-15',
  );
}
