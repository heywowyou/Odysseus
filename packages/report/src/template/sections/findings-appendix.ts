import type { AuditManifest, Finding, FindingCategory, ReportLanguage, StatSector } from '@odysseus/core';
import { selectReferenceStats } from '@odysseus/core';
import { buildMissingPercentIndex, classifyDiversion } from '@odysseus/llm';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';
import { renderSeverityBadge } from '../severity-badge.js';
import { CATEGORY, CATEGORY_ORDER } from '../design-tokens.js';
import { renderReferenceStatNote } from '../reference-stat-note.js';
import {
  aggregateMinorFindings,
  groupAppendix,
  APPENDIX_GROUP_KEEP_THRESHOLD,
  type MinorFindingSummary,
  type RuleGroup,
} from '../appendix-grouping.js';

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function renderRuleSum(strings: ReportStrings, language: ReportLanguage, group: RuleGroup): string {
  const a = strings.findingsAppendix;
  const parts = [
    `${formatNumber(group.findings.length, language)} ${pluralize(group.findings.length, a.findingSingular, a.findingPlural)}`,
    `${formatNumber(group.totalOccurrences, language)} ${pluralize(group.totalOccurrences, a.occurrenceSingular, a.occurrencePlural)}`,
    `${a.upToLabel} ${formatNumber(group.maxPages, language)} ${pluralize(group.maxPages, a.pageSingular, a.pagePlural)}`,
  ];
  if (group.wcagCriteria.length > 0) {
    parts.push(`${a.wcagLabel} ${group.wcagCriteria.join(', ')}`);
  }
  return escapeHtml(parts.join(' · '));
}

function headCell(label: string): string {
  return `<div style="padding:6px var(--space-2);font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 55%, transparent);border-bottom:1px solid var(--color-divider)">${escapeHtml(label)}</div>`;
}

function cell(html: string, extra = ''): string {
  return `<div style="padding:6px var(--space-2);border-bottom:1px solid var(--color-divider);${extra}">${html}</div>`;
}

function renderSubTableRow(language: ReportLanguage, finding: Finding): string {
  const selector = finding.elements[0]?.selector ?? '';
  return `
    <div class="row-atomic">
      ${cell(escapeHtml(finding.findingId), 'font-family:ui-monospace,monospace;overflow-wrap:anywhere;word-break:break-word')}
      ${cell(formatNumber(finding.pageUrls.length, language))}
      ${cell(formatNumber(finding.occurrences, language))}
      ${cell(escapeHtml(selector), 'font-family:ui-monospace,monospace;overflow-wrap:anywhere;word-break:break-word;opacity:0.8')}
    </div>
  `;
}

function renderRuleGroup(
  strings: ReportStrings,
  language: ReportLanguage,
  group: RuleGroup,
  isFullyDiverted: boolean,
): string {
  const a = strings.findingsAppendix;
  const representativeTitle = group.findings[0]?.title ?? group.ruleId;
  const sortedFindings = [...group.findings].sort((x, y) => x.findingId.localeCompare(y.findingId));
  const rows = sortedFindings.map((finding) => renderSubTableRow(language, finding)).join('');
  const obsTag = isFullyDiverted
    ? `<span class="obs-tag" style="font-size:11px;opacity:0.55">${escapeHtml(a.observationsCrossRefLabel)}</span>`
    : '';
  // paged.css's .appendix-group class carries an unconditional
  // break-inside: avoid, correct for a small group but wrong for a large
  // one (a 40-row group forced atomic would blank most of a page - see
  // appendix-grouping.ts's own APPENDIX_GROUP_KEEP_THRESHOLD comment).
  // Only groups at or under that threshold get the class; larger ones use
  // a plain wrapper and are allowed to flow across the page break.
  const wrapperClass = group.findings.length <= APPENDIX_GROUP_KEEP_THRESHOLD ? 'appendix-group' : '';

  return `
    <div class="${wrapperClass}" style="margin-bottom:var(--space-4)">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
        ${renderSeverityBadge(strings, group.severity)}
        <span style="font-size:14px;font-weight:500">${escapeHtml(representativeTitle)}</span>
        <span class="mono rule-code" style="font-size:10px;opacity:0.5">${escapeHtml(group.ruleId)}</span>
        ${obsTag}
        <span style="font-size:11px;opacity:0.6">${renderRuleSum(strings, language, group)}</span>
      </div>
      <div style="display:grid;grid-template-columns:80px 90px 100px 1fr;font-size:12.5px">
        ${headCell(a.findingIdColumnLabel)}
        ${headCell(a.pagesColumnLabel)}
        ${headCell(a.occurrencesColumnLabel)}
        ${headCell(a.selectorColumnLabel)}
        ${rows}
      </div>
    </div>
  `;
}

