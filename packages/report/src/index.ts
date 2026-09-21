export { REPORT_TEMPLATE_VERSION } from './constants.js';
export type {
  GenerateReportInput,
  ReportRenderMetadata,
  ReportTheme,
  StoredAnalysis,
  VerifiedStoredAnalysis,
} from './types.js';
export { DEFAULT_REPORT_THEME } from './types.js';
export { classifyReportFreshness, reportUsesCurrentTemplate } from './freshness.js';
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
export {
  buildWritingPerformanceEvidence,
  buildTrustedRemediationsByTheme,
} from './template/sections/writing-evidence.js';
/** Plan 072: the render-bundle contract, shared by the interface (which
 *  assembles a bundle from Mongo) and the CLI finalizer (which parses one
 *  off disk with no database). See render-bundle.ts for why it lives here. */
export { buildRenderBundle, parseRenderBundle } from './render-bundle.js';
/** Plan 072: applying an operator's override file to a bundle. Rebuilds the
 *  writing input the prose was generated from, so the correction is judged
 *  against the same evidence the writer was. */
export {
  applyOverridesToBundle,
  findWritingInputRebuildIssue,
  projectWritingOutput,
  rebuildWritingInput,
} from './finalize-bundle.js';
export type { FinalizedBundle, RefusedBundle } from './finalize-bundle.js';
export type { RenderBundle, RenderBundleLineage, ReportRenderInputs } from './render-bundle.js';
import {
  REFERENCE_AUDIT_DATA_DISCLOSURE_FR,
  type ReferenceAuditShowcase,
} from './reference-audit.js';
export {
  RENDER_BUNDLE_FILES,
  readRenderBundleDir,
  writeRenderBundleDir,
} from './render-bundle-files.js';
export { buildRenderedPriorities } from './template/rendered-priorities.js';
export type { RenderedPriority, PriorityEvidence } from './template/rendered-priorities.js';
export {
  assertReferenceAuditNoLeaks,
  buildReferenceAuditShowcase,
  findReferenceAuditLeaks,
  referenceAuditManifestDigest,
  renderInputsForReferenceAudit,
  REFERENCE_AUDIT_ANONYMIZER_VERSION,
  REFERENCE_AUDIT_CANONICAL_PATH,
  REFERENCE_AUDIT_DISCLOSURE_FR,
  REFERENCE_AUDIT_DATA_DISCLOSURE_FR,
  REFERENCE_AUDIT_RELEASE_VERSION,
  ReferenceAuditPublicationError,
} from './reference-audit.js';
export type {
  ReferenceAuditLeakScanInput,
  ReferenceAuditShowcase,
  ReferenceAuditShowcaseBundle,
  ReferenceAuditSource,
} from './reference-audit.js';

/** The outreach preview. A separate document kind from the paid report, not a
 *  tier of it: synchronous, HTML only, no Chromium, and built from its own
 *  narrow input contract rather than from `GenerateReportInput`. Do not spread
 *  a report input into a preview input - the whole safety argument is that the
 *  unsafe fields have nowhere to go. */
export { generateOutreachPreviewHtml } from './outreach-preview/render-html.js';
export { generateOutreachPreviewHtmlV2 } from './outreach-preview/render-html-v2.js';
export { generateOutreachPreviewHtmlV3 } from './outreach-preview/render-html-v3.js';
export type { OutreachProofCardCopyEntry } from './outreach-preview/proof-card-copy.js';
export {
  OUTREACH_PROOF_CARD_CLIENT_COPY as OUTREACH_PROOF_CARD_COPY,
  outreachProofCardCopy,
} from './outreach-preview/proof-card-client-copy.js';
export { generateOutreachPreviewPdf } from './outreach-preview/pdf-v2.js';
export { embedOutreachEvidenceAsset } from './outreach-preview/evidence-input.js';
export type { OutreachEvidenceSlot } from './outreach-preview/evidence-input.js';
export { MissingReviewedRemediationError, ReportIdentityUnconfirmedError } from './errors.js';
export { findUnconfirmedIdentityFields } from './template/unconfirmed-fields.js';
export type { UnconfirmedField } from './template/unconfirmed-fields.js';
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
import { REPORT_PDF_CHROMIUM_ARGS, REPORT_TEMPLATE_VERSION } from './constants.js';
import { DEFAULT_REPORT_THEME, type GenerateReportInput, type ReportTheme } from './types.js';
import { resolveRenderDiffEvidence } from './screenshots.js';
import { renderHtml } from './template/render-html.js';
import { findRenderLintViolations } from './template/render-lint.js';
import { findUnconfirmedIdentityFields } from './template/unconfirmed-fields.js';
import { renderPdfWithPageCountFromHtml } from './pdf.js';
import {
  describeReportPdfIntegrityDefects,
  findReportPdfIntegrityDefects,
} from './pdf-integrity.js';
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

