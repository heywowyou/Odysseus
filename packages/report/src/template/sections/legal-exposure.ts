import type { ObligationAssessment, ReportLanguage } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, renderSheetHeader, sheet } from '../html-utils.js';
import { renderLegalCitationParagraph } from './methodology.js';

/** Promotes methodology.ts's own legal-citation paragraph to a dedicated
 *  page for visibility. Deliberately calls the same exported function
 *  methodology.ts uses rather than deriving its own text: this section
 *  must never become a second, independent source of legal framing
 *  (CLAUDE.md rule 6, trade-off 11). The two cards above the paragraph
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

  // B7: the cover badge no longer reads as a legal risk score (relabeled
  // in cover.ts), but an undetermined status on its own still leaves the
  // client with no next step. State the single resolving action without
  // asserting what the answer would be.
  const actionNote =
    status === 'undetermined'
      ? `<p style="font-size:12.5px;opacity:0.65;margin-top:var(--space-2)">${escapeHtml(l.undeterminedActionNote)}</p>`
      : '';

  return sheet(`
    ${renderSheetHeader(l.eyebrow, l.heading)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-bottom:var(--space-6)">
      <div class="card elev-sm">
        <div class="card-kicker">${escapeHtml(l.eaaDeadlineLabel)}</div>
        <div class="card-title">${escapeHtml(l.eaaDeadlineValue)}</div>
        <div class="card-body">${escapeHtml(l.eaaDeadlineNote)}</div>
      </div>
      <div class="card elev-sm">
        <div class="card-kicker">${escapeHtml(l.obligationStatusLabel)}</div>
        <div class="card-title">${escapeHtml(l.statusLabels[status])}</div>
        <div class="card-body">${escapeHtml(l.statusShortDescriptions[status])}</div>
        ${actionNote}
      </div>
    </div>
    <p style="font-size:13.5px;opacity:0.85;max-width:66ch">${escapeHtml(paragraph)}</p>
    <p style="font-size:11px;opacity:0.5;margin-top:var(--space-4)">${escapeHtml(l.disclaimerNote)}</p>
  `, '', 'section-02');
}
