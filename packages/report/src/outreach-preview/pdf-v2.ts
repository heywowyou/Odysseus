/**
 * The operator-only PDF twin of the v2 scorecard preview (plan 037).
 *
 * Renders the SAME validated, linted HTML the public page serves through
 * Playwright's Chromium with a print stylesheet: one browser dependency,
 * no second renderer, and therefore no possibility of the PDF showing the
 * prospect something the HTML does not, or vice versa. The print treatment
 * (light ground, print-safe severity pairs) lives in the preview's own
 * `@media print` block, the same way the paid report prints through
 * paged.css.
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
  // Prove the source passed the document lint before it prints: the PDF is
  // a print of an approved public document, never an independent render.
  assertOutreachPreviewHtml(html);
  const { browser } = await launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      // Self-contained HTML: nothing to wait on network-wise.
      await page.setContent(html, { waitUntil: 'load' });
      return await page.pdf({
        printBackground: true,
        margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' },
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
