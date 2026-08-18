export { REPORT_TEMPLATE_VERSION } from './constants.js';
export type { GenerateReportInput, StoredAnalysis } from './types.js';

import { launchBrowser } from '@odysseus/scanner';
import type { GenerateReportInput } from './types.js';
import { resolveRenderDiffEvidence } from './screenshots.js';
import { renderHtml } from './template/render-html.js';
import { findRenderLintViolations } from './template/render-lint.js';
import { renderPdfFromHtml } from './pdf.js';

/** Chromium is launched once for the whole report and used solely for the
 *  final Paged.js print (pdf.ts) - resolveRenderDiffEvidence no longer
 *  needs a browser at all since section 08 stopped embedding screenshots
 *  (docs/report-design-system.md section 3). */
export async function generateReportPdf(input: GenerateReportInput): Promise<Buffer> {
  const { browser } = await launchBrowser();
  try {
    const {
      pages: renderDiffEvidencePages,
      totalEligible: renderDiffTotalEligible,
      wrapperOrLegalExcludedCount: renderDiffWrapperOrLegalExcludedCount,
    } = resolveRenderDiffEvidence(input.manifest, input.findings);

    const html = await renderHtml({
      manifest: input.manifest,
      findings: input.findings,
      analysis: input.analysis,
      renderDiffEvidencePages,
      renderDiffTotalEligible,
      renderDiffWrapperOrLegalExcludedCount,
      ...(input.manualFields !== undefined ? { manualFields: input.manualFields } : {}),
    });

    const lintViolations = findRenderLintViolations(html);
    if (lintViolations.length > 0) {
      const details = lintViolations
        .map((v) => `  - ${v.label}: "...${v.context}..."`)
        .join('\n');
      throw new Error(
        `Report generation aborted: rendered HTML contains ${lintViolations.length} render-lint violation(s), never shipped to a client:\n${details}`
      );
    }

    return await renderPdfFromHtml(html, browser);
  } finally {
    await browser.close();
  }
}
