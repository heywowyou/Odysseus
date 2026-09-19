/**
 * The operator-only PDF twin of the full-scan outreach preview.
 *
 * Renders the SAME validated, linted HTML the public page serves through
 * Playwright's Chromium with a print stylesheet: one browser dependency,
 * no second renderer, and therefore no possibility of the PDF showing the
 * prospect something the HTML does not, or vice versa. The print treatment
 * lives in the preview's own `@media print` block: the same dark tokens as
 * the screen (operator direction 2026-09-11, trade-offs.md#81), with only
 * print layout and the CTA text-run rule differing.
 *
 * This is an operator artifact: it is returned from the authenticated audit
 * route with a download disposition, never persisted as a public object,
 * never sent to a prospect. It carries no Paged.js pagination and no paid
 * report data - the input is the finished preview HTML string, so a paid
 * report field could not reach this function even by accident.
 */

import { launchBrowser } from '@odysseus/scanner';
import { REPORT_PDF_CHROMIUM_ARGS } from '../constants.js';
import { assertOutreachPreviewHtml } from './preview-lint.js';

export async function generateOutreachPreviewPdf(html: string): Promise<Buffer> {
  // Prove the source passed the same public-document editorial lint before it
  // prints. The current v3 and historical v2 contracts intentionally share the
  // strict French editorial rules; the PDF remains a print of approved HTML,
  // never an independent renderer.
  assertOutreachPreviewHtml(html, { editorialV2: true, editorialCurrent: true });
  const { browser } = await launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      // Self-contained HTML: nothing to wait on network-wise.
      await page.setContent(html, { waitUntil: 'load' });
      return await page.pdf({
        printBackground: true,
        // The stylesheet's own @page rule (margin 0, full-bleed dark)
        // governs; this zero is the matching fallback, never a second
        // geometry.
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        preferCSSPageSize: true,
        tagged: true,
      });
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
