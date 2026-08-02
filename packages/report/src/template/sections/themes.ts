import type { Finding, Theme } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml } from '../html-utils.js';

function affectedPagesFor(theme: Theme, findingsById: Map<string, Finding>): string[] {
  const pages = new Set<string>();
  for (const findingId of theme.findingIds) {
    const finding = findingsById.get(findingId);
    if (!finding) continue;
    for (const pageUrl of finding.pageUrls) pages.add(pageUrl);
  }
  return [...pages];
}

function renderTheme(strings: ReportStrings, theme: Theme, findingsById: Map<string, Finding>): string {
  const levels = strings.themes.effortImpactLevels;
  const affectedPages = affectedPagesFor(theme, findingsById);
  const actions = theme.recommendedActions
    .map((action) => `<li>${escapeHtml(action)}</li>`)
    .join('');
  const pages = affectedPages.map((url) => `<li>${escapeHtml(url)}</li>`).join('');

  return `
    <article class="mt-6 avoid-break rounded border border-slate-200 p-4">
      <div class="flex items-baseline justify-between">
        <h3 class="text-lg font-semibold text-slate-900">
          <span class="text-slate-400">#${theme.priorityRank}</span> ${escapeHtml(theme.title)}
        </h3>
      </div>
      <p class="mt-2 text-sm text-slate-700">${escapeHtml(theme.businessImpact)}</p>
      ${
        theme.legalRelevance
          ? `<p class="mt-2 text-sm text-slate-600"><span class="font-semibold">${escapeHtml(strings.themes.legalRelevanceLabel)}:</span> ${escapeHtml(theme.legalRelevance)}</p>`
          : ''
      }
      <dl class="mt-3 flex gap-6 text-sm">
        <div>
          <dt class="text-slate-500">${escapeHtml(strings.themes.effortLabel)}</dt>
          <dd class="font-semibold text-slate-800">${escapeHtml(levels[theme.effort])}</dd>
        </div>
        <div>
          <dt class="text-slate-500">${escapeHtml(strings.themes.impactLabel)}</dt>
          <dd class="font-semibold text-slate-800">${escapeHtml(levels[theme.impact])}</dd>
        </div>
      </dl>
      ${
        actions
          ? `<div class="mt-3">
               <p class="text-sm font-semibold text-slate-700">${escapeHtml(strings.themes.recommendedActionsLabel)}</p>
               <ul class="mt-1 list-disc space-y-1 pl-6 text-sm text-slate-700">${actions}</ul>
             </div>`
          : ''
      }
      ${
        pages
          ? `<div class="mt-3">
               <p class="text-sm font-semibold text-slate-700">${escapeHtml(strings.themes.affectedPagesLabel)}</p>
               <ul class="mt-1 list-disc space-y-1 pl-6 text-xs text-slate-500">${pages}</ul>
             </div>`
          : ''
      }
    </article>
  `;
}

export function renderThemes(
  strings: ReportStrings,
  analysis: StoredAnalysis,
  findings: Finding[],
): string {
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const sortedThemes = [...analysis.themes].sort((a, b) => a.priorityRank - b.priorityRank);
  const themeBlocks = sortedThemes.map((theme) => renderTheme(strings, theme, findingsById)).join('');

  return `
    <section class="page-break-before pt-8">
      <h2 class="text-2xl font-bold text-slate-900">${escapeHtml(strings.themes.heading)}</h2>
      ${themeBlocks}
    </section>
  `;
}
