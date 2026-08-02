import type { ReportLanguage } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, formatDate } from '../html-utils.js';

export function renderCover(
  strings: ReportStrings,
  siteUrl: string,
  auditStartedAt: Date,
  language: ReportLanguage,
): string {
  return `
    <section class="min-h-[247mm] flex flex-col justify-between">
      <div></div>
      <div>
        <h1 class="text-4xl font-bold text-slate-900">${escapeHtml(strings.cover.reportTitle)}</h1>
        <p class="mt-4 text-xl text-slate-600">${escapeHtml(siteUrl)}</p>
        <p class="mt-2 text-base text-slate-500">
          ${escapeHtml(strings.cover.dateLabel)}: ${escapeHtml(formatDate(auditStartedAt, language))}
        </p>
      </div>
      <div></div>
    </section>
  `;
}
