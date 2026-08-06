import type { AuditManifest, ReportLanguage } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatDate, renderSectionHeader } from '../html-utils.js';

/** B15/B16: methodology and limitations used to be two sections that
 *  duplicated the same automated-coverage caveat near-verbatim, and
 *  neither stated the crawl size. Merged into one section
 *  (docs/report-v2-prototype-haaitza-fr.html section 9), with the crawl
 *  size and date folded into the tooling paragraph itself. */
export function renderMethodology(strings: ReportStrings, manifest: AuditManifest, language: ReportLanguage): string {
  const m = strings.methodology;
  const axeVersion = manifest.tool.axeCoreVersion ?? '-';
  const lighthouseVersion = manifest.tool.lighthouseVersion ?? '-';
  const pagesScanned = manifest.pages.filter((page) => page.status === 'visited').length;

  const toolingParagraph = fillTemplate(m.toolingParagraphTemplate, {
    axeVersion,
    lighthouseVersion,
    pages: pagesScanned,
    date: formatDate(new Date(manifest.startedAt), language),
  });

  return `
    <section class="new-page">
      ${renderSectionHeader(m.eyebrow, m.heading)}
      <p>${escapeHtml(toolingParagraph)}</p>
      <p>${escapeHtml(m.automatedCoverageCaveat)}</p>
      <p>${escapeHtml(m.legalCitationParagraph)}</p>
    </section>
  `;
}
