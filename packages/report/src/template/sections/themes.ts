import type { AuditManifest, Finding, ReferenceStat, ReportLanguage, Theme } from '@odysseus/core';
import { selectReferenceStats } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatFindingIdRefs, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';
import { CATEGORY } from '../design-tokens.js';
import { renderReferenceStatNote } from '../reference-stat-note.js';

/** F40: a quick win is low effort with medium or high impact, computed
 *  here in template code from the theme's own effort/impact - not from
 *  analysis.quickWins (which is a findingId list, a different, narrower
 *  concept: individual quick-fix findings, not whole themes). Verified
 *  against docs/report-v2-prototype-haaitza-fr.html: exactly the four
 *  low-effort themes (ranks 3, 4, 6, 7) carry the badge there. */
export function isQuickWinTheme(theme: Pick<Theme, 'effort' | 'impact'>): boolean {
  return theme.effort === 'low' && theme.impact !== 'low';
}

/** Doc §3 sections 04/05 cap: 6 themes, shared by "Priorités classées"
 *  and the printable checklist, even though the LLM layer's own schema
 *  allows up to 20 (llm-output.ts's themeSchema max). This is a report
 *  presentation cap, not a change to what the LLM is allowed to produce -
 *  the lower-priority themes past rank 6 are simply not printed. */
export const MAX_RENDERED_THEMES = 6;

/** Same top-N-by-rank selection shared by themes.ts and checklist.ts, so
 *  the two sections can never disagree on which themes made the cut. */
export function selectRenderedThemes(themes: readonly Theme[]): Theme[] {
  return [...themes].sort((a, b) => a.priorityRank - b.priorityRank).slice(0, MAX_RENDERED_THEMES);
}

/** Quick-win star icon, ported verbatim from report.reference.html's
 *  inline SVG (a 5-point star), fixed colour per the reference (not a
 *  design-tokens.ts entry - it's the one badge in the reference that
 *  isn't drawn from the severity/category palette). */
const QUICK_WIN_ICON =
  '<svg width="10" height="10" viewBox="0 0 256 256" fill="currentColor"><path d="M239.2 97.29a16 16 0 0 0-13.81-11L166 81.17 142.72 25.81a15.95 15.95 0 0 0-29.44 0L90 81.17l-59.39 5.16a16 16 0 0 0-9.11 28.06l45 38.83L53.09 211a16 16 0 0 0 23.84 17.34L128 198.49l51.07 29.83A16 16 0 0 0 202.91 211l-13.4-57.78 45-38.83a16 16 0 0 0 4.69-17.1Z"></path></svg>';

function pageWord(strings: ReportStrings, count: number): string {
  return count === 1 ? strings.findingsAppendix.pageSingular : strings.findingsAppendix.pagePlural;
}

function renderTheme(
  strings: ReportStrings,
  language: ReportLanguage,
  theme: Theme,
  findingsById: Map<string, Finding>,
  totalPagesScanned: number,
  citationStat: ReferenceStat | undefined,
): string {
  const t = strings.themes;
  const themeFindings = theme.findingIds.map((id) => findingsById.get(id)).filter((f): f is Finding => f !== undefined);
  const uniquePages = new Set(themeFindings.flatMap((f) => f.pageUrls)).size;

  const category = CATEGORY[theme.category];
  const categoryTag = `<span class="tag" style="background:${category.bg};color:${category.color}">${escapeHtml(strings.findingsAppendix.categoryLabels[theme.category])}</span>`;
  const quickWinBadge = isQuickWinTheme(theme)
    ? `<span class="tag qw" style="display:inline-flex;align-items:center;gap:4px;background:#1c3a2c;color:#7cd9a0">${QUICK_WIN_ICON}${escapeHtml(t.quickWinBadgeLabel)}</span>`
    : '';

  const isNonConformant = theme.legalRelevance !== undefined;
  const conformityValue = isNonConformant ? t.conformityNonConformant : t.conformityNotApplicable;

  const legalBox = theme.legalRelevance
    ? `<p style="font-size:12px;opacity:0.6;margin:0">${escapeHtml(t.legalTagLabel)} : ${escapeHtml(theme.legalRelevance)}</p>`
    : '';

  const citationBox = citationStat ? renderReferenceStatNote(t.impactCitationLabel, citationStat, language) : '';

  const pagesText = fillTemplate(t.pagesOfTotalTemplate, {
    pages: formatNumber(uniquePages, language),
    pageWord: pageWord(strings, uniquePages),
    totalPages: formatNumber(totalPagesScanned, language),
  });

  return `
    <div class="card elev-sm theme-card" style="margin-bottom:var(--space-4);gap:var(--space-3)" id="theme-${theme.priorityRank}">
      <div style="display:flex;align-items:flex-start;gap:var(--space-3)">
        <span style="width:26px;height:26px;flex:none;border-radius:50%;border:1px solid var(--color-accent);color:var(--color-accent);font-size:12px;display:flex;align-items:center;justify-content:center">${theme.priorityRank}</span>
        <div style="flex:1">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
            ${categoryTag}
            ${quickWinBadge}
          </div>
          <div class="card-title">${escapeHtml(theme.title)}</div>
        </div>
      </div>
      <p class="card-body" style="opacity:0.9">${escapeHtml(theme.businessImpact)}</p>
      ${legalBox}
      ${citationBox}
      <div style="display:flex;gap:var(--space-6);flex-wrap:wrap;font-size:12px;opacity:0.75;margin-top:4px">
        <span>${escapeHtml(t.effortLabel)} : <strong>${escapeHtml(t.effortImpactLevels[theme.effort])}</strong></span>
        <span>${escapeHtml(t.impactLabel)} : <strong>${escapeHtml(t.effortImpactLevels[theme.impact])}</strong></span>
        <span>${escapeHtml(t.affectedPagesLabel)} : <strong>${escapeHtml(pagesText)}</strong></span>
        <span>${escapeHtml(t.conformityLabel)} : <strong>${escapeHtml(conformityValue)}</strong></span>
        <span>${escapeHtml(t.refsLabel)} : ${escapeHtml(formatFindingIdRefs(theme.findingIds))}</span>
      </div>
    </div>
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
  const sortedThemes = selectRenderedThemes(analysis.themes);
  const sector = analysis.obligationAssessment?.sector ?? 'general';

  // One citation per category, shown once on that category's
  // highest-priority theme (sortedThemes is already priorityRank-order),
  // not repeated on every theme - avoids a report where five
  // accessibility themes each restate the identical Deloitte sentence.
  // 'performance'/'rendering' themes get no citation at all: the
  // reference-stat table (packages/core/src/reference-stats) has no rows
  // for those categories, and showing nothing is honest, not a bug.
  const citedCategories = new Set<string>();
  const citationByRank = new Map<number, ReferenceStat>();
  for (const theme of sortedThemes) {
    if (theme.category !== 'accessibility' && theme.category !== 'seo') continue;
    if (citedCategories.has(theme.category)) continue;
    const [top] = selectReferenceStats(theme.category, sector);
    if (top) {
      citationByRank.set(theme.priorityRank, top);
      citedCategories.add(theme.category);
    }
  }

  const themeBlocks = sortedThemes
    .map((theme) =>
      renderTheme(strings, analysis.language, theme, findingsById, totalPagesScanned, citationByRank.get(theme.priorityRank)),
    )
    .join('');

  return sheet(`
    ${renderSheetHeader(strings.themes.eyebrow, fillTemplate(strings.themes.headingTemplate, { count: sortedThemes.length }))}
    ${themeBlocks}
  `);
}
