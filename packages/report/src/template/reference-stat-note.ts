import type { ReferenceStat, ReportLanguage } from '@odysseus/core';
import { escapeCopy, escapeHtml, labelSeparator } from './html-utils.js';
import { SEVERITY } from './design-tokens.js';

/**
 * Renders one vetted reference-stat citation as a small, dim, sourced
 * note - styled to match the existing legalRelevance box in themes.ts
 * exactly (font-size:12px, opacity:0.6), so a reader already used to
 * that visual language recognizes this as the same kind of fixed,
 * sourced fact rather than free prose. Shared by themes.ts (§7) and
 * findings-appendix.ts's geo section (§5) so the markup exists once.
 *
 * The "emerging" badge reuses SEVERITY.serious's warm-tone color pair
 * from design-tokens.ts rather than inventing a new one, same "reuse an
 * existing token" reasoning as design-tokens.ts's own geo entry.
 *
 * 2026-08-24: these three lines used `opacity:0.6`, which composites the
 * whole subtree - so the badge's background was dimmed along with the
 * paragraph's text and #dba36c on #362a1c fell from 6.29:1 to a real
 * 3.2:1 axe contrast failure. Opacity cannot be undone by a child, so
 * the fix is not to brighten the badge but to stop using opacity here:
 * `.text-muted` (nocturne.css) fades the text colour alone via
 * color-mix, leaving the badge at full strength. Same defect and same
 * fix as CLAUDE.md trade-off 20's nested-opacity contrast failure on the
 * conformity gloss. Caught by render-html.axe.test.ts's second fixture,
 * added the same day - the original sas-fernande fixture contains no
 * 'emerging' citation, so this had no way to surface before.
 */
export function renderReferenceStatNote(
  labelText: string,
  stat: ReferenceStat,
  language: ReportLanguage,
  emergingBadgeText?: string,
  /** item 14/1.6: a per-0.1s ratio (the Deloitte page-speed stats) invites
   *  a reader to naively multiply the stated relationship by however many
   *  seconds their own site is over threshold - wildly wrong when the
   *  real gap is 3.4s, not 0.1s. Stating the site's own measured gap
   *  removes the need for that extrapolation. Rendered first, before the
   *  citation (item 1.6: the original order put the citation first and a
   *  "not to be confused with the number above" disclaimer after, which
   *  read as a warning against the report's own figure; stating the site's
   *  real gap up front, then the benchmark as context, means the
   *  disclaimer sentence is no longer needed at all). Shown only when the
   *  caller has one to give (themes.ts, for a 'conversion-uplift-per-0.1s'/
   *  'aov-uplift-per-0.1s' stat on a performance theme where a real LCP
   *  measurement exists). */
  measuredGapNote?: string,
  /** 2026-08-22 revenue-impact wiring: a hedged, client-specific euro
   *  estimate (themes.ts's renderRevenueImpactNote), present only when
   *  the stat is 'scales-down' and the client's own Sirene turnover is
   *  known. Rendered last, after the citation itself, so the reader sees
   *  the sourced fact before the derived number built from it - the
   *  reverse order from measuredGapNote, which is deliberately the site's
   *  own measurement shown first, before the benchmark it's compared
   *  against. */
  revenueImpactNote?: string,
): string {
  const badge =
    stat.confidence === 'emerging' && emergingBadgeText
      ? ` <span class="tag" style="background:${SEVERITY.serious.bg};color:${SEVERITY.serious.color}">${escapeHtml(emergingBadgeText)}</span>`
      : '';
  const gapLine = measuredGapNote
    ? `<p class="text-muted" style="font-size:12px;margin:0">${escapeCopy(measuredGapNote, language)}</p>`
    : '';
  const citationLine = `<p class="text-muted" style="font-size:12px;margin:${gapLine ? '2px' : '0'} 0 0">${escapeHtml(labelText)}${labelSeparator(language)}${escapeCopy(stat.citation[language], language)}${badge}</p>`;
  const revenueLine = revenueImpactNote
    ? `<p class="text-muted" style="font-size:12px;margin:2px 0 0">${escapeCopy(revenueImpactNote, language)}</p>`
    : '';
  return `${gapLine}${citationLine}${revenueLine}`;
}
