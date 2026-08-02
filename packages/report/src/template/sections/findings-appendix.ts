import type { Finding, FindingCategory } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml } from '../html-utils.js';

const CATEGORY_ORDER: FindingCategory[] = ['accessibility', 'seo', 'performance', 'rendering'];

function renderRow(strings: ReportStrings, finding: Finding): string {
  const wcag = finding.wcagCriteria.join(', ');
  return `
    <tr class="border-b border-slate-100 align-top">
      <td class="py-2 pr-4 text-xs">
        <span class="font-semibold text-slate-800">${escapeHtml(finding.title)}</span>
        <span class="ml-1 text-slate-400">(${escapeHtml(finding.ruleId)})</span>
        <div class="mt-1 text-slate-500">${escapeHtml(strings.findingsAppendix.severityLabels[finding.severity])}</div>
      </td>
      <td class="py-2 pr-4 text-xs text-slate-600">${escapeHtml(finding.pageUrls.length.toString())}</td>
      <td class="py-2 pr-4 text-xs text-slate-600">${escapeHtml(finding.occurrences.toString())}</td>
      <td class="py-2 pr-4 text-xs text-slate-600">${wcag ? escapeHtml(wcag) : ''}</td>
    </tr>
  `;
}

function renderCategorySection(
  strings: ReportStrings,
  category: FindingCategory,
  findings: Finding[],
): string {
  if (findings.length === 0) return '';

  const sorted = [...findings].sort((a, b) => a.findingId.localeCompare(b.findingId));
  const rows = sorted.map((finding) => renderRow(strings, finding)).join('');

  return `
    <div class="mt-6 avoid-break">
      <h3 class="text-lg font-semibold text-slate-900">${escapeHtml(strings.findingsAppendix.categoryLabels[category])}</h3>
      <table class="mt-2 w-full border-collapse text-left">
        <thead>
          <tr class="border-b-2 border-slate-300 text-xs uppercase text-slate-500">
            <th class="py-2 pr-4">${escapeHtml(strings.findingsAppendix.ruleColumnLabel)}</th>
            <th class="py-2 pr-4">${escapeHtml(strings.findingsAppendix.pagesColumnLabel)}</th>
            <th class="py-2 pr-4">${escapeHtml(strings.findingsAppendix.occurrencesColumnLabel)}</th>
            <th class="py-2 pr-4">${escapeHtml(strings.findingsAppendix.wcagColumnLabel)}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export function renderFindingsAppendix(strings: ReportStrings, findings: Finding[]): string {
  const byCategory = CATEGORY_ORDER.map((category) => ({
    category,
    findings: findings.filter((finding) => finding.category === category),
  }));

  const sections = byCategory
    .map(({ category, findings: categoryFindings }) =>
      renderCategorySection(strings, category, categoryFindings),
    )
    .join('');

  return `
    <section class="page-break-before pt-8">
      <h2 class="text-2xl font-bold text-slate-900">${escapeHtml(strings.findingsAppendix.heading)}</h2>
      <p class="mt-2 text-sm text-slate-600">${escapeHtml(strings.findingsAppendix.intro)}</p>
      ${sections}
    </section>
  `;
}
