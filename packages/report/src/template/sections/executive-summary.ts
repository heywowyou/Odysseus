import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml } from '../html-utils.js';

const RISK_BADGE_CLASSES: Record<StoredAnalysis['overallRisk'], string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-800',
};

export function renderExecutiveSummary(strings: ReportStrings, analysis: StoredAnalysis): string {
  const riskLabel = strings.executiveSummary.riskLevels[analysis.overallRisk];
  return `
    <section class="page-break-before pt-8">
      <h2 class="text-2xl font-bold text-slate-900">${escapeHtml(strings.executiveSummary.heading)}</h2>
      <p class="mt-4 text-base leading-relaxed text-slate-700">${escapeHtml(analysis.executiveSummary)}</p>
      <p class="mt-4">
        <span class="text-sm text-slate-500">${escapeHtml(strings.executiveSummary.overallRiskLabel)}:</span>
        <span class="ml-2 inline-block rounded px-2 py-1 text-sm font-semibold ${RISK_BADGE_CLASSES[analysis.overallRisk]}">
          ${escapeHtml(riskLabel)}
        </span>
      </p>
    </section>
  `;
}
