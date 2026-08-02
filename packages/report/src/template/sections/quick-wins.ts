import type { Finding } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml } from '../html-utils.js';

const TOP_THEME_COUNT = 3;

export function renderWhatToDoFirst(
  strings: ReportStrings,
  analysis: StoredAnalysis,
  findings: Finding[],
): string {
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));

  const quickWinItems = analysis.quickWins
    .map((findingId) => findingsById.get(findingId))
    .filter((finding): finding is Finding => finding !== undefined)
    .map((finding) => `<li>${escapeHtml(finding.title)}</li>`)
    .join('');

  const topThemes = [...analysis.themes]
    .sort((a, b) => a.priorityRank - b.priorityRank)
    .slice(0, TOP_THEME_COUNT)
    .map((theme) => `<li><span class="font-semibold">${escapeHtml(theme.title)}</span>: ${escapeHtml(theme.businessImpact)}</li>`)
    .join('');

  return `
    <section class="mt-8 avoid-break">
      <h2 class="text-2xl font-bold text-slate-900">${escapeHtml(strings.whatToDoFirst.heading)}</h2>
      <p class="mt-2 text-base text-slate-700">${escapeHtml(strings.whatToDoFirst.intro)}</p>
      <ol class="mt-4 list-decimal space-y-2 pl-6 text-slate-800">
        ${topThemes}
      </ol>
      ${quickWinItems ? `<ul class="mt-4 list-disc space-y-1 pl-6 text-sm text-slate-600">${quickWinItems}</ul>` : ''}
    </section>
  `;
}
