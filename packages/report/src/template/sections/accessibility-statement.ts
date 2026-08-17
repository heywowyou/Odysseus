import { getCriterionName } from '@odysseus/llm';
import type { Finding, ReportLanguage } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, renderSheetHeader, sheet } from '../html-utils.js';
import { buildConformanceRollup } from '../conformance-rollup.js';

function headCell(label: string, extra = ''): string {
  return `<div style="padding:var(--space-2);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 60%, transparent);border-bottom:1px solid var(--color-divider);${extra}">${escapeHtml(label)}</div>`;
}

function cell(html: string, extra = ''): string {
  return `<div style="padding:var(--space-2);border-bottom:1px solid var(--color-divider);${extra}">${html}</div>`;
}

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
        <div class="row-atomic">
          ${cell(`${escapeHtml(row.criterion)} - ${escapeHtml(getCriterionName(row.criterion, language) ?? '')}`)}
          ${cell(escapeHtml(a.nonConformantPartialLabel), 'color:var(--color-accent-300)')}
        </div>
      `,
    )
    .join('');

  return sheet(`
    ${renderSheetHeader(a.eyebrow, a.heading)}
    <p style="font-size:12px;opacity:0.55;margin-bottom:var(--space-6)">${escapeHtml(a.intro)}</p>
    <div style="display:grid;grid-template-columns:1fr 220px;font-size:14px;margin-bottom:var(--space-6)">
      ${headCell(a.criterionColumnLabel)}
      ${headCell(a.statusColumnLabel)}
      ${tableRows}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-6)">
      <div>
        <h5>${escapeHtml(a.contactHeading)}</h5>
        <p style="font-size:13px;opacity:0.7">${escapeHtml(a.contactBody)}</p>
      </div>
      <div>
        <h5>${escapeHtml(a.remediationPlanHeading)}</h5>
        <p style="font-size:13px;opacity:0.7">${escapeHtml(a.remediationPlanBody)}</p>
      </div>
    </div>
  `, '', 'section-10');
}
