export { REPORT_TEMPLATE_VERSION } from './constants.js';
export type { GenerateReportInput, StoredAnalysis } from './types.js';

import type { GenerateReportInput } from './types.js';
import { resolveRenderDiffEvidence } from './screenshots.js';
import { renderHtml } from './template/render-html.js';
import { renderPdfFromHtml } from './pdf.js';

export async function generateReportPdf(input: GenerateReportInput): Promise<Buffer> {
  const renderDiffEvidencePages = await resolveRenderDiffEvidence(input.manifest, input.auditDir);

  const html = await renderHtml({
    manifest: input.manifest,
    findings: input.findings,
    analysis: input.analysis,
    renderDiffEvidencePages,
  });

  return renderPdfFromHtml(html);
}
