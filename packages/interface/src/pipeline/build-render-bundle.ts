/**
 * Plan 072: the render inputs of one report, assembled once.
 *
 * `runReportStage` used to read manual fields, the grade override, the
 * obligation assessment, the preparation preview, the re-audit delta and the
 * evidence diagnostics inline, immediately before calling
 * `generateReportPdf`. The finalizer needs the same set as data, so an
 * operator can re-render a hosted report on their own machine without a
 * database or a rescan.
 *
 * Both callers go through `resolveRenderInputs` so the hosted bundle and the
 * pipeline render can never assemble a different report from the same audit.
 * Everything here is read fresh at render time on purpose - that is what lets
 * the operator correct an identity field, a grade, or a preparation answer
 * after the fact with no new analysis document. See each field's comment.
 *
 * The bundle deliberately carries no page screenshots: the report template
 * reads nothing off disk (`packages/report/src/screenshots.ts` renders section
 * 08 from manifest percentages, not image files), so JSON alone renders an
 * identical PDF. That was measured before this was built, not assumed.
 */

import type { Connection } from 'mongoose';
import {
  buildReportPreparationPreview,
  canonicalDigest,
  computeFindingsDelta,
  type AuditManifest,
  type AuditManualFields,
  type EvidenceLimitation,
  type Finding,
  type FindingsDelta,
  type FindingsProvenance,
  type GradeOverride,
  type ObligationAssessment,
  type PreparationPreviewLanguage,
  type ReportLanguage,
} from '@odysseus/core';
import { REPORT_TEMPLATE_VERSION, type StoredAnalysis } from '@odysseus/report';
import {
  findAuditEvidenceCoverage,
  findDeltaBaseline,
  getAuditGradeOverride,
  getAuditManualFields,
  getReportPreparation,
  syncProspectIdentityIntoAudit,
} from '@odysseus/store';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { readAuditEvidenceDiagnostics } from './audit-evidence-diagnostics.js';
import { runObligationStage } from './obligation-stage.js';

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

export async function resolveRenderInputs(args: {
  connection: Connection;
  auditDir: string;
  manifest: AuditManifest;
  findings: Finding[];
  analysis: StoredAnalysis;
  findingsProvenance: FindingsProvenance;
  artifactStore: ArtifactStore | undefined;
}): Promise<ReportRenderInputs> {
  const { connection, auditDir, manifest, findings, analysis, findingsProvenance } = args;

  // Manual-input-layer milestone: manual fields are read fresh here, at
  // render time, rather than trusted from whatever was baked into `analysis`
  // when it was generated - this is what lets the operator edit them after
  // the fact with no rescan and no new analysis document (see
  // AuditManualFields's own doc comment in @odysseus/core). The obligation
  // assessment specifically is recomputed fresh too: it is not fed to the
  // LLM (only spliced into the report's legal section), so recomputing it
  // here costs nothing and picks up a manualFields.siren saved after the
  // scan - resolveEffectiveSiren's existing extracted-vs-manual precedence
  // is reused unchanged, "manual" now just means "freshest at render time"
  // instead of "given at job creation."
  // Issue #379: a regeneration resolves the linked prospect's operator
  // identity first, so it never renders against a detected guess the
  // operator already answered on the prospect (this is also what unsticks
  // an audit that stopped on the identity gate before the fix).
  await syncProspectIdentityIntoAudit(connection, manifest.auditId);
  const manualFields = await getAuditManualFields(connection, manifest.auditId);
  // Issue: operator-reviewed overall grade override, read fresh at render
  // time exactly like manualFields above - the operator can review the
  // grade after the fact with no rescan and no new analysis document.
  const gradeOverride = await getAuditGradeOverride(connection, manifest.auditId);
  const obligationAssessment = manualFields?.transactionalFlowOverride
    ? await runObligationStage(
        manifest,
        connection,
        manualFields?.siren?.value,
        manualFields.transactionalFlowOverride
          ? { hasTransactionalFlow: manualFields.transactionalFlowOverride }
          : undefined,
      )
    : analysis.obligationAssessment;

  // Plan 019: resolve the bounded preparation preview here, at the
  // orchestration boundary, so render-html.ts never queries storage or
  // derives preparation policy. Evidence-unavailable artifacts degrade the
  // preview inside core instead of failing the render.
  const preparationAggregate = await getReportPreparation(connection, manifest.auditId);
  const preparationPreview = buildReportPreparationPreview({
    preparation: preparationAggregate,
    commercialName: manualFields?.nomCommercial?.value,
    findings,
  });

  // Plan 051: a new audit of a site whose earlier audit was delivered is a
  // re-audit, and its report compares the two runs finding by finding. The
  // delta is computed here from stored data and passed in verbatim; the
  // template never reads a second findings set itself.
  // Plan 059 step 35: both sides carry their persisted coverage signature,
  // so observability differences are separated from site changes.
  const baseline = await findDeltaBaseline(connection, {
    siteUrl: manifest.siteUrl,
    startedAt: new Date(manifest.startedAt),
  });
  const currentCoverage = await findAuditEvidenceCoverage(connection, manifest.auditId);
  const delta =
    baseline === null
      ? undefined
      : computeFindingsDelta(baseline, {
          auditId: manifest.auditId,
          siteUrl: manifest.siteUrl,
          startedAt: manifest.startedAt,
          tool: manifest.tool,
          config: manifest.config,
          findingsProvenance,
          findings,
          ...(currentCoverage !== undefined ? { coverage: currentCoverage } : {}),
        });

  const diagnostics = await readAuditEvidenceDiagnostics({
    auditDir,
    hostname: new URL(manifest.siteUrl).hostname,
    startedAt: new Date(manifest.startedAt),
    store: args.artifactStore,
  });

  return {
    ...(manualFields !== undefined ? { manualFields } : {}),
    preparation: preparationPreview[analysis.language],
    ...(gradeOverride !== undefined ? { gradeOverride } : {}),
    ...(delta !== undefined ? { delta } : {}),
    ...(diagnostics.clientLimitations.length > 0
      ? { qualityLimitations: diagnostics.clientLimitations }
      : {}),
    ...(obligationAssessment !== undefined ? { obligationAssessment } : {}),
  };
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
