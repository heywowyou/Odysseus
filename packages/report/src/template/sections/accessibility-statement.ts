import { getCriterionName } from '@odysseus/llm';
import type { Finding, ReportLanguage } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, renderSectionHeader } from '../html-utils.js';
import { buildConformanceRollup } from '../conformance-rollup.js';

/** A draft accessibility statement skeleton, one row per WCAG criterion
 *  the scan actually found failing. The status column is always the same
 *  fixed label: buildConformanceRollup only ever lists a criterion when
 *  at least one finding failed it (conformance-rollup.ts), so
 *  "non-conformant" restates that fact rather than adding a new legal
 *  judgment - same reasoning conformance-summary.ts already documents for
 *  its own rows. Client fills in the rest before publishing. */
export function renderAccessibilityStatement(
  strings: ReportStrings,
  language: ReportLanguage,
  findings: Finding[],
): string {
  const a = strings.accessibilityStatement;
  const rows = buildConformanceRollup(findings);

  const tableRows = rows
    .map(
      (row) => `
        <tr>
          <td class="mono crit">${escapeHtml(row.criterion)} - ${escapeHtml(getCriterionName(row.criterion, language) ?? '')}</td>
          <td>${escapeHtml(a.nonConformantPartialLabel)}</td>
        </tr>
      `,
    )
    .join('');

  return `
    <section class="new-page">
      ${renderSectionHeader(a.eyebrow, a.heading)}
      <p class="intro">${escapeHtml(a.intro)}</p>
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(a.criterionColumnLabel)}</th>
            <th>${escapeHtml(a.statusColumnLabel)}</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="obs keep">
        <h3>${escapeHtml(a.contactHeading)}</h3>
        <p>${escapeHtml(a.contactBody)}</p>
      </div>
      <div class="obs keep">
        <h3>${escapeHtml(a.remediationPlanHeading)}</h3>
        <p>${escapeHtml(a.remediationPlanBody)}</p>
      </div>
    </section>
  `;
}
