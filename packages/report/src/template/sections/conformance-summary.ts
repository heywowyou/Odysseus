import { getCriterionName } from '@odysseus/llm';
import type { Finding, ReportLanguage } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';
import { buildConformanceRollup } from '../conformance-rollup.js';

function headCell(label: string): string {
  return `<div style="padding:var(--space-2);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 60%, transparent);border-bottom:1px solid var(--color-divider)">${escapeHtml(label)}</div>`;
}

function cell(html: string, extra = ''): string {
  return `<div style="padding:var(--space-2);border-bottom:1px solid var(--color-divider);${extra}">${html}</div>`;
}

/** R2: the conformance flag is computed here, in template code, never
 *  asked of the LLM and never added to the locked Theme schema. A WCAG
 *  failure is a different kind of fact from a slow image (C20/C21). */
export function renderConformanceSummary(strings: ReportStrings, findings: Finding[], language: ReportLanguage): string {
  const rows = buildConformanceRollup(findings);
  const c = strings.conformanceSummary;

  const body = rows.length
    ? `
      <div style="display:grid;grid-template-columns:100px 1fr 90px 100px 100px;font-size:14px">
        ${headCell(c.criterionColumnLabel)}
        ${headCell(c.criterionNameColumnLabel)}
        ${headCell(c.findingsColumnLabel)}
        ${headCell(c.occurrencesColumnLabel)}
        ${headCell(c.pagesMaxColumnLabel)}
        ${rows
          .map(
            (row) => `
              <div class="row-atomic">
                ${cell(escapeHtml(row.criterion), 'color:var(--color-accent-300)')}
                ${cell(escapeHtml(getCriterionName(row.criterion, language) ?? ''))}
                ${cell(formatNumber(row.findingCount, language))}
                ${cell(formatNumber(row.totalOccurrences, language))}
                ${cell(formatNumber(row.maxPages, language))}
              </div>
            `,
          )
          .join('')}
      </div>
    `
    : `<p style="font-size:13.5px;opacity:0.85">${escapeHtml(c.emptyState)}</p>`;

  return sheet(`
    ${renderSheetHeader(c.eyebrow, c.heading)}
    <p style="font-size:13.5px;opacity:0.85;max-width:66ch;margin-bottom:var(--space-2)">${escapeHtml(c.bodyIntro)}</p>
    <p style="font-size:11px;opacity:0.5;margin-bottom:var(--space-6)">${escapeHtml(c.scopeNote)}</p>
    ${body}
  `);
}
