import type { AuditManifest, Finding, ReportLanguage, Theme } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatFindingIdRefs, formatNumber, renderSectionHeader } from '../html-utils.js';

const TOP_RANK_ACCENT_COUNT = 3;

/** F40: a quick win is low effort with medium or high impact, computed
 *  here in template code from the theme's own effort/impact - not from
 *  analysis.quickWins (which is a findingId list, a different, narrower
 *  concept: individual quick-fix findings, not whole themes). Verified
 *  against docs/report-v2-prototype-haaitza-fr.html: exactly the four
 *  low-effort themes (ranks 3, 4, 6, 7) carry the badge there. */
export function isQuickWinTheme(theme: Pick<Theme, 'effort' | 'impact'>): boolean {
  return theme.effort === 'low' && theme.impact !== 'low';
}

function renderScale(strings: ReportStrings, level: 'low' | 'medium' | 'high'): string {
  const filledCount = level === 'low' ? 1 : level === 'medium' ? 2 : 3;
  const dots = [0, 1, 2]
    .map((i) => `<i class="d${i < filledCount ? ' f' : ''}"></i>`)
    .join('');
  return `<span class="scale">${dots}<b>${escapeHtml(strings.themes.effortImpactLevels[level])}</b></span>`;
}

function pageWord(strings: ReportStrings, count: number): string {
  return count === 1 ? strings.findingsAppendix.pageSingular : strings.findingsAppendix.pagePlural;
}

function renderTheme(
  strings: ReportStrings,
  language: ReportLanguage,
  theme: Theme,
  findingsById: Map<string, Finding>,
  totalPagesScanned: number,
): string {
  const t = strings.themes;
  const themeFindings = theme.findingIds.map((id) => findingsById.get(id)).filter((f): f is Finding => f !== undefined);
  const uniquePages = new Set(themeFindings.flatMap((f) => f.pageUrls)).size;
  const totalOccurrences = themeFindings.reduce((sum, f) => sum + f.occurrences, 0);

  const topRankClass = theme.priorityRank <= TOP_RANK_ACCENT_COUNT ? ' theme-top' : '';
  const quickWinBadge = isQuickWinTheme(theme)
    ? `<span class="badge qw">&#9733;&nbsp;${escapeHtml(t.quickWinBadgeLabel)}</span>`
    : '';

  const isNonConformant = theme.legalRelevance !== undefined;
  const conformityValue = isNonConformant
    ? `<span class="v vnc">${escapeHtml(t.conformityNonConformant)}</span>`
    : `<span class="v">${escapeHtml(t.conformityNotApplicable)}</span>`;

  const legalBox = theme.legalRelevance
    ? `<div class="legal"><span class="legal-tag">${escapeHtml(t.legalTagLabel)}</span><p>${escapeHtml(theme.legalRelevance)}</p></div>`
    : '';

  const actions = theme.recommendedActions.map((action) => `<li>${escapeHtml(action)}</li>`).join('');

  const pagesText = fillTemplate(t.pagesOfTotalTemplate, {
    pages: formatNumber(uniquePages, language),
    pageWord: pageWord(strings, uniquePages),
    totalPages: formatNumber(totalPagesScanned, language),
  });
  const occurrencesText =
    totalOccurrences !== uniquePages
      ? ` · ${formatNumber(totalOccurrences, language)} ${totalOccurrences === 1 ? strings.findingsAppendix.occurrenceSingular : strings.findingsAppendix.occurrencePlural}`
      : '';

  return `
    <article class="theme keep${topRankClass}">
      <div class="theme-head">
        <span class="rank">${theme.priorityRank}</span>
        <div class="theme-title">
          <span class="eyebrow">${escapeHtml(strings.findingsAppendix.categoryLabels[theme.category])}</span>
          <h3>${escapeHtml(theme.title)}</h3>
        </div>
        <div class="theme-badges">${quickWinBadge}</div>
      </div>
      <div class="theme-meta">
        <div class="m"><span class="k">${escapeHtml(t.effortLabel)}</span>${renderScale(strings, theme.effort)}</div>
        <div class="m"><span class="k">${escapeHtml(t.impactLabel)}</span>${renderScale(strings, theme.impact)}</div>
        <div class="m"><span class="k">${escapeHtml(t.conformityLabel)}</span>${conformityValue}</div>
      </div>
      ${legalBox}
      <p class="impact">${escapeHtml(theme.businessImpact)}</p>
      ${actions ? `<ol class="actions">${actions}</ol>` : ''}
      <div class="theme-foot">
        <span>${escapeHtml(pagesText)}${escapeHtml(occurrencesText)}</span>
        <span class="refs">${escapeHtml(t.refsLabel)}: ${escapeHtml(formatFindingIdRefs(theme.findingIds))}</span>
      </div>
    </article>
  `;
}

export function renderThemes(
  strings: ReportStrings,
  analysis: StoredAnalysis,
  findings: Finding[],
  manifest: AuditManifest,
): string {
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const totalPagesScanned = manifest.pages.filter((page) => page.status === 'visited').length;
  const sortedThemes = [...analysis.themes].sort((a, b) => a.priorityRank - b.priorityRank);
  const themeBlocks = sortedThemes
    .map((theme) => renderTheme(strings, analysis.language, theme, findingsById, totalPagesScanned))
    .join('');

  return `
    <section class="new-page">
      ${renderSectionHeader(strings.themes.eyebrow, fillTemplate(strings.themes.headingTemplate, { count: sortedThemes.length }))}
      ${themeBlocks}
    </section>
  `;
}
