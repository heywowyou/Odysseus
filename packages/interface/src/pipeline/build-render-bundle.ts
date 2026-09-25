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
 * Only the assembly lives here, because only assembly needs Mongo and the
 * audit directory. The bundle's own shape is `@odysseus/report`'s
 * render-bundle.ts, so the CLI finalizer can parse a bundle without loading
 * this module and, through it, @odysseus/store.
 */

import type { Connection } from 'mongoose';
import {
  buildReportPreparationPreview,
  computeFindingsDelta,
  type AuditManifest,
  type Finding,
  type FindingsProvenance,
} from '@odysseus/core';
import type { ReportRenderInputs, StoredAnalysis } from '@odysseus/report';
import {
  findAuditEvidenceCoverage,
  findDeltaBaseline,
  getAuditBlockedPagesAcknowledgment,
  getAuditGradeOverride,
  getAuditManualFields,
  getReportPreparation,
  syncProspectIdentityIntoAudit,
} from '@odysseus/store';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { readAuditEvidenceDiagnostics } from './audit-evidence-diagnostics.js';
import { runObligationStage } from './obligation-stage.js';

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
    blockedPagesAcknowledgment: await getAuditBlockedPagesAcknowledgment(
      connection,
      manifest.auditId,
    ),
  });
  if (diagnostics.reportBlocked === true) {
    throw new Error(
      `Report generation blocked: ${(diagnostics.blockingReasons ?? ['insufficient acquisition evidence']).join(', ')}`,
    );
  }

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
