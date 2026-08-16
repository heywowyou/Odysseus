import type { ObligationAssessment, ReportLanguage } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, renderSectionHeader } from '../html-utils.js';
import { renderLegalCitationParagraph } from './methodology.js';

/** Promotes methodology.ts's own legal-citation paragraph to a dedicated
 *  page for visibility. Deliberately calls the same exported function
 *  methodology.ts uses rather than deriving its own text: this section
 *  must never become a second, independent source of legal framing
 *  (CLAUDE.md rule 6, trade-off 11). The two tiles above the paragraph
 *  add no new legal nuance either - the EAA deadline is a fact about the
 *  law itself, not about this client, and the status label/short
 *  description are a plain restatement of assessObligations()'s own
 *  status enum. */
export function renderLegalExposure(
  strings: ReportStrings,
  language: ReportLanguage,
  obligationAssessment: ObligationAssessment | undefined,
): string {
  const l = strings.legalExposure;
  const status = obligationAssessment?.status ?? 'undetermined';

  const paragraph = renderLegalCitationParagraph(strings, obligationAssessment, language);

  return `
    <section class="new-page">
      ${renderSectionHeader(l.eyebrow, l.heading)}
      <div class="tiles tiles-2wide">
        <div class="tile">
          <span>${escapeHtml(l.eaaDeadlineLabel)}</span>
          <b>${escapeHtml(l.eaaDeadlineValue)}</b>
          <p class="note">${escapeHtml(l.eaaDeadlineNote)}</p>
        </div>
        <div class="tile">
          <span>${escapeHtml(l.obligationStatusLabel)}</span>
          <b>${escapeHtml(l.statusLabels[status])}</b>
          <p class="note">${escapeHtml(l.statusShortDescriptions[status])}</p>
        </div>
      </div>
      <p>${escapeHtml(paragraph)}</p>
      <p class="note">${escapeHtml(l.disclaimerNote)}</p>
    </section>
  `;
}
