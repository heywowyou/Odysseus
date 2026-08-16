import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, renderSheetHeader, sheet } from '../html-utils.js';

const TOP_THEME_COUNT = 3;

/** "Par où commencer" card: a numbered circle plus the theme's own title,
 *  jumping to the theme card by id (themes.ts sets id="theme-{rank}").
 *  Doc §3 section 01 cap: 3 links, prose above. No independent business-
 *  impact sentence here anymore - the theme card is the one place that
 *  prose lives (report.reference.html's exec-summary jump list is title
 *  + rank badge + "Voir ->" only, nothing else). */
function renderStartHere(strings: ReportStrings, themes: StoredAnalysis['themes']): string {
  const topThemes = [...themes].sort((a, b) => a.priorityRank - b.priorityRank).slice(0, TOP_THEME_COUNT);
  if (topThemes.length === 0) return '';

  const e = strings.executiveSummary;
  const rows = topThemes
    .map(
      (theme) => `
        <a href="#theme-${theme.priorityRank}" style="display:flex;align-items:center;gap:var(--space-3);text-decoration:none;color:var(--color-text);padding:8px 0;background:linear-gradient(to right,transparent,var(--color-divider) 0,var(--color-divider) 100%,transparent) no-repeat bottom/100% 1px">
          <span style="width:22px;height:22px;flex:none;border-radius:50%;border:1px solid var(--color-accent);color:var(--color-accent);font-size:11px;display:flex;align-items:center;justify-content:center">${theme.priorityRank}</span>
          <span style="font-size:14px;flex:1">${escapeHtml(theme.title)}</span>
          <span style="font-size:11px;color:var(--color-accent-300)">${escapeHtml(e.jumpLinkLabel)}</span>
        </a>
      `,
    )
    .join('');

  return `
    <div style="margin-top:var(--space-6);padding:var(--space-4);background:var(--color-surface);border-radius:var(--radius-lg)">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--color-accent-300);margin-bottom:var(--space-3)">${escapeHtml(e.startHereKicker)}</div>
      ${rows}
    </div>
  `;
}

export function renderExecutiveSummary(strings: ReportStrings, analysis: StoredAnalysis): string {
  const e = strings.executiveSummary;
  return sheet(`
    ${renderSheetHeader(e.eyebrow, e.heading)}
    <p style="font-size:15px;max-width:66ch;opacity:0.9">${escapeHtml(analysis.executiveSummary)}</p>
    ${renderStartHere(strings, analysis.themes)}
  `);
}
