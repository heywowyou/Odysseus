/**
 * Plan 072: the transferable form of one report's render inputs.
 *
 * The contract lives here, next to `generateReportPdf`, rather than in
 * @odysseus/interface where the bundle is produced. Two packages read it and
 * only one of them may touch a database: the interface assembles a bundle
 * from Mongo and the audit directory (`resolveRenderInputs`), and the CLI
 * finalizer parses one off disk with no connection and no provider client.
 * Keeping the shape in the package both already depend on is what lets the
 * finalizer stay free of `@odysseus/store` and mongoose.
 *
 * The bundle deliberately carries no page screenshots: the report template
 * reads nothing off disk (`packages/report/src/screenshots.ts` renders
 * section 08 from manifest percentages, not image files), so JSON alone
 * renders an identical PDF. That was measured before this was built, not
 * assumed - the same audit rendered with a real `auditDir` and with a path
 * that does not exist produced zero differing bytes once PDF timestamps were
 * normalized, against a 343-byte same-mode control.
 */

import { canonicalDigest } from '@odysseus/core';
import type {
  AuditManifest,
  AuditManualFields,
  EvidenceLimitation,
  Finding,
  FindingsDelta,
  FindingsProvenance,
  GradeOverride,
  ObligationAssessment,
  PreparationPreviewLanguage,
  ReportLanguage,
} from '@odysseus/core';
import { REPORT_TEMPLATE_VERSION } from './constants.js';
import type { StoredAnalysis } from './types.js';

/** The render-time inputs `generateReportPdf` takes beyond the manifest,
 *  findings and analysis, plus the obligation assessment the caller splices
 *  into the analysis it passes. Every member is optional: an audit with no
 *  saved manual fields, no override, no delivered baseline and no evidence
 *  limitation renders its existing fallbacks unchanged. */
export interface ReportRenderInputs {
  manualFields?: AuditManualFields;
  preparation?: PreparationPreviewLanguage;
  gradeOverride?: GradeOverride;
  delta?: FindingsDelta;
  qualityLimitations?: EvidenceLimitation[];
  /** Spliced onto the analysis before rendering, never fed to the model. */
  obligationAssessment?: ObligationAssessment;
}

/** What binds a downloaded bundle to the audit it came from. The finalizer's
 *  override file repeats these digests, and both the local render and the
 *  upload refuse when they no longer match: an override written against text
 *  that has since been regenerated must never be spliced into the new text. */
export interface RenderBundleLineage {
  auditId: string;
  language: ReportLanguage;
  analysisId: string;
  /** Digest of the analysis exactly as this bundle carries it. */
  analysisDigest: string;
  findingsProvenance: FindingsProvenance;
  /** The VPS build that assembled the bundle. Recorded for provenance only:
   *  the point of the finalizer is to render with newer local code, so a
   *  mismatch here is expected and is not a refusal. */
  rendererBuild: string;
  reportTemplateVersion: number;
  builtAt: string;
}

/** Everything `generateReportPdf` needs, as transferable JSON. */
export interface RenderBundle extends ReportRenderInputs {
  lineage: RenderBundleLineage;
  manifest: AuditManifest;
  findings: Finding[];
  analysis: StoredAnalysis;
}

export function buildRenderBundle(args: {
  manifest: AuditManifest;
  findings: Finding[];
  analysis: StoredAnalysis;
  findingsProvenance: FindingsProvenance;
  renderInputs: ReportRenderInputs;
  rendererBuild: string;
}): RenderBundle {
  const { manifest, findings, analysis, findingsProvenance, renderInputs } = args;
  if (analysis.analysisId === undefined) {
    throw new Error(
      'render bundle refused: legacy analysis has no analysis ID, so nothing could bind an ' +
        'override file to it. Regenerate the structure and both analyses first.',
    );
  }
  return {
    lineage: {
      auditId: manifest.auditId,
      language: analysis.language,
      analysisId: analysis.analysisId,
      analysisDigest: canonicalDigest(analysis),
      findingsProvenance,
      rendererBuild: args.rendererBuild,
      reportTemplateVersion: REPORT_TEMPLATE_VERSION,
      builtAt: new Date().toISOString(),
    },
    manifest,
    findings,
    analysis,
    ...renderInputs,
  };
}

/**
 * Restores the one field a JSON round-trip breaks.
 *
 * A bundle crosses the wire as JSON, so every Date in it arrives as a string.
 * Findings and the manifest already tolerate that - production reads both with
 * JSON.parse off disk and renders them unchanged - but `analysis.generatedAt`
 * does not: the legal-exposure section measures elapsed time from it through
 * `formatElapsedDuration`, which calls `getFullYear`/`getMonth`/`getDate`. A
 * string there is a TypeError at render time, not a formatting difference.
 *
 * Revive here rather than making the template defensive: the template's input
 * contract says Date, and one bundle parser is easier to keep honest than a
 * coercion scattered through the sections.
 */
export function parseRenderBundle(raw: string): RenderBundle {
  const bundle = JSON.parse(raw) as RenderBundle;
  return {
    ...bundle,
    analysis: {
      ...bundle.analysis,
      generatedAt: new Date(bundle.analysis.generatedAt),
    },
  };
}
