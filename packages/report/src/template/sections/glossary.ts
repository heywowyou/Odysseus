import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, renderSectionHeader } from '../html-utils.js';

/** Static, code-owned copy - no scan data involved. */
export function renderGlossary(strings: ReportStrings): string {
  const g = strings.glossary;

  const items = g.terms
    .map(
      (t) => `
        <div class="gloss-item">
          <dt>${escapeHtml(t.term)}</dt>
          <dd>${escapeHtml(t.definition)}</dd>
        </div>
      `,
    )
    .join('');

  return `
    <section class="new-page">
      ${renderSectionHeader(g.eyebrow, g.heading)}
      <dl class="gloss-list">${items}</dl>
    </section>
  `;
}
