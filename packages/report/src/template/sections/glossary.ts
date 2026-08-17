import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, renderSheetHeader, sheet } from '../html-utils.js';

/** Static, code-owned copy - no scan data involved. Doc §3 cap: 9 entries,
 *  1 sheet - strings.glossary.terms already holds exactly 9 in both
 *  languages. */
export function renderGlossary(strings: ReportStrings): string {
  const g = strings.glossary;

  const items = g.terms
    .map(
      (t) => `
        <div class="glossary-entry" style="margin-bottom:var(--space-4)">
          <div style="font-size:14px;font-weight:500;color:var(--color-accent-300)">${escapeHtml(t.term)}</div>
          <div style="font-size:13px;opacity:0.8">${escapeHtml(t.definition)}</div>
        </div>
      `,
    )
    .join('');

  return sheet(`
    ${renderSheetHeader(g.eyebrow, g.heading)}
    ${items}
  `, '', 'section-13');
}
