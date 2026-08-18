import type { AuditManifest, Finding, ReportLanguage } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';
import { CATEGORY, CATEGORY_ORDER, SEVERITY } from '../design-tokens.js';
import { computeStatistics } from '../statistics.js';

/** Doc §3 section 03 cap: exactly 4 number tiles, 4 severity tiles, 4
 *  category tiles - report.reference.html's numberTiles/severityTiles/
 *  categorySplit. The 4 number tiles are the same first 4 metrics the
 *  pre-redesign 10-tile layout led with. */
function renderNumberTile(value: string, label: string): string {
  return `
    <div style="padding:var(--space-3);background:var(--color-surface);border-radius:var(--radius-md)">
      <div style="font-size:28px;font-family:var(--font-heading);font-weight:500">${value}</div>
      <div style="font-size:11.5px;opacity:0.65;margin-top:4px">${escapeHtml(label)}</div>
    </div>
  `;
}

function renderSeverityTile(label: string, count: string, meaning: string, color: string, bg: string): string {
  return `
    <div style="padding:var(--space-3);border-radius:var(--radius-md);background:${bg}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${color}"></span>
        <span style="font-size:12px;font-weight:500;color:${color}">${escapeHtml(label)}</span>
      </div>
      <div style="font-size:24px;font-family:var(--font-heading)">${count}</div>
      <div style="font-size:11px;opacity:0.65;margin-top:4px">${escapeHtml(meaning)}</div>
    </div>
  `;
}

function renderCategoryTile(label: string, count: string, color: string): string {
  return `
    <div style="padding:var(--space-3);border-radius:var(--radius-md);background:var(--color-surface)">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.02em;color:${color}">${escapeHtml(label)}</div>
      <div style="font-size:22px;font-family:var(--font-heading);margin-top:6px">${count}</div>
    </div>
  `;
}

export function renderStatistics(
  strings: ReportStrings,
  ordinal: number,
  language: ReportLanguage,
  findings: Finding[],
  manifest: AuditManifest,
): string {
  const stats = computeStatistics(findings, manifest);
  const s = strings.statistics;
  const n = (value: number): string => formatNumber(value, language);

  const numberTiles = [
    renderNumberTile(n(stats.pagesScanned), s.pagesTileLabel),
    renderNumberTile(n(stats.totalFindings), s.findingsTileLabel),
    renderNumberTile(n(stats.accessibilityOccurrences), s.accessibilityOccurrencesTileLabel),
    renderNumberTile(`${n(stats.pagesWithCritical)}/${n(stats.pagesScanned)}`, s.pagesWithCriticalTileLabel),
  ].join('');

  const severityMeanings = {
    critical: s.legendCriticalText,
    serious: s.legendSeriousText,
    moderate: s.legendModerateText,
    minor: s.legendMinorText,
  } as const;
  const severityCounts = {
    critical: stats.critical,
    serious: stats.serious,
    moderate: stats.moderate,
    minor: stats.minor,
  } as const;
  const severityLabels = strings.findingsAppendix.severityLabels;
  const severityTiles = (['critical', 'serious', 'moderate', 'minor'] as const)
    .map((severity) =>
      renderSeverityTile(
        severityLabels[severity],
        n(severityCounts[severity]),
        severityMeanings[severity],
        SEVERITY[severity].color,
        SEVERITY[severity].bg,
      ),
    )
    .join('');

  // B9: category tiles sorted descending by count, not the fixed
  // CATEGORY_ORDER used elsewhere (appendix, citation eligibility) - the
  // largest bucket (often performance) was rendering fourth regardless of
  // its size, reading as an arbitrary layout choice to a client.
  const categoryLabels = strings.findingsAppendix.categoryLabels;
  const sortedCategories = [...CATEGORY_ORDER].sort(
    (a, b) => stats.categoryCounts[b] - stats.categoryCounts[a],
  );
  const categoryTiles = sortedCategories
    .map((category) => renderCategoryTile(categoryLabels[category], n(stats.categoryCounts[category]), CATEGORY[category].color))
    .join('');

  const wcagFailText = fillTemplate(s.wcagFailingDescriptionTemplate, { pages: n(stats.pagesWithWcagFailure) });
  const wcagFailCountText = `${n(stats.wcagCriteriaFailingCount)} ${wcagFailText}`;

  return sheet(`
    ${renderSheetHeader(ordinal, s.eyebrow, s.heading)}
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-3);margin-bottom:var(--space-6)">
      ${numberTiles}
    </div>
    <h5>${escapeHtml(s.severityBreakdownHeading)}</h5>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-3);margin-bottom:var(--space-6)">
      ${severityTiles}
    </div>
    <h5>${escapeHtml(s.categoryBreakdownHeading)}</h5>
    <div style="display:grid;grid-template-columns:repeat(${CATEGORY_ORDER.length},1fr);gap:var(--space-3);margin-bottom:var(--space-3)">
      ${categoryTiles}
    </div>
    ${stats.hasBelowThresholdRenderGap ? `<p style="font-size:11px;opacity:0.55;margin-bottom:var(--space-6)">${escapeHtml(s.belowThresholdRenderGapNote)}</p>` : '<div style="margin-bottom:var(--space-6)"></div>'}
    <div class="hr"></div>
    <h5>${escapeHtml(s.wcagFailingHeading)}</h5>
    <p style="font-size:13.5px;opacity:0.85">${escapeHtml(wcagFailCountText)}</p>
  `, '', 'section-03');
}
