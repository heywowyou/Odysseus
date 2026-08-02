import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml } from '../html-utils.js';

export function renderLimitations(strings: ReportStrings): string {
  return `
    <section class="mt-8 avoid-break">
      <h2 class="text-2xl font-bold text-slate-900">${escapeHtml(strings.limitations.heading)}</h2>
      <p class="mt-2 text-sm leading-relaxed text-slate-700">${escapeHtml(strings.limitations.body)}</p>
    </section>
  `;
}
