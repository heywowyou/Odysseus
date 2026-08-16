import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, renderSheetHeader, sheet } from '../html-utils.js';

/** Static, code-owned copy - no scan data involved. Doc §3 cap: 3 cards,
 *  1 sheet. */
export function renderNextSteps(strings: ReportStrings): string {
  const n = strings.nextSteps;

  const cards = [
    { title: n.questionTitle, body: n.questionBody },
    { title: n.reauditTitle, body: n.reauditBody },
    { title: n.postFixTitle, body: n.postFixBody },
  ]
    .map(
      (card) => `
        <div class="card elev-sm">
          <div class="card-title">${escapeHtml(card.title)}</div>
          <div class="card-body">${escapeHtml(card.body)}</div>
        </div>
      `,
    )
    .join('');

  return sheet(`
    ${renderSheetHeader(n.eyebrow, n.heading)}
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-4)">
      ${cards}
    </div>
  `);
}
