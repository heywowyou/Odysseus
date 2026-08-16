import type { AuditManifest, Finding, ReportLanguage } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, formatNumber, renderSectionHeader } from '../html-utils.js';

/** Pure re-presentation of analysis.themes as a dense, printable table -
 *  same rank/effort/impact/pages data themes.ts already renders as full
 *  cards, no new computation, so it can never drift out of sync with the
 *  "Ranked priorities" section above it. */
export function renderChecklist(
  strings: ReportStrings,
  language: ReportLanguage,
  analysis: StoredAnalysis,
  findings: Finding[],
  manifest: AuditManifest,
): string {
  const c = strings.checklist;
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const totalPagesScanned = manifest.pages.filter((page) => page.status === 'visited').length;
  const sortedThemes = [...analysis.themes].sort((a, b) => a.priorityRank - b.priorityRank);

  const rows = sortedThemes
    .map((theme) => {
      const themeFindings = theme.findingIds
        .map((id) => findingsById.get(id))
        .filter((f): f is Finding => f !== undefined);
      const uniquePages = new Set(themeFindings.flatMap((f) => f.pageUrls)).size;
      const levels = strings.themes.effortImpactLevels;

      return `
        <tr>
          <td class="num">${theme.priorityRank}</td>
          <td>${escapeHtml(theme.title)}</td>
          <td>${escapeHtml(levels[theme.effort])}</td>
          <td>${escapeHtml(levels[theme.impact])}</td>
          <td class="num">${formatNumber(uniquePages, language)} / ${formatNumber(totalPagesScanned, language)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <section class="new-page">
      ${renderSectionHeader(c.eyebrow, c.heading)}
      <p class="intro">${escapeHtml(c.intro)}</p>
      <table>
        <thead>
          <tr>
            <th class="num">${escapeHtml(c.rankColumnLabel)}</th>
            <th>${escapeHtml(c.priorityColumnLabel)}</th>
            <th>${escapeHtml(c.effortColumnLabel)}</th>
            <th>${escapeHtml(c.impactColumnLabel)}</th>
            <th class="num">${escapeHtml(c.pagesColumnLabel)}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}
