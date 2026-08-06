/**
 * Reuses a Browser launched once by generateReportPdf (index.ts) via
 * launchBrowser from @odysseus/scanner (the milestone's own decision:
 * reuse the Chromium lifecycle already built there, one browser
 * dependency, not a second Playwright entry point via Puppeteer), rather
 * than launching a second browser here - the same instance already used
 * to downscale evidence screenshots (screenshots.ts) renders the final
 * PDF too. The CDP debug port launchBrowser always opens is unused here;
 * it exists for Lighthouse's independent connection at scan time and is
 * harmless idle weight for a plain print-to-PDF.
 */

import type { Browser } from 'playwright';
import type { ReportLanguage } from '@odysseus/core';
import { escapeHtml } from './template/html-utils.js';
import { getStrings } from './template/strings/i18n.js';

/** Kept in sync by hand with report.css's @page rule - see that file's
 *  comment. Playwright's margin option is authoritative for the actual
 *  PDF (preferCSSPageSize is never set), the CSS rule only matters for a
 *  developer opening the raw HTML directly in a browser. */
const PDF_MARGIN = { top: '15mm', right: '14mm', bottom: '20mm', left: '14mm' };

/** Runs in a separate isolated context with no access to page CSS or JS,
 *  per Playwright's footerTemplate contract - every style must be inline
 *  and only web-safe font stacks are available. Built ahead of time in
 *  Node rather than referencing any template function, since nothing in
 *  this isolated context can call one. siteHost is client-controlled
 *  (derived from the audit's own siteUrl) and must be escaped. */
function buildFooterTemplate(siteHost: string, language: ReportLanguage): string {
  const strings = getStrings(language);
  return `
<div style="width:100%;font-size:7pt;color:#5B6672;padding:0 14mm;
  font-family:Helvetica,Arial,sans-serif;display:flex;justify-content:space-between;">
  <span>${escapeHtml(siteHost)} &middot; ${escapeHtml(strings.footer.confidentialityLabel)}</span>
  <span>${escapeHtml(strings.footer.pageLabel)} <span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>`;
}

export interface RenderPdfOptions {
  /** Client-controlled - the audit's own site host, shown in the footer. */
  siteHost: string;
  language: ReportLanguage;
}

export async function renderPdfFromHtml(html: string, options: RenderPdfOptions, browser: Browser): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    // The HTML is fully self-contained (CSS inlined, screenshots as data
    // URIs), so there is nothing to wait on network-wise; 'load' is enough.
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      tagged: true, // fixes E31: an accessibility audit must not ship an untagged PDF
      outline: true, // fixes D26: a bookmark tree derived from the heading hierarchy
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: buildFooterTemplate(options.siteHost, options.language),
      margin: PDF_MARGIN,
    });
    return pdf;
  } finally {
    await page.close();
  }
}
