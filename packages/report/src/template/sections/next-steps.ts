import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, renderSectionHeader } from '../html-utils.js';

/** Static, code-owned copy - no scan data involved. Reuses the same
 *  `.obs` card styling observations.ts already established. */
export function renderNextSteps(strings: ReportStrings): string {
  const n = strings.nextSteps;

  const boxes = [
    { title: n.questionTitle, body: n.questionBody },
    { title: n.reauditTitle, body: n.reauditBody },
    { title: n.postFixTitle, body: n.postFixBody },
  ]
    .map(
      (box) => `
        <div class="obs keep">
          <h3>${escapeHtml(box.title)}</h3>
          <p>${escapeHtml(box.body)}</p>
        </div>
      `,
    )
    .join('');

  return `
    <section class="new-page">
      ${renderSectionHeader(n.eyebrow, n.heading)}
      ${boxes}
    </section>
  `;
}
