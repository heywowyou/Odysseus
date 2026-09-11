export { REPORT_TEMPLATE_VERSION } from './constants.js';
export type {
  GenerateReportInput,
  ReportRenderMetadata,
  StoredAnalysis,
  VerifiedStoredAnalysis,
} from './types.js';
export { classifyReportFreshness } from './freshness.js';
export type { ReportFreshness, ReportFreshnessMetadata } from './freshness.js';
/** Plan 032 (issue #162): re-exported so the interface analysis stage's
 *  static fallback analysis reads the exact same bilingual sentences the
 *  report template renders, instead of inlining a second copy that could
 *  drift from the report chrome. */
export { getStrings } from './template/strings/i18n.js';
/** Plan 018 page-count warning decision shared with interface (report
 *  stage) and the CLI; the count itself is measured in pdf.ts. */
export { REPORT_PAGE_COUNT_WARNING_THRESHOLD, reportPageCountWarning } from './pdf.js';
export type { ReportPageCountWarning, RenderedPdfWithPageCount } from './pdf.js';
/** Re-exported so packages/interface's job-completion gate (P0.1, 2026-08-21
 *  La Corniche feedback pass) can ask the same question the report itself
 *  asks, rather than re-deriving "was performance measured" from the
 *  manifest a second time in a different package. */
export { hasMeasuredCoreWebVitals } from './template/sections/core-web-vitals-table.js';

/** The outreach preview. A separate document kind from the paid report, not a
 *  tier of it: synchronous, HTML only, no Chromium, and built from its own
 *  narrow input contract rather than from `GenerateReportInput`. Do not spread
 *  a report input into a preview input - the whole safety argument is that the
 *  unsafe fields have nowhere to go. */
export { generateOutreachPreviewHtml } from './outreach-preview/render-html.js';
export { generateOutreachPreviewHtmlV2 } from './outreach-preview/render-html-v2.js';
export {
  OUTREACH_PROOF_CARD_COPY,
  type OutreachProofCardCopyEntry,
} from './outreach-preview/proof-card-copy.js';
export { generateOutreachPreviewPdf } from './outreach-preview/pdf-v2.js';
export { embedOutreachEvidenceAsset } from './outreach-preview/evidence-input.js';
export type { OutreachEvidenceSlot } from './outreach-preview/evidence-input.js';
export { ReportIdentityUnconfirmedError } from './errors.js';
export {
  lintOutreachPreviewHtml,
  OutreachPreviewLintError,
} from './outreach-preview/preview-lint.js';
export type {
  OutreachPreviewImage,
  OutreachPreviewInput,
  OutreachPreviewLanguage,
  PublicFindingSummary,
} from './outreach-preview/types.js';

import { launchBrowser } from '@odysseus/scanner';
import { REPORT_PDF_CHROMIUM_ARGS } from './constants.js';
import type { GenerateReportInput } from './types.js';
import { resolveRenderDiffEvidence } from './screenshots.js';
import { renderHtml } from './template/render-html.js';
import { findRenderLintViolations } from './template/render-lint.js';
import { findUnconfirmedIdentityFields } from './template/unconfirmed-fields.js';
import { renderPdfWithPageCountFromHtml } from './pdf.js';
import type { RenderedPdfWithPageCount } from './pdf.js';
import { ReportIdentityUnconfirmedError } from './errors.js';

/** Chromium is launched once for the whole report and used solely for the
 *  final Paged.js print (pdf.ts) - resolveRenderDiffEvidence no longer
 *  needs a browser at all since section 08 stopped embedding screenshots
 *  (docs/report/report-design-system.md section 3). */
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
export { REPORT_PDF_CHROMIUM_ARGS } from './constants.js';

/** Issue #93: the reviewed FR/EN remediation copy per scanner rule and the
 *  French rule-title translations, re-exported so the operator dashboard's
 *  audit-detail route serves the same reviewed copy the PDF renders,
 *  instead of a mirror table drifting from it. */
export { remediationFor } from './template/remediation/index.js';
export { RULE_TRANSLATIONS_FR } from './template/rule-translations.js';
export type { RuleTranslation } from './template/rule-translations.js';

export async function generateReportPdf(
  input: GenerateReportInput,
): Promise<RenderedPdfWithPageCount> {
  // D8: refuse before doing any work, not after rendering - the operator
  // needs to be told to confirm the name, not handed a PDF with a guess on
  // its cover.
  const unconfirmed = findUnconfirmedIdentityFields(input.manualFields);
  if (unconfirmed.length > 0) {
    const details = unconfirmed
      .map((f) => `  - ${f.field}: "${f.value}" (detected, not confirmed)`)
      .join('\n');
    throw new ReportIdentityUnconfirmedError(
      unconfirmed,
      'Report generation aborted: the client identity on the cover is still a detected guess, ' +
        `never shipped to a client unconfirmed:\n${details}\n` +
        'Confirm or correct these fields in the dashboard, then regenerate.',
    );
  }

  // Issue #6: a caller rendering both language reports for one audit back
  // to back can pass an already-launched browser (report-stage.ts's
  // runAllReportsStage) so the two passes share one Chromium launch
  // instead of paying for it twice. Ownership follows who launched it:
  // this function only closes a browser it launched itself.
  const ownsBrowser = input.browser === undefined;
  const browser =
    input.browser ?? (await launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS })).browser;
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
      renderMetadata: input.renderMetadata,
      renderDiffEvidencePages,
      renderDiffTotalEligible,
      renderDiffWrapperOrLegalExcludedCount,
      ...(input.manualFields !== undefined ? { manualFields: input.manualFields } : {}),
      ...(input.preparation !== undefined ? { preparation: input.preparation } : {}),
    });

    const lintViolations = findRenderLintViolations(html);
    if (lintViolations.length > 0) {
      const details = lintViolations.map((v) => `  - ${v.label}: "...${v.context}..."`).join('\n');
      throw new Error(
        `Report generation aborted: rendered HTML contains ${lintViolations.length} render-lint violation(s), never shipped to a client:\n${details}`,
      );
    }

    return await renderPdfWithPageCountFromHtml(html, browser);
  } finally {
    if (ownsBrowser) await browser.close();
  }
}
