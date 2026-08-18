import type { AuditManifest, Finding, FindingCategory, ReportLanguage, StatSector } from '@odysseus/core';
import { selectReferenceStats } from '@odysseus/core';
import { buildMissingPercentIndex, classifyDiversion } from '@odysseus/llm';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';
import { renderSeverityBadge } from '../severity-badge.js';
import { CATEGORY, CATEGORY_ORDER } from '../design-tokens.js';
import { renderReferenceStatNote } from '../reference-stat-note.js';
import { groupAppendix, APPENDIX_GROUP_KEEP_THRESHOLD, type RuleGroup } from '../appendix-grouping.js';
import { RULE_TRANSLATIONS_FR } from '../rule-translations.js';

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
  return `<div style="padding:6px var(--space-2);font-size:10px;letter-spacing:0.02em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 55%, transparent);border-bottom:1px solid var(--color-divider)">${escapeHtml(label)}</div>`;
}

function cell(html: string, extra = ''): string {
  return `<div style="padding:6px var(--space-2);border-bottom:1px solid var(--color-divider);${extra}">${html}</div>`;
}

/** item 25: every finding row states a page count ("9 pages") and never
 *  the actual URLs - the largest gap between what a paid full-audit
 *  client is promised (docs/odysseus-project-brief-v2.md 3.3: "Full page
 *  and selector detail for every finding") and what the appendix
 *  delivers. Rendered as a full-width line under each finding's own row
 *  (grid-column spans every column of the 4-column layout above it), a
 *  plain comma-joined list rather than a second sub-table - the selector
 *  cell already carries the .url-cell wrapping rules (paged.css) this
 *  reuses. */
function renderPageUrlList(strings: ReportStrings, finding: Finding): string {
  if (finding.pageUrls.length === 0) return '';
  const a = strings.findingsAppendix;
  const urls = [...finding.pageUrls].sort().join(', ');
  return `<div class="url-cell" style="grid-column:1 / -1;padding:0 var(--space-2) 6px;font-size:10.5px;opacity:0.6">${escapeHtml(a.pagesColumnLabel)} : ${escapeHtml(urls)}</div>`;
}

function renderSubTableRow(strings: ReportStrings, language: ReportLanguage, finding: Finding): string {
  const selector = finding.elements[0]?.selector ?? '';
  return `
    <div class="row-atomic">
      ${cell(escapeHtml(finding.findingId), 'font-family:ui-monospace,monospace;overflow-wrap:anywhere;word-break:break-word')}
      ${cell(formatNumber(finding.pageUrls.length, language))}
      ${cell(formatNumber(finding.occurrences, language))}
      ${cell(escapeHtml(selector), 'font-family:ui-monospace,monospace;overflow-wrap:anywhere;word-break:break-word;opacity:0.8')}
      ${renderPageUrlList(strings, finding)}
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
  // item 38 [REGRESSION]: rule titles and codes rendered in English inside
  // a French report - translated here for fr, left as the scanner's own
  // English title for en (already correct in that language). The gloss
  // (a short plain-language explanation) is fr-only, shown under the
  // machine-readable rule code for the cryptic "-insight" style codes a
  // non-technical reader can't otherwise decode.
  const translation = language === 'fr' ? RULE_TRANSLATIONS_FR[group.ruleId] : undefined;
  const representativeTitle = translation?.label ?? group.findings[0]?.title ?? group.ruleId;
  const gloss = translation
    ? `<span style="font-size:10px;opacity:0.5">- ${escapeHtml(translation.gloss)}</span>`
    : '';
  const sortedFindings = [...group.findings].sort((x, y) => x.findingId.localeCompare(y.findingId));
  const rows = sortedFindings.map((finding) => renderSubTableRow(strings, language, finding)).join('');
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
        ${gloss}
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

  // item 26: every severity groups and renders through the same full-
  // detail path now - see appendix-grouping.ts's groupAppendix comment.
  const groups = groupAppendix(categoryFindings);

  const groupBlocks = groups
    .map((group) => {
      const isFullyDiverted = group.findings.every((f) => classifyDiversion(f, missingPercentByUrl) !== null);
      return renderRuleGroup(strings, language, group, isFullyDiverted);
    })
    .join('');
  // item 40: a travel-industry AI-usage statistic (Phocuswright, 56%)
  // used to render right under the section h4, ahead of every finding
  // row - reading as a section-wide headline stat rather than context
  // for the one minor finding it actually supports. Rendered after the
  // finding rows instead, at reduced size/opacity, so it reads as a
  // footnote to what it's citing rather than a lead-in the reader hits
  // before any actual finding.
  const citationBlock =
    category === 'geo'
      ? `<div style="font-size:11px;opacity:0.8;margin-top:var(--space-2)">${renderGeoCitationBlock(strings, language, sector, citedStatIds)}</div>`
      : '';

  return `
    <div style="margin-bottom:var(--space-8)">
      <h4 style="color:${CATEGORY[category].color}">${escapeHtml(strings.findingsAppendix.categoryLabels[category])}</h4>
      ${groupBlocks}
      ${citationBlock}
    </div>
  `;
}

export function renderFindingsAppendix(
  strings: ReportStrings,
  ordinal: number,
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

  // item 29: the list of crawled URLs was never printed anywhere - the
  // client had no way to verify the scope they paid for beyond a bare
  // count on the cover. Belongs here rather than a dedicated page (doc's
  // own acceptance check: "doesn't need its own full page"), and directly
  // supports item 25 (every finding's own page list can be cross-checked
  // against the full crawled set) and item 28 (confirms which pages were
  // actually explored).
  const crawledPages = manifest.pages.filter((page) => page.status === 'visited').map((page) => page.url).sort();
  const crawledPagesBlock =
    crawledPages.length > 0
      ? `
        <div style="margin-bottom:var(--space-8)">
          <h4>${escapeHtml(fillTemplate(strings.findingsAppendix.crawledPagesHeadingTemplate, { count: crawledPages.length }))}</h4>
          <p class="url-cell" style="font-size:11px;opacity:0.65;max-width:none">${escapeHtml(crawledPages.join(', '))}</p>
        </div>
      `
      : '';

  return sheet(`
    ${renderSheetHeader(ordinal, strings.findingsAppendix.eyebrow, strings.findingsAppendix.heading)}
    <p style="font-size:12px;opacity:0.55;margin-bottom:var(--space-6)">${escapeHtml(strings.findingsAppendix.intro)}</p>
    ${crawledPagesBlock}
    ${sections}
  `, 'sheet-standalone', 'section-12');
}
