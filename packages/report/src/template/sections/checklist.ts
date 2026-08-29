import { compareCriteria } from '@odysseus/core';
import type { AuditManifest, AuditManualFields, Finding, ReportLanguage } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import {
  escapeHtml,
  escapeProse,
  fillTemplate,
  formatCappedFindingIdRefs,
  formatCappedList,
  formatDate,
  formatNumber,
  renderSheetHeader,
  sheet,
} from '../html-utils.js';
import { selectRenderedThemes } from './themes.js';
import { LEVEL_COLOR } from '../design-tokens.js';
import type { RenderedPriority } from '../rendered-priorities.js';

function headCell(label: string): string {
  return `<div style="padding:var(--space-2);font-size:11px;letter-spacing:0.02em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 60%, transparent);border-bottom:1px solid var(--color-divider)">${escapeHtml(label)}</div>`;
}

function cell(html: string): string {
  return `<div style="padding:var(--space-2);border-bottom:1px solid var(--color-divider)">${html}</div>`;
}

/** A7 (2026-08-24): the cap and both formatters moved to html-utils.ts's
 *  FINDING_ID_LIST_CAP / formatCappedFindingIdRefs, because themes.ts's
 *  priority card had the identical unbounded-cell bug and fixing it here
 *  only had left two constants to drift apart. Reasoning for the cap
 *  itself lives with the constant now.
 */

/** The WCAG column is 80px wide and its row is atomic. Six criteria is
 *  already more than a reader scans in that space; the conformance
 *  section (08) carries the complete per-criterion table. */
const CHECKLIST_WCAG_CAP = 6;

/** Pure re-presentation of analysis.themes as a dense, printable grid -
 *  same rank/effort/impact/pages data themes.ts already renders as full
 *  cards, no new computation, so it can never drift out of sync with the
 *  "Ranked priorities" section above it. CSS grid + `.row-atomic` per
 *  report.reference.html, not a real <table> - keeps each row atomic
 *  across a page break (paged.css). */
export function renderChecklist(
  strings: ReportStrings,
  ordinal: number,
  language: ReportLanguage,
  analysis: StoredAnalysis,
  findings: Finding[],
  manifest: AuditManifest,
  manualFields?: AuditManualFields,
  priorities?: readonly RenderedPriority[],
): string {
  const c = strings.checklist;
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const totalPagesScanned = manifest.pages.filter((page) => page.status === 'visited').length;
  const sortedThemes = priorities
    ? priorities.map((priority) => priority.theme)
    : selectRenderedThemes(analysis.themes, findingsById);
  const levels = strings.themes.effortImpactLevels;

  // item 2.7: standing on its own once printed or captured, this page had
  // no company name and no date - nothing but the footer's URL to identify
  // it. Same nomCommercial fallback-to-siteUrl precedent as cover.ts.
  const identifier = fillTemplate(c.identifierTemplate, {
    company: manualFields?.nomCommercial?.value ?? manifest.siteUrl,
    date: formatDate(new Date(manifest.startedAt), language),
  });

  // item 35: the checklist was a near-exact restatement of the priorities
  // section with nothing added - finding IDs and WCAG criteria give it
  // something to actually look up. Same underlying theme/finding data as
  // themes.ts, no new computation, so it can never drift out of sync.
  //
  // item 2.7: a trailing "Statut / Date" column was added alongside the
  // above (item 35) as a place to write in, but rendered as a bare
  // underline with no visible column boundary in a narrow cell, reading
  // as a stray dash next to the WCAG column rather than a writable field.
  // Removed rather than widened or restyled.
  const rows = sortedThemes
    .map((theme, index) => {
      const displayRank = priorities?.[index]?.displayRank ?? theme.priorityRank;
      const themeFindings = theme.findingIds
        .map((id) => findingsById.get(id))
        .filter((f): f is Finding => f !== undefined);
      const uniquePages = new Set(themeFindings.flatMap((f) => f.pageUrls)).size;
      const wcagCriteria = [...new Set(themeFindings.flatMap((f) => f.wcagCriteria))].sort(
        compareCriteria,
      );

      return `
        <div class="row-atomic">
          ${cell(String(displayRank))}
          ${cell(escapeProse(theme.title))}
          ${cell(escapeHtml(levels[theme.effort]))}
          ${cell(`<span data-level="${theme.impact}" style="color:${LEVEL_COLOR[theme.impact].color}">${escapeHtml(levels[theme.impact])}</span>`)}
          ${cell(`${formatNumber(uniquePages, language)}/${formatNumber(totalPagesScanned, language)}`)}
          ${cell(`<span class="mono" style="font-size:11px">${escapeHtml(formatCappedFindingIdRefs(theme.findingIds, language, strings.findingsAppendix))}</span>`)}
          ${cell(wcagCriteria.length > 0 ? escapeHtml(formatCappedList(wcagCriteria, CHECKLIST_WCAG_CAP, language, strings.findingsAppendix)) : '-')}
        </div>
      `;
    })
    .join('');

  return sheet(
    `
    ${renderSheetHeader(ordinal, c.eyebrow, c.heading)}
    <p style="font-size:12px;opacity:0.7;margin-bottom:4px">${escapeHtml(identifier)}</p>
    <p style="font-size:12px;opacity:0.55;margin-bottom:var(--space-4)">${escapeHtml(c.intro)}</p>
    <div style="display:grid;grid-template-columns:30px 1fr 70px 70px 60px 110px 80px;font-size:12.5px">
      ${headCell(c.rankColumnLabel)}
      ${headCell(c.priorityColumnLabel)}
      ${headCell(c.effortColumnLabel)}
      ${headCell(c.impactColumnLabel)}
      ${headCell(c.pagesColumnLabel)}
      ${headCell(c.findingsColumnLabel)}
      ${headCell(c.wcagColumnLabel)}
      ${rows}
    </div>
  `,
    'sheet-standalone',
    'section-05',
  );
}
