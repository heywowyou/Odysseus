import type { AuditManifest, AuditManualFields, Finding, ReportLanguage } from '@odysseus/core';
import { contentCheckedPageUrls } from '@odysseus/core';
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
  auditDate,
} from '../html-utils.js';
import { selectRenderedThemes } from './themes.js';
import { LEVEL_COLOR } from '../design-tokens.js';
import type { RenderedPriority } from '../rendered-priorities.js';
import { priorityConformanceCriteria } from '../priority-conformance.js';

function headCell(label: string): string {
  // white-space:nowrap (issue #48): a header label is a single word in both
  // languages, so wrapping can never help it fit - it can only overflow its
  // column into the neighbour's, which is the "COMPLEXITÉIMPACT" collision.
  // Keeping the label on one line makes the column-width choice below the
  // single place that decides whether it fits.
  return `<div style="padding:var(--space-2);font-size:11px;letter-spacing:0.02em;text-transform:uppercase;white-space:nowrap;color:color-mix(in srgb, var(--color-text) 60%, transparent);border-bottom:1px solid var(--color-divider)">${escapeHtml(label)}</div>`;
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
  const totalPagesScanned = contentCheckedPageUrls(manifest).size;
  // Issue #41: the PAGES cell renders "N/M" against the visited-page total,
  // so the numerator must count the same population. A finding can cite a
  // URL outside the visited scope (an origin-level finding recorded against
  // a discovered-but-not-scanned page), and counting it raw produced a real
  // report's "29/28" - a ratio a reader uses to decide whether to trust the
  // rest of the numbers.
  // Issue #80's content-checked population, not the raw visited set: the
  // metadata sheet, the statistics tile and the methodology paragraph all
  // call the analysed perimeter by the content-checked figure, so a page
  // figure built on the visited set could exceed the perimeter the report
  // states it analysed - a real French report opened on "au moins 522
  // pages du périmètre analysé" three pages after "520 pages analysées".
  const scopePageUrls = contentCheckedPageUrls(manifest);
  const sortedThemes = priorities
    ? priorities.map((priority) => priority.theme)
    : selectRenderedThemes(analysis.themes, findingsById);
  // Issue #305: the complexity column carries its own rating vocabulary
  // ("Complexité" is feminine in French), separate from the impact ramp.
  const effortLevels = strings.themes.effortLevels;
  const levels = strings.themes.effortImpactLevels;

  // item 2.7: standing on its own once printed or captured, this page had
  // no company name and no date - nothing but the footer's URL to identify
  // it. Same nomCommercial fallback-to-siteUrl precedent as cover.ts.
  const identifier = fillTemplate(c.identifierTemplate, {
    company: manualFields?.nomCommercial?.value ?? manifest.siteUrl,
    date: formatDate(auditDate(manifest), language),
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
      const uniquePages = new Set(
        themeFindings.flatMap((f) => f.pageUrls).filter((url) => scopePageUrls.has(url)),
      ).size;
      // Issue #310: the same criteria the priority card's conformance line states.
      const wcagCriteria = priorityConformanceCriteria(themeFindings);

      return `
        <div class="row-atomic">
          ${cell(String(displayRank))}
          ${cell(escapeProse(theme.title, language))}
          ${cell(escapeHtml(effortLevels[theme.effort]))}
          ${cell(`<span data-level="${theme.impact}" data-report-level="${theme.impact}" style="color:${LEVEL_COLOR[theme.impact].color}">${escapeHtml(levels[theme.impact])}</span>`)}
          ${cell(`${formatNumber(uniquePages, language)}/${formatNumber(totalPagesScanned, language)}`)}
          ${cell(`<span class="mono" style="font-size:11px">${escapeHtml(formatCappedFindingIdRefs(theme.findingIds, language, strings.findingsAppendix))}</span>`)}
          ${cell(wcagCriteria.length > 0 ? escapeHtml(formatCappedList(wcagCriteria, CHECKLIST_WCAG_CAP, language, strings.findingsAppendix)) : '-')}
        </div>
      `;
    })
    .join('');

  // Issue #48: the COMPLEXITÉ header used a fixed 70px column, narrower
  // than the uppercase label at 11px with 0.02em tracking, so the header
  // overflowed into the IMPACT column and read as one merged
  // "COMPLEXITÉIMPACT" token on the page designed to be handed to a
  // contractor alone. The complexity column is now sized to its content
  // (max-content: the widest of the header and the Faible/Moyen/Élevé
  // cells), which cannot collide in either language and cannot regress
  // if a label is ever reworded - reducing the letter-spacing was not an
  // option, since 0.02em uppercase tracking is a design token
  // (docs/report/report-design-tokens.md). The other columns keep their
  // fixed widths; their labels fit with headroom in both languages,
  // asserted in checklist-overflow.test.ts.
  return sheet(
    `
    ${renderSheetHeader(ordinal, c.eyebrow, c.heading, 'var(--space-2)', `<span class="checklist-insert-tag">${escapeHtml(c.insertTag)}</span>`)}
    <p style="font-size:12px;opacity:0.7;margin-bottom:4px">${escapeHtml(identifier)}</p>
    <p style="font-size:12px;opacity:0.55;margin-bottom:var(--space-4)">${escapeHtml(c.intro)}</p>
    <div style="display:grid;grid-template-columns:30px 1fr max-content 70px 60px 110px 80px;font-size:12.5px">
      ${headCell(c.rankColumnLabel)}
      ${headCell(c.priorityColumnLabel)}
      ${headCell(c.complexityColumnLabel)}
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