function renderMinorAggregateGroup(
  strings: ReportStrings,
  language: ReportLanguage,
  summaries: MinorFindingSummary[],
): string {
  if (summaries.length === 0) return '';
  const a = strings.findingsAppendix;
  const totalFindings = summaries.reduce((sum, s) => sum + s.findingCount, 0);

  const rows = summaries
    .map(
      (s) => `
        <div class="row-atomic">
          ${cell(escapeHtml(s.ruleId), 'font-family:ui-monospace,monospace')}
          ${cell(formatNumber(s.findingCount, language))}
          ${cell(formatNumber(s.maxPages, language))}
          ${cell(formatNumber(s.totalOccurrences, language))}
        </div>
      `,
    )
    .join('');

  return `
    <div style="margin-top:var(--space-3)">
      <div style="font-size:12px;opacity:0.6;margin-bottom:6px">${escapeHtml(`${a.minorAggregateTitle} - ${formatNumber(totalFindings, language)} ${pluralize(totalFindings, a.findingSingular, a.findingPlural)} ${a.minorAggregateGroupedSuffix}`)}</div>
      <p style="font-size:11px;opacity:0.5">${escapeHtml(a.minorAggregateNote)}</p>
      <div style="display:grid;grid-template-columns:1fr 90px 90px 110px;font-size:12.5px">
        ${headCell(a.ruleColumnLabel)}
        ${headCell(a.findingPlural)}
        ${headCell(a.pagesMaxColumnLabel)}
        ${headCell(a.occurrencesColumnLabel)}
        ${rows}
      </div>
    </div>
  `;
}

/** Geo findings never reach the curated themes section (Theme.category's
 *  locked schema has no 'geo' option - see CLAUDE.md trade-off 16), so
 *  this is the only place a reader sees geo business-impact context. The
 *  citation is quarantined with an "emerging" badge per the source
 *  research doc's Stage 3 recommendation - both curated geo stat rows
 *  are confidence:'emerging' today (8.5b's deliberate Princeton
 *  downgrade), so the badge is driven by that field, not hardcoded here. */
function renderGeoCitationBlock(
  strings: ReportStrings,
  language: ReportLanguage,
  sector: StatSector,
  /** B1: same shared, mutated-in-place Set themes.ts uses, so a
   *  statistic already cited on a theme card never repeats here (or vice
   *  versa) - one citation per statistic across the whole document. */
  citedStatIds: Set<string>,
): string {
  const top = selectReferenceStats('geo', sector).find((stat) => !citedStatIds.has(stat.id));
  if (!top) return '';
  citedStatIds.add(top.id);
  return renderReferenceStatNote(
    strings.themes.impactCitationLabel,
    top,
    language,
    strings.findingsAppendix.geoEmergingLabel,
  );
}

function renderCategorySection(
  strings: ReportStrings,
  language: ReportLanguage,
  category: FindingCategory,
  categoryFindings: Finding[],
  missingPercentByUrl: ReadonlyMap<string, number>,
  sector: StatSector,
  citedStatIds: Set<string>,
): string {
  if (categoryFindings.length === 0) return '';

  const regular = categoryFindings.filter((f) => f.severity !== 'minor');
  const minor = categoryFindings.filter((f) => f.severity === 'minor');
  const groups = groupAppendix(regular);
  const minorSummaries = aggregateMinorFindings(minor);

  const groupBlocks = groups
    .map((group) => {
      const isFullyDiverted = group.findings.every((f) => classifyDiversion(f, missingPercentByUrl) !== null);
      return renderRuleGroup(strings, language, group, isFullyDiverted);
    })
    .join('');
  const minorBlock = renderMinorAggregateGroup(strings, language, minorSummaries);
  const citationBlock = category === 'geo' ? renderGeoCitationBlock(strings, language, sector, citedStatIds) : '';

  return `
    <div style="margin-bottom:var(--space-8)">
      <h4 style="color:${CATEGORY[category].color}">${escapeHtml(strings.findingsAppendix.categoryLabels[category])}</h4>
      ${citationBlock}
      ${groupBlocks}
      ${minorBlock}
    </div>
  `;
}

export function renderFindingsAppendix(
  strings: ReportStrings,
  language: ReportLanguage,
  findings: Finding[],
  manifest: AuditManifest,
  sector: StatSector,
  /** B1: see themes.ts's renderThemes - same shared Set, passed through
   *  from render-html.ts so a statistic already cited on a theme card
   *  never repeats in the geo appendix section, and vice versa. Defaults
   *  to a fresh Set for callers (existing tests) that don't need
   *  cross-section dedupe. */
  citedStatIds: Set<string> = new Set(),
): string {
  const missingPercentByUrl = buildMissingPercentIndex(manifest);

  const sections = CATEGORY_ORDER.map((category) => {
    const categoryFindings = findings.filter((finding) => finding.category === category);
    return renderCategorySection(strings, language, category, categoryFindings, missingPercentByUrl, sector, citedStatIds);
  }).join('');

  return sheet(`
    ${renderSheetHeader(strings.findingsAppendix.eyebrow, strings.findingsAppendix.heading)}
    <p style="font-size:12px;opacity:0.55;margin-bottom:var(--space-6)">${escapeHtml(strings.findingsAppendix.intro)}</p>
    ${sections}
  `, '', 'section-12');
}
