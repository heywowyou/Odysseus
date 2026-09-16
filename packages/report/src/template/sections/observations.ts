import type { DivertedFinding } from '@odysseus/llm';
import type { ObligationAssessment } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import {
  escapeHtml,
  fillTemplate,
  formatFindingIdRefs,
  renderSheetHeader,
  sheet,
} from '../html-utils.js';
import { accessibilityStatementGuidance } from '../accessibility-statement-guidance.js';

/** Renders the diverted findings (docs/archive/report-v2-refactor.md 4.1) into
 *  fixed, deterministic copy - never LLM prose, since the whole point of
 *  diversion is that these findings never reach the model.
 *
 *  `diverted` is computed once by render-html.ts's renderBody (a single
 *  partitionFindings(findings, manifest) call against the full findings/
 *  manifest, never anything persisted) and passed to both this function
 *  and the section-inclusion check that drives the TOC - report-feedback-
 *  palais-gallien.md item 2: this used to call partitionFindings itself,
 *  a second, independent call the TOC had no way to see the result of, so
 *  the TOC kept listing this section (with a now-dead anchor) even when
 *  it rendered nothing. Returns '' when there is nothing to divert, same
 *  as before - the entire section-06 sheet is then absent from the body,
 *  and the caller's inclusion set must reflect that. */
export function renderObservations(
  strings: ReportStrings,
  ordinal: number,
  diverted: readonly DivertedFinding[],
  obligationAssessment?: ObligationAssessment,
): string {
  if (diverted.length === 0) return '';

  const o = strings.observations;
  const wrapperIds = diverted.filter((d) => d.reason === 'wrapper').map((d) => d.finding.findingId);
  const legalIds = diverted.filter((d) => d.reason === 'legal').map((d) => d.finding.findingId);
  const regimeDependentIds = diverted
    .filter((d) => d.reason === 'regime-dependent')
    .map((d) => d.finding.findingId);

  const wrapperBlock =
    wrapperIds.length > 0
      ? `
        <div style="margin-bottom:var(--space-6)">
          <h5>${escapeHtml(o.wrapperTitle)}</h5>
          <p style="font-size:13.5px;opacity:0.85;max-width:var(--measure-prose)">${escapeHtml(fillTemplate(o.wrapperBodyTemplate, { findingIds: formatFindingIdRefs(wrapperIds) }))}</p>
        </div>
      `
      : '';
  const legalBlock =
    legalIds.length > 0
      ? `
        <div>
          <h5>${escapeHtml(o.legalTitle)}</h5>
          <p style="font-size:13.5px;opacity:0.85;max-width:var(--measure-prose)">${escapeHtml(fillTemplate(o.legalBodyTemplate, { findingIds: formatFindingIdRefs(legalIds) }))}</p>
        </div>
      `
      : '';
  const statementGuidance = accessibilityStatementGuidance(strings, obligationAssessment);
  const regimeDependentBlock =
    regimeDependentIds.length > 0
      ? `
        <div>
          <h5>${escapeHtml(strings.accessibilityStatementGuidance.heading)}</h5>
          <p style="font-size:13.5px;opacity:0.85;max-width:var(--measure-prose)">${escapeHtml(statementGuidance.observation)} ${escapeHtml(statementGuidance.recommendation)}</p>
          <p class="text-muted" style="font-size:11px">${escapeHtml(
            fillTemplate(
              regimeDependentIds.length === 1
                ? o.relatedFindingSingularTemplate
                : o.relatedFindingPluralTemplate,
              { findingIds: formatFindingIdRefs(regimeDependentIds) },
            ),
          )}</p>
        </div>
      `
      : '';

  return sheet(
    `
    ${renderSheetHeader(ordinal, o.eyebrow, o.heading, 'var(--space-6)')}
    ${wrapperBlock}
    ${legalBlock}
    ${regimeDependentBlock}
  `,
    '',
    'section-06',
  );
}
