import type { AuditManifest, Finding, ReportLanguage } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatNumber, renderSectionHeader } from '../html-utils.js';
import { SEVERITY_GLYPH } from '../severity-badge.js';
import { renderSeverityBadge } from '../severity-badge.js';
import { computeStatistics } from '../statistics.js';

function renderTile(value: string, label: string, extraClass = ''): string {
  return `<div class="tile ${extraClass}"><b>${value}</b><span>${escapeHtml(label)}</span></div>`;
}

export function renderStatistics(
  strings: ReportStrings,
  language: ReportLanguage,
  findings: Finding[],
  manifest: AuditManifest,
): string {
  const stats = computeStatistics(findings, manifest);
  const s = strings.statistics;
  const n = (value: number): string => formatNumber(value, language);

  const tiles = [
    renderTile(n(stats.pagesScanned), s.pagesTileLabel),
    renderTile(n(stats.totalFindings), s.findingsTileLabel),
    renderTile(n(stats.accessibilityOccurrences), s.accessibilityOccurrencesTileLabel),
    renderTile(`${n(stats.pagesWithCritical)}/${n(stats.pagesScanned)}`, s.pagesWithCriticalTileLabel),
    renderTile(
      `<span class="glyph">${SEVERITY_GLYPH.critical}</span>${n(stats.critical)}`,
      s.criticalTileLabel,
      't-crit',
    ),
    renderTile(
      `<span class="glyph">${SEVERITY_GLYPH.serious}</span>${n(stats.serious)}`,
      s.seriousTileLabel,
      't-maj',
    ),
    renderTile(
      `<span class="glyph">${SEVERITY_GLYPH.moderate}</span>${n(stats.moderate)}`,
      s.moderateTileLabel,
      't-mod',
    ),
    renderTile(`<span class="glyph">${SEVERITY_GLYPH.minor}</span>${n(stats.minor)}`, s.minorTileLabel, 't-min'),
    renderTile(
      n(stats.wcagCriteriaFailingCount),
      fillTemplate(s.wcagFailingDescriptionTemplate, { pages: n(stats.pagesWithWcagFailure) }),
      't-law',
    ),
    renderTile(n(stats.accessibilityCount), s.accessibilityCategoryTileLabel),
    renderTile(n(stats.seoRenderingCount), s.seoRenderingCategoryTileLabel),
  ].join('');

  const legend = `
    <div class="legend">
      <span>${renderSeverityBadge(strings, 'critical')} ${escapeHtml(s.legendCriticalText)}</span>
      <span>${renderSeverityBadge(strings, 'serious')} ${escapeHtml(s.legendSeriousText)}</span>
      <span>${renderSeverityBadge(strings, 'moderate')} ${escapeHtml(s.legendModerateText)}</span>
      <span>${renderSeverityBadge(strings, 'minor')} ${escapeHtml(s.legendMinorText)}</span>
    </div>
  `;

  const intro = fillTemplate(s.introTemplate, { pages: n(stats.pagesScanned), findings: n(stats.totalFindings) });

  return `
    <section class="new-page">
      ${renderSectionHeader(s.eyebrow, s.heading)}
      <p class="intro">${escapeHtml(intro)}</p>
      <div class="tiles">${tiles}</div>
      ${legend}
    </section>
  `;
}
