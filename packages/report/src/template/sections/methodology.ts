import type { AuditManifest } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml } from '../html-utils.js';

export function renderMethodology(strings: ReportStrings, manifest: AuditManifest): string {
  const axeVersion = manifest.tool.axeCoreVersion ?? '-';
  const lighthouseVersion = manifest.tool.lighthouseVersion ?? '-';

  return `
    <section class="page-break-before pt-8">
      <h2 class="text-2xl font-bold text-slate-900">${escapeHtml(strings.methodology.heading)}</h2>
      <p class="mt-2 text-sm text-slate-700">${escapeHtml(strings.methodology.toolingIntro)}</p>
      <ul class="mt-3 space-y-1 text-sm text-slate-600">
        <li>${escapeHtml(strings.methodology.axeVersionLabel)}: ${escapeHtml(axeVersion)}</li>
        <li>${escapeHtml(strings.methodology.lighthouseVersionLabel)}: ${escapeHtml(lighthouseVersion)}</li>
        <li>${escapeHtml(strings.methodology.wcagTagSetLabel)}</li>
      </ul>
      <p class="mt-4 text-sm leading-relaxed text-slate-700">${escapeHtml(strings.methodology.automatedCoverageCaveat)}</p>
    </section>
  `;
}
