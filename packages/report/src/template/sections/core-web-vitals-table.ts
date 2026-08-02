import type { AuditManifest, CoreWebVitalMeasurement } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml } from '../html-utils.js';

function cell(measurement: CoreWebVitalMeasurement | undefined, notMeasuredText: string): string {
  const displayValue = measurement?.displayValue;
  return displayValue
    ? escapeHtml(displayValue)
    : `<span class="text-slate-400">${escapeHtml(notMeasuredText)}</span>`;
}

export function renderCoreWebVitalsTable(strings: ReportStrings, manifest: AuditManifest): string {
  const scannedPages = manifest.pages.filter((page) => page.pageDir !== undefined);
  if (scannedPages.length === 0) return '';

  const rows = scannedPages
    .map(
      (page) => `
        <tr class="border-b border-slate-100">
          <td class="py-2 pr-4 text-xs text-slate-700">${escapeHtml(page.url)}</td>
          <td class="py-2 pr-4 text-xs">${cell(page.coreWebVitals?.lcp, strings.coreWebVitals.notMeasured)}</td>
          <td class="py-2 pr-4 text-xs">${cell(page.coreWebVitals?.cls, strings.coreWebVitals.notMeasured)}</td>
          <td class="py-2 pr-4 text-xs">${cell(page.coreWebVitals?.tbt, strings.coreWebVitals.notMeasured)}</td>
        </tr>
      `,
    )
    .join('');

  return `
    <section class="page-break-before pt-8">
      <h2 class="text-2xl font-bold text-slate-900">${escapeHtml(strings.coreWebVitals.heading)}</h2>
      <p class="mt-2 text-sm text-slate-600">${escapeHtml(strings.coreWebVitals.intro)}</p>
      <table class="mt-4 w-full border-collapse text-left">
        <thead>
          <tr class="border-b-2 border-slate-300 text-xs uppercase text-slate-500">
            <th class="py-2 pr-4">${escapeHtml(strings.coreWebVitals.pageColumnLabel)}</th>
            <th class="py-2 pr-4">${escapeHtml(strings.coreWebVitals.lcpColumnLabel)}</th>
            <th class="py-2 pr-4">${escapeHtml(strings.coreWebVitals.clsColumnLabel)}</th>
            <th class="py-2 pr-4">${escapeHtml(strings.coreWebVitals.tbtColumnLabel)}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}
