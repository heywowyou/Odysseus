import { partitionFindings } from '@odysseus/llm';
import type { AuditManifest, Finding } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatFindingIdRefs, renderSectionHeader } from '../html-utils.js';

/** Renders the diverted findings (docs/report-v2-refactor.md 4.1) into
 *  fixed, deterministic copy - never LLM prose, since the whole point of
 *  diversion is that these findings never reach the model. Calls
 *  partitionFindings directly against the full findings/manifest rather
 *  than trusting anything persisted, so this section's view of what got
 *  diverted can never drift from what the LLM actually saw. */
export function renderObservations(strings: ReportStrings, findings: Finding[], manifest: AuditManifest): string {
  const { diverted } = partitionFindings(findings, manifest);
  if (diverted.length === 0) return '';

  const o = strings.observations;
  const wrapperIds = diverted.filter((d) => d.reason === 'wrapper').map((d) => d.finding.findingId);
  const legalIds = diverted.filter((d) => d.reason === 'legal').map((d) => d.finding.findingId);

  const boxes = [
    wrapperIds.length > 0
      ? `
        <div class="obs keep">
          <h3>${escapeHtml(o.wrapperTitle)}</h3>
          <p>${escapeHtml(fillTemplate(o.wrapperBodyTemplate, { findingIds: formatFindingIdRefs(wrapperIds) }))}</p>
        </div>
      `
      : '',
    legalIds.length > 0
      ? `
        <div class="obs keep">
          <h3>${escapeHtml(o.legalTitle)}</h3>
          <p>${escapeHtml(fillTemplate(o.legalBodyTemplate, { findingIds: formatFindingIdRefs(legalIds) }))}</p>
        </div>
      `
      : '',
  ].join('');

  return `
    <section class="new-page">
      ${renderSectionHeader(o.eyebrow, o.heading)}
      <p class="intro">${escapeHtml(o.intro)}</p>
      ${boxes}
    </section>
  `;
}
