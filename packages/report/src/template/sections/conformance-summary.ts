import { getCriterionName } from '@odysseus/llm';
import type { Finding, ObligationAssessment, ReportLanguage } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, formatNumber, renderSectionHeader } from '../html-utils.js';
import { buildConformanceRollup } from '../conformance-rollup.js';

/** R2: the conformance flag is computed here, in template code, never
 *  asked of the LLM and never added to the locked Theme schema. A WCAG
 *  failure is a different kind of fact from a slow image (C20/C21). */
export function renderConformanceSummary(
  strings: ReportStrings,
  findings: Finding[],
  language: ReportLanguage,
  obligationAssessment?: ObligationAssessment,
): string {
  const rows = buildConformanceRollup(findings);
  const c = strings.conformanceSummary;
  // Section 9's methodology chapter states a specific obligation
  // determination whenever assessObligations() reached one; this intro's
  // generic "we don't rule on applicability" hedge must not contradict
  // that by printing unconditionally. Same status check, no duplicated
  // logic: undetermined (or no assessment at all, same fallback
  // methodology.ts uses) is the only case where the hedge still applies.
  const showHedge = !obligationAssessment || obligationAssessment.status === 'undetermined';

  const body = rows.length
    ? `
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(c.criterionColumnLabel)}</th>
            <th>${escapeHtml(c.criterionNameColumnLabel)}</th>
            <th class="num">${escapeHtml(c.findingsColumnLabel)}</th>
            <th class="num">${escapeHtml(c.occurrencesColumnLabel)}</th>
            <th class="num">${escapeHtml(c.pagesMaxColumnLabel)}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td class="mono crit">${escapeHtml(row.criterion)}</td>
                  <td>${escapeHtml(getCriterionName(row.criterion, language) ?? '')}</td>
                  <td class="num">${formatNumber(row.findingCount, language)}</td>
                  <td class="num">${formatNumber(row.totalOccurrences, language)}</td>
                  <td class="num">${formatNumber(row.maxPages, language)}</td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>
      <p class="note">${escapeHtml(c.note)}</p>
    `
    : `<p class="note">${escapeHtml(c.emptyState)}</p>`;

  return `
    <section class="new-page">
      ${renderSectionHeader(c.eyebrow, c.heading)}
      ${showHedge ? `<p class="intro">${escapeHtml(c.intro)}</p>` : ''}
      ${body}
    </section>
  `;
}
