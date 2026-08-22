import type { ReferenceStat, ReportLanguage } from '@odysseus/core';
import { escapeHtml } from './html-utils.js';
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
    ? `<p style="font-size:12px;opacity:0.6;margin:0">${escapeHtml(measuredGapNote)}</p>`
    : '';
  const citationLine = `<p style="font-size:12px;opacity:0.6;margin:${gapLine ? '2px' : '0'} 0 0">${escapeHtml(labelText)} : ${escapeHtml(stat.citation[language])}${badge}</p>`;
  const revenueLine = revenueImpactNote
    ? `<p style="font-size:12px;opacity:0.6;margin:2px 0 0">${escapeHtml(revenueImpactNote)}</p>`
    : '';
  return `${gapLine}${citationLine}${revenueLine}`;
}