/** Issue: operator-reviewed overall grade override. Re-exported so the
 *  dashboard's grade-override route computes the exact same automatic grade
 *  the report itself would render, instead of duplicating the "which grade
 *  wins" decision in @odysseus/interface. */
export { computeAutomaticGrade, resolveEffectiveGrade } from './template/grade.js';
export { summarizeThirdPartyFindings } from './template/third-party-attribution.js';

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
      theme: input.theme ?? DEFAULT_REPORT_THEME,
      manifest: input.manifest,
      findings: input.findings,
      analysis: input.analysis,
      renderMetadata: input.renderMetadata,
      renderDiffEvidencePages,
      renderDiffTotalEligible,
      renderDiffWrapperOrLegalExcludedCount,
      ...(input.manualFields !== undefined ? { manualFields: input.manualFields } : {}),
      ...(input.preparation !== undefined ? { preparation: input.preparation } : {}),
      ...(input.gradeOverride !== undefined ? { gradeOverride: input.gradeOverride } : {}),
      ...(input.delta !== undefined ? { delta: input.delta } : {}),
      ...(input.qualityLimitations !== undefined
        ? { qualityLimitations: input.qualityLimitations }
        : {}),
    });

    const lintViolations = findRenderLintViolations(html);
    if (lintViolations.length > 0) {
      const details = lintViolations.map((v) => `  - ${v.label}: "...${v.context}..."`).join('\n');
      throw new Error(
        `Report generation aborted: rendered HTML contains ${lintViolations.length} render-lint violation(s), never shipped to a client:\n${details}`,
      );
    }

    const rendered = await renderPdfWithPageCountFromHtml(html, browser);
    // The layout gates judged the Paged.js DOM; this judges the file the
    // client opens (fonts, language, title, tagging, links, active content).
    const defects = findReportPdfIntegrityDefects(rendered.pdf, {
      language: input.analysis.language,
      pageCount: rendered.pageCount,
    });
    if (defects.length > 0) throw new Error(describeReportPdfIntegrityDefects(defects));
    return rendered;
  } finally {
    if (ownsBrowser) await browser.close();
  }
}

export interface GeneratedReportVariants {
  /** The canonical artifact. A light failure never changes these bytes. */
  dark: RenderedPdfWithPageCount;
  /** The sibling artifact, when its independent render succeeded. */
  light?: RenderedPdfWithPageCount;
  /** A light-only failure is observable to the caller so it can persist the
   * dark artifact and make the light choice unavailable without substituting
   * dark bytes under a light label. */
  lightError?: Error;
}

/** Render both presentation variants from one resolved input set and one
 * Chromium instance. The dark render is authoritative: a dark failure
 * rejects, while a light-only failure is returned for the persistence layer
 * to surface as an unavailable optional variant. */
export async function generateReportPdfVariants(
  input: GenerateReportInput,
): Promise<GeneratedReportVariants> {
  const ownsBrowser = input.browser === undefined;
  const browser =
    input.browser ?? (await launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS })).browser;
  try {
    const baseInput = { ...input, browser };
    const dark = await generateReportPdf({ ...baseInput, theme: 'dark' satisfies ReportTheme });
    try {
      const light = await generateReportPdf({
        ...baseInput,
        theme: 'light' satisfies ReportTheme,
      });
      if (light.pageCount !== dark.pageCount) {
        return {
          dark,
          lightError: new Error(
            `light report pagination changed from ${dark.pageCount} pages to ${light.pageCount} pages`,
          ),
        };
      }
      return { dark, light };
    } catch (error) {
      return {
        dark,
        lightError: error instanceof Error ? error : new Error(String(error)),
      };
    }
  } finally {
    if (ownsBrowser) await browser.close();
  }
}

/** Render the publication-safe showcase with the exact paid-report renderer.
 * The adapter only supplies detached inputs and a disclosure; pagination,
 * Paged.js, PDF integrity and all report lint gates remain in
 * `generateReportPdf`. */
