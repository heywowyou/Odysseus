import type { ReportTier } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, renderSectionHeader } from '../html-utils.js';

/** Static, hand-listed heading list with no resolved page numbers -
 *  a genuine TOC with page numbers needs a two-pass render, which
 *  docs/report-v2-refactor.md D29 corrected away from. Real page
 *  numbers live in the PDF's outline bookmark tree (pdf.ts's outline:
 *  true) and the printed footer, not here. Screening's section list is
 *  much shorter (strings.toc.itemsScreening) since most of the full
 *  audit's sections never render for that tier - see render-html.ts's
 *  tier branch. */
export function renderToc(strings: ReportStrings, tier: ReportTier): string {
  const itemList: readonly string[] = tier === 'screening' ? strings.toc.itemsScreening : strings.toc.items;
  const items = itemList
    .map((item, index) => `<li><span class="n">${index + 1}</span>${escapeHtml(item)}</li>`)
    .join('');

  return `
    <section class="new-page">
      <span class="eyebrow">${escapeHtml(strings.toc.eyebrow)}</span>
      <h2>${escapeHtml(strings.toc.heading)}</h2>
      <ul class="toc">${items}</ul>
      <p class="note">${escapeHtml(strings.toc.note)}</p>
    </section>
  `;
}
