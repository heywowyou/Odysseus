import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, renderSectionHeader } from '../html-utils.js';
import { isQuickWinTheme } from './themes.js';

const TOP_THEME_COUNT = 3;

/** B14: this used to be its own top-level section ("Par où commencer")
 *  that independently restated theme.businessImpact, duplicating what
 *  themes.ts already says in full. Folded into the executive summary
 *  (docs/report-v2-prototype-haaitza-fr.html section 2) and reduced to a
 *  bare title-plus-rank reference - the theme card itself is the single
 *  place its prose lives now. */
function renderWhatToDoFirst(strings: ReportStrings, themes: StoredAnalysis['themes']): string {
  const topThemes = [...themes].sort((a, b) => a.priorityRank - b.priorityRank).slice(0, TOP_THEME_COUNT);
  if (topThemes.length === 0) return '';

  const e = strings.executiveSummary;
  const items = topThemes
    .map(
      (theme) =>
        `<li><b>${escapeHtml(theme.title)}</b>. ${escapeHtml(fillTemplate(e.seeThemeTemplate, { rank: theme.priorityRank }))}</li>`,
    )
    .join('');

  return `
    <h3 style="margin-top:6mm">${escapeHtml(e.whatToDoFirstHeading)}</h3>
    <ol class="actions" style="font-size:10.5pt">${items}</ol>
  `;
}

/** F40: quick wins carry a badge, computed the same way as the per-theme
 *  badge (themes.ts's isQuickWinTheme) so this strip and the cards it
 *  summarizes can never disagree. */
function renderQuickWinsStrip(strings: ReportStrings, themes: StoredAnalysis['themes']): string {
  const quickWinRanks = [...themes]
    .filter(isQuickWinTheme)
    .sort((a, b) => a.priorityRank - b.priorityRank)
    .map((theme) => theme.priorityRank);
  if (quickWinRanks.length === 0) return '';

  const e = strings.executiveSummary;
  return `
    <div class="qwins">
      <span class="qwin">&#9733; ${escapeHtml(e.quickWinsLabel)} : ${quickWinRanks.join(', ')}, ${escapeHtml(e.quickWinsSuffix)}</span>
    </div>
  `;
}

export function renderExecutiveSummary(strings: ReportStrings, analysis: StoredAnalysis): string {
  return `
    <section class="new-page">
      ${renderSectionHeader(strings.executiveSummary.eyebrow, strings.executiveSummary.heading)}
      <p>${escapeHtml(analysis.executiveSummary)}</p>
      ${renderWhatToDoFirst(strings, analysis.themes)}
      ${renderQuickWinsStrip(strings, analysis.themes)}
    </section>
  `;
}