export async function generateReferenceAuditPdf(
  showcase: ReferenceAuditShowcase,
  options: {
    renderedAt?: Date;
    rendererBuild?: string;
    reportId?: string;
    browser?: GenerateReportInput['browser'];
  } = {},
): Promise<RenderedPdfWithPageCount> {
  const { bundle } = showcase;
  const inputs = bundle.renderInputs;
  return generateReportPdf({
    renderMetadata: {
      reportId: options.reportId ?? 'reference-audit',
      renderedAt: options.renderedAt ?? new Date(),
      rendererBuild: options.rendererBuild ?? 'reference-audit',
      templateVersion: REPORT_TEMPLATE_VERSION,
      documentDisclosure: bundle.disclosure,
      referenceDataDisclosure: REFERENCE_AUDIT_DATA_DISCLOSURE_FR,
      footerLabel: 'Exemple public',
    },
    // The report template is intentionally screenshot-free. Keeping this
    // empty also makes the no-source-path contract explicit at this seam.
    auditDir: '',
    manifest: bundle.manifest,
    findings: bundle.findings,
    analysis: bundle.analysis,
    ...(inputs.manualFields === undefined ? {} : { manualFields: inputs.manualFields }),
    ...(inputs.preparation === undefined ? {} : { preparation: inputs.preparation }),
    ...(inputs.gradeOverride === undefined ? {} : { gradeOverride: inputs.gradeOverride }),
    ...(inputs.delta === undefined ? {} : { delta: inputs.delta }),
    ...(inputs.qualityLimitations === undefined
      ? {}
      : { qualityLimitations: inputs.qualityLimitations }),
    ...(options.browser === undefined ? {} : { browser: options.browser }),
  });
}

/** The pre-PDF HTML used by the same showcase render input. Publication code
 * uses this to run the identity leak gate before Chromium starts; callers must
 * still use `generateReferenceAuditPdf` for the final PDF gates. */
export async function renderReferenceAuditHtml(
  showcase: ReferenceAuditShowcase,
  options: { renderedAt?: Date; rendererBuild?: string; reportId?: string } = {},
): Promise<string> {
  const { bundle } = showcase;
  const inputs = bundle.renderInputs;
  const renderDiff = resolveRenderDiffEvidence(bundle.manifest, bundle.findings);
  return renderHtml({
    renderMetadata: {
      reportId: options.reportId ?? 'reference-audit',
      renderedAt: options.renderedAt ?? new Date(),
      rendererBuild: options.rendererBuild ?? 'reference-audit',
      templateVersion: REPORT_TEMPLATE_VERSION,
      documentDisclosure: bundle.disclosure,
      referenceDataDisclosure: REFERENCE_AUDIT_DATA_DISCLOSURE_FR,
      footerLabel: 'Exemple public',
    },
    manifest: bundle.manifest,
    findings: bundle.findings,
    analysis: bundle.analysis,
    renderDiffEvidencePages: renderDiff.pages,
    renderDiffTotalEligible: renderDiff.totalEligible,
    renderDiffWrapperOrLegalExcludedCount: renderDiff.wrapperOrLegalExcludedCount,
    ...(inputs.manualFields === undefined ? {} : { manualFields: inputs.manualFields }),
    ...(inputs.preparation === undefined ? {} : { preparation: inputs.preparation }),
    ...(inputs.gradeOverride === undefined ? {} : { gradeOverride: inputs.gradeOverride }),
    ...(inputs.delta === undefined ? {} : { delta: inputs.delta }),
    ...(inputs.qualityLimitations === undefined
      ? {}
      : { qualityLimitations: inputs.qualityLimitations }),
  });
}

export {
  REPORT_EMBEDDED_FONT_FAMILIES,
  describeReportPdfIntegrityDefects,
  findReportPdfIntegrityDefects,
} from './pdf-integrity.js';

// Plan 058 fail-closed report-quality primitives.
export { canonicalJson, reportQualityDigest, bytesDigest } from './quality/digest.js';
export {
  EvidenceBoundContentError,
  sanitizeModelText,
  assertNoFreehandExactScalar,
  validateEvidenceBoundContent,
  resolveEvidenceBoundContent,
} from './quality/evidence-bound-content.js';
export {
  buildReportFactRegistry,
  buildInitialCoverageLedger,
  buildReportEvidenceDossier,
  reconcileCoverageLedger,
  assertCoverageLedgerComplete,
  assertMandatoryDisclosures,
} from './quality/dossier.js';
export {
  assertSeniorReportPlan,
  assertNoBlockingReviewIssues,
  assertCoverageAndPlan,
  deterministicProseViolations,
  assertReauditComparabilityLanguage,
} from './quality/plan-guards.js';
export {
  REQUIRED_PDF_TOOLS,
  preflightPdfQualityToolchain,
  canonicalPostProcessPdf,
  runExactPdfQa,
} from './quality/pdf-quality.js';
export type { PdfQualityToolVersions, ExactPdfQaResult } from './quality/pdf-quality.js';
export {
  reportRendererAssetFingerprints,
  reportRendererCodeFingerprint,
} from './quality/renderer-fingerprint.js';
