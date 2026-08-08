export { REPORT_TEMPLATE_VERSION } from './constants.js';
export type { GenerateReportInput, ReportTier, StoredAnalysis } from './types.js';

import { launchBrowser } from '@odysseus/scanner';
import type { GenerateReportInput } from './types.js';
import { resolveRenderDiffEvidence } from './screenshots.js';
import { renderHtml } from './template/render-html.js';
import { renderPdfFromHtml } from './pdf.js';

/** One Chromium instance for the whole report: evidence screenshot
 *  downscaling (screenshots.ts) and the final PDF print (pdf.ts) both
 *  reuse it, rather than launching a browser for each. */
export async function generateReportPdf(input: GenerateReportInput): Promise<Buffer> {
  const { browser } = await launchBrowser();
  try {
    const renderDiffEvidencePages = await resolveRenderDiffEvidence(
      input.manifest,
      input.auditDir,
      input.findings,
      browser,
    );

    const html = await renderHtml({
      manifest: input.manifest,
      findings: input.findings,
      analysis: input.analysis,
      renderDiffEvidencePages,
      ...(input.tier !== undefined ? { tier: input.tier } : {}),
    });

    const siteHost = new URL(input.manifest.siteUrl).host;
    return await renderPdfFromHtml(html, { siteHost, language: input.analysis.language }, browser);
  } finally {
    await browser.close();
  }
}
