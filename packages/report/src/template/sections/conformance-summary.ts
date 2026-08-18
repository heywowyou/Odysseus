import { getCriterionName } from '@odysseus/llm';
import type { Finding, ReportLanguage } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';
import { buildConformanceRollup, buildHeuristicRollup, type ConformanceRow } from '../conformance-rollup.js';

function headCell(label: string): string {
  return `<div style="padding:var(--space-2);font-size:11px;letter-spacing:0.02em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 60%, transparent);border-bottom:1px solid var(--color-divider)">${escapeHtml(label)}</div>`;
}

function cell(html: string, extra = ''): string {
  return `<div style="padding:var(--space-2);border-bottom:1px solid var(--color-divider);${extra}">${html}</div>`;
}

function renderRollupTable(
  strings: ReportStrings,
  language: ReportLanguage,
  rows: readonly ConformanceRow[],
  rowExtra = '',
): string {
  const c = strings.conformanceSummary;
  return `
    <div style="display:grid;grid-template-columns:100px 1fr 90px 100px 100px;font-size:14px">
      ${headCell(c.criterionColumnLabel)}
      ${headCell(c.criterionNameColumnLabel)}
      ${headCell(c.findingsColumnLabel)}
      ${headCell(c.occurrencesColumnLabel)}
      ${headCell(c.pagesMaxColumnLabel)}
      ${rows
        .map(
          (row) => `
            <div class="row-atomic" style="${rowExtra}">
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
  `;
}

/** R2: the conformance flag is computed here, in template code, never
 *  asked of the LLM and never added to the locked Theme schema. A WCAG
 *  failure is a different kind of fact from a slow image (C20/C21).
 *
 *  item 8: this table only ever sources rows from buildConformanceRollup,
 *  which itself excludes every HEURISTIC_RULE_IDS finding
 *  (conformance-rollup.ts). A heuristic red flag (alt-text-quality-
 *  heuristic) never renders here, no matter how many occurrences it has -
 *  it renders in the separate, clearly labeled "Signaux à vérifier" block
 *  below instead, sourced from buildHeuristicRollup. */
export function renderConformanceSummary(
  strings: ReportStrings,
  ordinal: number,
  findings: Finding[],
  language: ReportLanguage,
): string {
  const rows = buildConformanceRollup(findings);
  const heuristicRows = buildHeuristicRollup(findings);
  const c = strings.conformanceSummary;

  const body = rows.length
    ? renderRollupTable(strings, language, rows)
    : `<p style="font-size:13.5px;opacity:0.85">${escapeHtml(c.emptyState)}</p>`;

  const heuristicBlock = heuristicRows.length
    ? `
      <div class="hr"></div>
      <h5>${escapeHtml(c.heuristicSectionHeading)}</h5>
      <p style="font-size:12px;opacity:0.6;max-width:66ch;margin-bottom:var(--space-4)">${escapeHtml(c.heuristicSectionNote)}</p>
      <div style="border-left:2px solid var(--color-accent-300);padding-left:var(--space-3)">
        ${renderRollupTable(strings, language, heuristicRows, 'opacity:0.85')}
      </div>
    `
    : '';

  return sheet(`
    ${renderSheetHeader(ordinal, c.eyebrow, c.heading)}
    <p style="font-size:13.5px;opacity:0.85;max-width:66ch;margin-bottom:var(--space-2)">${escapeHtml(c.bodyIntro)}</p>
    <p style="font-size:11px;opacity:0.5;margin-bottom:var(--space-6)">${escapeHtml(c.scopeNote)}</p>
    ${body}
    ${heuristicBlock}
  `, '', 'section-07');
}
