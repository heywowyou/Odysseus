export { REPORT_TEMPLATE_VERSION } from './constants.js';
export type { GenerateReportInput, StoredAnalysis } from './types.js';
/** Re-exported so packages/interface's job-completion gate (P0.1, 2026-08-21
 *  La Corniche feedback pass) can ask the same question the report itself
 *  asks, rather than re-deriving "was performance measured" from the
 *  manifest a second time in a different package. */
export { hasMeasuredCoreWebVitals } from './template/sections/core-web-vitals-table.js';

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
/** `--font-render-hinting=none`: a real La Corniche PDF (this session,
 *  2026-08-22) showed glyph-run splitting in the extracted text layer at
 *  font-weight 500+ combined with certain fractional sizes (e.g.
 *  "Vot re prest at aire", "conf ormit e"), the same class of defect
 *  letter-spacing.test.ts's docblock already names but could not pin
 *  down. Isolated with a standalone probe varying weight (400-700) and
 *  size (11-20px) independently through the real renderPdfFromHtml
 *  path: the defect was NOT a clean weight or size threshold (it hit
 *  weight 400 at some sizes too, inconsistently), which is why the
 *  earlier letter-spacing fix's approach (pick a safe numeric value)
 *  does not apply here. Disabling Chromium's font hinting for the PDF
 *  render eliminated it across all 18 tested weight/size combinations,
 *  with zero misses - a Chromium glyph-hinting/positioning artifact in
 *  its print-to-PDF text layer, not a CSS value to tune. Scoped to this
 *  one launch (see LaunchBrowserOptions in packages/scanner/src/
 *  browser.ts) rather than scanner's own crawl/axe/Lighthouse browser,
 *  which never renders to PDF and has no reason to change. */
export const REPORT_PDF_CHROMIUM_ARGS = ['--font-render-hinting=none'];

export async function generateReportPdf(input: GenerateReportInput): Promise<Buffer> {
  const { browser } = await launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS });
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
