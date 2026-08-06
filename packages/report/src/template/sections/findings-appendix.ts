import type { AuditManifest, Finding, FindingCategory, ReportLanguage } from '@odysseus/core';
import { buildMissingPercentIndex, classifyDiversion } from '@odysseus/llm';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, formatNumber, renderSectionHeader } from '../html-utils.js';
import { renderSeverityBadge } from '../severity-badge.js';
import {
  aggregateMinorFindings,
  groupAppendix,
  APPENDIX_GROUP_KEEP_THRESHOLD,
  type MinorFindingSummary,
  type RuleGroup,
} from '../appendix-grouping.js';

/** Performance last: it is almost entirely the minor, low-visual-weight
 *  findings this refactor exists to de-emphasize (B11). Rendering last,
 *  not skipped: every category still gets its full section. */
const CATEGORY_ORDER: FindingCategory[] = ['accessibility', 'seo', 'rendering', 'performance'];

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

function renderSubTableRow(language: ReportLanguage, finding: Finding): string {
  const selector = finding.elements[0]?.selector ?? '';
  return `
    <tr>
      <td class="mono fid">${escapeHtml(finding.findingId)}</td>
      <td class="num">${formatNumber(finding.pageUrls.length, language)}</td>
      <td class="num">${formatNumber(finding.occurrences, language)}</td>
      <td class="mono sel">${escapeHtml(selector)}</td>
    </tr>
  `;
}

function renderRuleGroup(
  strings: ReportStrings,
  language: ReportLanguage,
  group: RuleGroup,
  isFullyDiverted: boolean,
): string {
  const a = strings.findingsAppendix;
  const keepClass = group.findings.length <= APPENDIX_GROUP_KEEP_THRESHOLD ? ' keep' : '';
  const representativeTitle = group.findings[0]?.title ?? group.ruleId;
  const sortedFindings = [...group.findings].sort((x, y) => x.findingId.localeCompare(y.findingId));
  const rows = sortedFindings.map((finding) => renderSubTableRow(language, finding)).join('');
  const obsTag = isFullyDiverted
    ? `<span class="obs-tag">${escapeHtml(a.observationsCrossRefLabel)}</span>`
    : '';

  return `
    <div class="rule-group${keepClass}">
      <div class="rule-head">
        ${renderSeverityBadge(strings, group.severity)}
        <span class="rule-title">${escapeHtml(representativeTitle)}</span>
        <span class="mono rule-code">${escapeHtml(group.ruleId)}</span>
        ${obsTag}
        <span class="rule-sum">${renderRuleSum(strings, language, group)}</span>
      </div>
      <table class="sub">
        <thead>
          <tr>
            <th>${escapeHtml(a.findingIdColumnLabel)}</th>
            <th class="num">${escapeHtml(a.pagesColumnLabel)}</th>
            <th class="num">${escapeHtml(a.occurrencesColumnLabel)}</th>
            <th>${escapeHtml(a.selectorColumnLabel)}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
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
        <tr>
          <td class="mono">${escapeHtml(s.ruleId)}</td>
          <td class="num">${formatNumber(s.findingCount, language)}</td>
          <td class="num">${formatNumber(s.maxPages, language)}</td>
          <td class="num">${formatNumber(s.totalOccurrences, language)}</td>
        </tr>
      `,
    )
    .join('');

  return `
    <div class="rule-group">
      <div class="rule-head">
        ${renderSeverityBadge(strings, 'minor')}
        <span class="rule-title">${escapeHtml(a.minorAggregateTitle)}</span>
        <span class="rule-sum">${escapeHtml(`${formatNumber(totalFindings, language)} ${pluralize(totalFindings, a.findingSingular, a.findingPlural)} ${a.minorAggregateGroupedSuffix}`)}</span>
      </div>
      <p class="note">${escapeHtml(a.minorAggregateNote)}</p>
      <table class="sub">
        <thead>
          <tr>
            <th>${escapeHtml(a.ruleColumnLabel)}</th>
            <th class="num">${escapeHtml(a.findingPlural)}</th>
            <th class="num">${escapeHtml(a.pagesMaxColumnLabel)}</th>
            <th class="num">${escapeHtml(a.occurrencesColumnLabel)}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderCategorySection(
  strings: ReportStrings,
  language: ReportLanguage,
  category: FindingCategory,
  categoryFindings: Finding[],
  missingPercentByUrl: ReadonlyMap<string, number>,
  isFirstRendered: boolean,
): string {
  if (categoryFindings.length === 0) return '';

  const regular = categoryFindings.filter((f) => f.severity !== 'minor');
  const minor = categoryFindings.filter((f) => f.severity === 'minor');
  const groups = groupAppendix(regular);
  const minorSummaries = aggregateMinorFindings(minor);

  const groupBlocks = groups
    .map((group) => {
      const isFullyDiverted = group.findings.every(
        (f) => classifyDiversion(f, missingPercentByUrl) !== null,
      );
      return renderRuleGroup(strings, language, group, isFullyDiverted);
    })
    .join('');
  const minorBlock = renderMinorAggregateGroup(strings, language, minorSummaries);

  const a = strings.findingsAppendix;
  const totalCount = categoryFindings.length;
  const headingClass = isFirstRendered ? '' : ' class="new-page"';
  const heading = `${escapeHtml(a.categoryLabels[category])} · ${formatNumber(totalCount, language)} ${escapeHtml(pluralize(totalCount, a.findingSingular, a.findingPlural))}`;

  return `
    <h3${headingClass} style="margin-top:5mm">${heading}</h3>
    ${groupBlocks}
    ${minorBlock}
  `;
}

export function renderFindingsAppendix(
  strings: ReportStrings,
  language: ReportLanguage,
  findings: Finding[],
  manifest: AuditManifest,
): string {
  const missingPercentByUrl = buildMissingPercentIndex(manifest);
  let firstRendered = true;

  const sections = CATEGORY_ORDER.map((category) => {
    const categoryFindings = findings.filter((finding) => finding.category === category);
    if (categoryFindings.length === 0) return '';
    const section = renderCategorySection(strings, language, category, categoryFindings, missingPercentByUrl, firstRendered);
    firstRendered = false;
    return section;
  }).join('');

  return `
    <section class="new-page">
      ${renderSectionHeader(strings.findingsAppendix.eyebrow, strings.findingsAppendix.heading)}
      <p class="intro">${escapeHtml(strings.findingsAppendix.intro)}</p>
      ${sections}
    </section>
  `;
}
