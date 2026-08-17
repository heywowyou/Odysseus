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
): string {
  const badge =
    stat.confidence === 'emerging' && emergingBadgeText
      ? ` <span class="tag" style="background:${SEVERITY.serious.bg};color:${SEVERITY.serious.color}">${escapeHtml(emergingBadgeText)}</span>`
      : '';
  return `<p style="font-size:12px;opacity:0.6;margin:0">${escapeHtml(labelText)} : ${escapeHtml(stat.citation[language])}${badge}</p>`;
}
