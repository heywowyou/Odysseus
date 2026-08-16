import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, sheet } from '../html-utils.js';

/** Static, hand-listed heading list with no resolved page numbers -
 *  a genuine TOC with page numbers needs a two-pass render, which
 *  docs/report-v2-refactor.md D29 corrected away from. Real page
 *  numbers live in the PDF's outline bookmark tree (pdf.ts's outline:
 *  true) and the printed footer, not here. Doc §3 cap: 14 rows, one per
 *  numbered section - strings.toc.items is typed as a 14-tuple so this
 *  cap is enforced at compile time, not just by convention. */
export function renderToc(strings: ReportStrings): string {
  const rows = strings.toc.items
    .map(
      (item, index) => `
        <div style="display:flex;align-items:baseline;gap:var(--space-3);padding:9px 0;background:linear-gradient(to right,transparent,var(--color-divider) 0,var(--color-divider) 100%,transparent) no-repeat bottom/100% 1px">
          <span class="n" style="font-size:12px;color:var(--color-accent-300);width:22px;flex:none">${index + 1}</span>
          <span style="font-size:14.5px">${escapeHtml(item)}</span>
        </div>
      `,
    )
    .join('');

  return sheet(`
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:var(--space-2)">
      <h6 style="color:var(--color-accent-300);margin:0">${escapeHtml(strings.toc.eyebrow)}</h6>
    </div>
    <h2 style="margin-bottom:var(--space-6)">${escapeHtml(strings.toc.heading)}</h2>
    ${rows}
    <p style="font-size:11px;opacity:0.5;margin-top:var(--space-4)">${escapeHtml(strings.toc.note)}</p>
  `);
}
