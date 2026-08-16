import type { AuditManifest, Finding, ReportLanguage } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';
import { selectRenderedThemes } from './themes.js';

function headCell(label: string): string {
  return `<div style="padding:var(--space-2);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 60%, transparent);border-bottom:1px solid var(--color-divider)">${escapeHtml(label)}</div>`;
}

function cell(html: string): string {
  return `<div style="padding:var(--space-2);border-bottom:1px solid var(--color-divider)">${html}</div>`;
}

/** Pure re-presentation of analysis.themes as a dense, printable grid -
 *  same rank/effort/impact/pages data themes.ts already renders as full
 *  cards, no new computation, so it can never drift out of sync with the
 *  "Ranked priorities" section above it. CSS grid + `.row-atomic` per
 *  report.reference.html, not a real <table> - keeps each row atomic
 *  across a page break (paged.css). */
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
  const sortedThemes = selectRenderedThemes(analysis.themes);
  const levels = strings.themes.effortImpactLevels;

  const rows = sortedThemes
    .map((theme) => {
      const themeFindings = theme.findingIds
        .map((id) => findingsById.get(id))
        .filter((f): f is Finding => f !== undefined);
      const uniquePages = new Set(themeFindings.flatMap((f) => f.pageUrls)).size;

      return `
        <div class="row-atomic">
          ${cell(String(theme.priorityRank))}
          ${cell(escapeHtml(theme.title))}
          ${cell(escapeHtml(levels[theme.effort]))}
          ${cell(escapeHtml(levels[theme.impact]))}
          ${cell(`${formatNumber(uniquePages, language)}/${formatNumber(totalPagesScanned, language)}`)}
        </div>
      `;
    })
    .join('');

  return sheet(`
    ${renderSheetHeader(c.eyebrow, c.heading)}
    <p style="font-size:12px;opacity:0.55;margin-bottom:var(--space-4)">${escapeHtml(c.intro)}</p>
    <div style="display:grid;grid-template-columns:40px 1fr 90px 90px 110px;font-size:14px">
      ${headCell(c.rankColumnLabel)}
      ${headCell(c.priorityColumnLabel)}
      ${headCell(c.effortColumnLabel)}
      ${headCell(c.impactColumnLabel)}
      ${headCell(c.pagesColumnLabel)}
      ${rows}
    </div>
  `);
}
