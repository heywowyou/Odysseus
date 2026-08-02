import type { RenderDiffEvidencePage } from '../../screenshots.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml } from '../html-utils.js';

function renderScreenshotCell(dataUri: string | null, label: string, noneText: string): string {
  if (!dataUri) {
    return `<div class="flex h-40 items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-400">${escapeHtml(noneText)}</div>`;
  }
  return `
    <figure>
      <img src="${dataUri}" alt="${escapeHtml(label)}" class="w-full rounded border border-slate-200 object-cover" />
      <figcaption class="mt-1 text-xs text-slate-500">${escapeHtml(label)}</figcaption>
    </figure>
  `;
}

function renderPage(strings: ReportStrings, page: RenderDiffEvidencePage): string {
  const missingPercentText =
    page.missingPercent === undefined ? '' : `${page.missingPercent.toFixed(0)}%`;

  return `
    <article class="mt-6 avoid-break">
      <p class="text-sm font-semibold text-slate-800">${escapeHtml(page.pageUrl)}</p>
      ${
        missingPercentText
          ? `<p class="text-xs text-slate-500">${escapeHtml(strings.renderDiffEvidence.missingPercentLabel)}: ${missingPercentText}</p>`
          : ''
      }
      <div class="mt-2 grid grid-cols-2 gap-4">
        ${renderScreenshotCell(page.rawDataUri, strings.renderDiffEvidence.rawLabel, strings.renderDiffEvidence.noScreenshotAvailable)}
        ${renderScreenshotCell(page.renderedDataUri, strings.renderDiffEvidence.renderedLabel, strings.renderDiffEvidence.noScreenshotAvailable)}
      </div>
    </article>
  `;
}

export function renderRenderDiffEvidence(
  strings: ReportStrings,
  pages: RenderDiffEvidencePage[],
): string {
  if (pages.length === 0) return '';

  const pageBlocks = pages.map((page) => renderPage(strings, page)).join('');

  return `
    <section class="page-break-before pt-8">
      <h2 class="text-2xl font-bold text-slate-900">${escapeHtml(strings.renderDiffEvidence.heading)}</h2>
      <p class="mt-2 text-sm text-slate-600">${escapeHtml(strings.renderDiffEvidence.intro)}</p>
      ${pageBlocks}
    </section>
  `;
}
