import type { AuditManifest, ReportLanguage } from '@odysseus/core';
import type { RenderDiffEvidencePage } from '../../screenshots.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatNumber, renderSectionHeader } from '../html-utils.js';

/** Alt text built from deterministic facts only (missing-content
 *  character counts), never a description of what the image actually
 *  shows - that would need a human or a vision model, neither of which
 *  this pipeline has. Weaker than a hand-written description, documented
 *  as a known gap rather than faked. See docs/report-v2-refactor.md E32. */
function renderAltText(
  strings: ReportStrings,
  language: ReportLanguage,
  template: string,
  pageUrl: string,
  textLength: number | null,
): string {
  const chars =
    textLength === null
      ? strings.renderDiffEvidence.altCharsUnknown
      : fillTemplate(strings.renderDiffEvidence.altCharsKnownTemplate, { n: formatNumber(textLength, language) });
  return fillTemplate(template, { url: pageUrl, chars });
}

function renderScreenshotCell(
  strings: ReportStrings,
  dataUri: string | null,
  altText: string,
  label: string,
): string {
  if (!dataUri) {
    return `<div class="shot" style="display:flex;height:40mm;align-items:center;justify-content:center;color:var(--mute);font-size:8pt;">${escapeHtml(strings.renderDiffEvidence.noScreenshotAvailable)}</div>`;
  }
  return `
    <figure class="shot">
      <img src="${dataUri}" alt="${escapeHtml(altText)}" />
      <figcaption>${escapeHtml(label)}</figcaption>
    </figure>
  `;
}

function renderPage(strings: ReportStrings, language: ReportLanguage, page: RenderDiffEvidencePage): string {
  const missingPercentText = page.missingPercent === undefined ? '' : `${page.missingPercent.toFixed(0)}%`;
  const countsText =
    page.rawTextLength === null || page.renderedTextLength === null
      ? strings.renderDiffEvidence.visibleTextCountsNotAvailable
      : fillTemplate(strings.renderDiffEvidence.visibleTextCountsTemplate, {
          raw: formatNumber(page.rawTextLength, language),
          rendered: formatNumber(page.renderedTextLength, language),
        });

  return `
    <div class="pair keep">
      <div class="pair-head">
        <span class="mono url">${escapeHtml(page.pageUrl)}</span>
        ${missingPercentText ? `<span class="miss">${escapeHtml(strings.renderDiffEvidence.missingPercentLabel)} : ${missingPercentText}</span>` : ''}
      </div>
      <div class="pair-grid">
        ${renderScreenshotCell(
          strings,
          page.rawDataUri,
          renderAltText(strings, language, strings.renderDiffEvidence.altRawTemplate, page.pageUrl, page.rawTextLength),
          strings.renderDiffEvidence.rawLabel,
        )}
        ${renderScreenshotCell(
          strings,
          page.renderedDataUri,
          renderAltText(
            strings,
            language,
            strings.renderDiffEvidence.altRenderedTemplate,
            page.pageUrl,
            page.renderedTextLength,
          ),
          strings.renderDiffEvidence.renderedLabel,
        )}
      </div>
      <p class="counts">${escapeHtml(countsText)}</p>
    </div>
  `;
}

export function renderRenderDiffEvidence(
  strings: ReportStrings,
  language: ReportLanguage,
  manifest: AuditManifest,
  pages: RenderDiffEvidencePage[],
): string {
  if (pages.length === 0) return '';

  const scannedPages = manifest.pages.filter((page) => page.status === 'visited').length;
  const healthyCount = Math.max(0, scannedPages - pages.length);
  const healthySummary =
    healthyCount > 0
      ? `<p><b>${escapeHtml(fillTemplate(strings.renderDiffEvidence.healthyPagesSummary, { healthy: healthyCount, total: scannedPages }))}</b></p>`
      : '';

  const pageBlocks = pages.map((page) => renderPage(strings, language, page)).join('');

  return `
    <section class="new-page">
      ${renderSectionHeader(strings.renderDiffEvidence.eyebrow, strings.renderDiffEvidence.heading)}
      <p class="intro">${escapeHtml(strings.renderDiffEvidence.intro)}</p>
      ${healthySummary}
      ${pageBlocks}
    </section>
  `;
}
