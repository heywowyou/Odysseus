import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, renderSectionHeader } from '../html-utils.js';

/** Static, hand-listed heading list with no resolved page numbers -
 *  a genuine TOC with page numbers needs a two-pass render, which
 *  docs/report-v2-refactor.md D29 corrected away from. Real page
 *  numbers live in the PDF's outline bookmark tree (pdf.ts's outline:
 *  true) and the printed footer, not here. */
export function renderToc(strings: ReportStrings): string {
  const items = strings.toc.items
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
