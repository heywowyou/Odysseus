import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, renderSheetHeader, sheet } from '../html-utils.js';
import { selectRenderedThemes } from './themes.js';

const TOP_THEME_COUNT = 3;

/** item 16: flagged as a product-framing decision, not a pure bug -
 *  Jules to confirm whether the ranking itself should ever get an
 *  explicit legal-conformity weighting (report-feedback-palais-
 *  gallien.md's own framing of this item). Implemented regardless: when
 *  the #1-ranked theme (among those actually rendered, section 04's
 *  selectRenderedThemes cap) carries no legalRelevance, one sentence
 *  states that plainly and points to where a legal-conformity priority
 *  does rank, if one is rendered at all - the four pages of legal framing
 *  preceding this section otherwise leave the reader to notice the
 *  mismatch unaided. */
function renderTopPriorityLegalNote(strings: ReportStrings, themes: StoredAnalysis['themes']): string {
  const rendered = selectRenderedThemes(themes);
  const topTheme = rendered[0];
  if (!topTheme || topTheme.legalRelevance !== undefined) return '';

  const e = strings.executiveSummary;
  const firstLegalTheme = rendered.find((theme) => theme.legalRelevance !== undefined);
  const text = firstLegalTheme
    ? fillTemplate(e.topPriorityIsNotLegalWithPointerTemplate, { legalRank: firstLegalTheme.priorityRank })
    : e.topPriorityIsNotLegalNoPointer;

  return `<p style="font-size:12px;opacity:0.6;margin-top:var(--space-3);max-width:66ch">${escapeHtml(text)}</p>`;
}

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
    .map((theme) => {
      // item 5: the link's own visible label states its destination
      // ("Voir priorité 1 : lenteur d'affichage") instead of a bare
      // "Voir ->" that gave no indication of where it led when read out
      // of context (a PDF link-extraction pass, a screen reader jumping
      // link-to-link). Underline + accent colour give it a visual
      // affordance distinct from the plain-text theme title beside it.
      const jumpLinkLabel = fillTemplate(e.jumpLinkLabelTemplate, { rank: theme.priorityRank, title: theme.title });
      return `
        <a href="#theme-${theme.priorityRank}" style="display:flex;align-items:center;gap:var(--space-3);text-decoration:none;color:var(--color-text);padding:8px 0;background:linear-gradient(to right,transparent,var(--color-divider) 0,var(--color-divider) 100%,transparent) no-repeat bottom/100% 1px">
          <span style="width:22px;height:22px;flex:none;border-radius:50%;border:1px solid var(--color-accent);color:var(--color-accent);font-size:11px;display:flex;align-items:center;justify-content:center">${theme.priorityRank}</span>
          <span style="font-size:14px;flex:1">${escapeHtml(theme.title)}</span>
          <span style="font-size:11px;color:var(--color-accent-300);text-decoration:underline">${escapeHtml(jumpLinkLabel)}</span>
        </a>
      `;
    })
    .join('');

  return `
    <div style="margin-top:var(--space-6);padding:var(--space-4);background:var(--color-surface);border-radius:var(--radius-lg)">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.02em;color:var(--color-accent-300);margin-bottom:var(--space-3)">${escapeHtml(e.startHereKicker)}</div>
      ${rows}
    </div>
  `;
}

export function renderExecutiveSummary(strings: ReportStrings, ordinal: number, analysis: StoredAnalysis): string {
  const e = strings.executiveSummary;
  return sheet(`
    ${renderSheetHeader(ordinal, e.eyebrow, e.heading)}
    <p style="font-size:15px;max-width:66ch;opacity:0.9">${escapeHtml(analysis.executiveSummary)}</p>
    ${renderTopPriorityLegalNote(strings, analysis.themes)}
    ${renderStartHere(strings, analysis.themes)}
  `, '', 'section-01');
}
