import { getCriterionName } from '@odysseus/llm';
import type { Finding, ReportLanguage } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';
import { buildConformanceRollup, buildHeuristicRollup, hasMultiCriterionFinding, type ConformanceRow } from '../conformance-rollup.js';

// Real <table>/<thead>/<tbody> markup, not a CSS grid of divs - same
// pagedjs-fragility fix findings-appendix.ts and core-web-vitals-
// table.ts already applied (see either file's own item 2.2 comment).
// A real La Corniche report (report-feedback-la-corniche-v2.md, this
// section's "Signaux à vérifier" heuristic call) showed this table's
// wrapped "Pages concernées" header split across a page break, its
// second line and the first data row stranded on the next page with
// no header above them - the exact class of Paged.js grid-fragility
// bug the two files above already document and fixed for their own
// tables. `white-space:nowrap` on the header cell stops the wrap that
// created the split point in the first place.
//
// Unlike those two files' tables, this one gets `break-inside: avoid`
// on the whole <table> (below), not just per-row protection. Once the
// header stopped wrapping, the same real report still split this table
// between its <thead> (page N) and its lone <tbody> row (page N+1),
// with no repeated header on the continuation page: paged.css's
// `table thead { display: table-header-group }` auto-repeat only
// engages once a table has already shown at least one body row before
// breaking, and this table had shown zero when the break landed right
// after the header. `break-after: avoid` on thead and `break-before:
// avoid` on tbody tr:first-child (both tried first) did not change the
// outcome. Whole-table atomicity is safe here specifically because
// both this table's row counts are bounded by a small fixed vocabulary
// (WCAG 2.2 AA success criteria; HEURISTIC_RULE_IDS) rather than by
// findings-appendix.ts's per-rule-group content, which trade-off 17
// (CLAUDE.md) found can grow taller than a page - the reason atomicity
// was removed there does not apply to a table that can never have more
// than a dozen or so rows.
function headCell(label: string, width: string): string {
  return `<th style="width:${width};padding:var(--space-2);font-size:11px;letter-spacing:0.02em;text-transform:uppercase;text-align:left;font-weight:400;color:color-mix(in srgb, var(--color-text) 60%, transparent);border-bottom:1px solid var(--color-divider);white-space:nowrap">${escapeHtml(label)}</th>`;
}

function cell(html: string, extra = ''): string {
  return `<td style="padding:var(--space-2);border-bottom:1px solid var(--color-divider);${extra}">${html}</td>`;
}

/** item 1.9: the heuristic table used to share this exact 5-column table
 *  (including a real WCAG criterion number) with the genuine-failure
 *  table, differing only by a heading and a slight opacity dip - a
 *  client's agency treated 19 heuristic rows sitting directly under the
 *  real failures table, with the same WCAG column, as 19 more confirmed
 *  failures. `showCriterionColumn` drops that column for the heuristic
 *  call (a heuristic flag is not a confirmed criterion failure, so it
 *  should not carry a criterion number at all), and a background tint
 *  (not just opacity) makes the block read as a structurally different
 *  table, not a lighter copy of the one above it. */
function renderRollupTable(
  strings: ReportStrings,
  language: ReportLanguage,
  rows: readonly ConformanceRow[],
  options: { rowExtra?: string; showCriterionColumn?: boolean } = {},
): string {
  const { rowExtra = '', showCriterionColumn = true } = options;
  const c = strings.conformanceSummary;
  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px;break-inside:avoid">
      <thead>
        <tr>
          ${showCriterionColumn ? headCell(c.criterionColumnLabel, '100px') : ''}
          ${headCell(c.criterionNameColumnLabel, 'auto')}
          ${headCell(c.findingsColumnLabel, '90px')}
          ${headCell(c.occurrencesColumnLabel, '100px')}
          ${headCell(c.pagesMaxColumnLabel, '100px')}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr style="${rowExtra}">
                ${showCriterionColumn ? cell(escapeHtml(row.criterion), 'color:var(--color-accent-300)') : ''}
                ${cell(escapeHtml(getCriterionName(row.criterion, language) ?? row.criterion))}
                ${cell(formatNumber(row.findingCount, language))}
                ${cell(formatNumber(row.totalOccurrences, language))}
                ${cell(formatNumber(row.pages, language))}
              </tr>
            `,
          )
          .join('')}
      </tbody>
    </table>
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

  const multiCriterionNote = hasMultiCriterionFinding(findings)
    ? `<p style="font-size:11px;opacity:0.5;margin-top:var(--space-2)">${escapeHtml(c.multiCriterionNote)}</p>`
    : '';

  const body = rows.length
    ? `${renderRollupTable(strings, language, rows)}${multiCriterionNote}`
    : `<p style="font-size:13.5px;opacity:0.85">${escapeHtml(c.emptyState)}</p>`;

  const heuristicBlock = heuristicRows.length
    ? `
      <div class="hr"></div>
      <h5>${escapeHtml(c.heuristicSectionHeading)}</h5>
      <p style="font-size:12px;opacity:0.6;max-width:66ch;margin-bottom:var(--space-4)">${escapeHtml(c.heuristicSectionNote)}</p>
      <div style="background:color-mix(in srgb, var(--color-accent-300) 6%, transparent);border-left:2px solid var(--color-accent-300);padding:var(--space-3)">
        ${renderRollupTable(strings, language, heuristicRows, { showCriterionColumn: false })}
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
