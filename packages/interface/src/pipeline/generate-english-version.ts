/**
 * Plan 067: explicit, on-demand English generation.
 *
 * French is already selected and remains authoritative throughout this
 * operation. English reuses the exact selected French structure and findings
 * provenance, makes one English writing call on the normal model path, then
 * attaches the resulting immutable analysis and renders only the English PDF.
 */
import type { Connection } from 'mongoose';
import { buildFindingsProvenance } from '@odysseus/core';
import {
  approveWritingCandidate,
  attachEnglishAnalysisToSelection,
  getReportPreparation,
  recordReadyWritingCandidate,
  resolveSelectedAnalysisPairForAudit,
  type AuditDocument,
} from '@odysseus/store';
import { runAnalysisStage } from './analysis-stage.js';
import { readAuditEvidence } from './audit-evidence.js';
import { RegenerationConflictError } from './regeneration-conflict-error.js';
import { releaseReportProduction, tryAcquireReportProduction } from './report-production-lock.js';
import {
  markReportProductionCompleted,
  markReportProductionFailed,
  markReportProductionStage,
} from './report-production-state.js';
import { runReportStage, type ReportStageResult } from './report-stage.js';

export class EnglishGenerationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnglishGenerationUnavailableError';
  }
}

export interface GenerateEnglishVersionResult {
  frAnalysisId: string;
  enAnalysisId: string;
  report: ReportStageResult;
}

export async function generateEnglishVersion(
  connection: Connection,
  audit: AuditDocument,
): Promise<GenerateEnglishVersionResult> {
  const auditId = audit.auditId;
  if (!tryAcquireReportProduction(auditId, 'writing')) {
    throw new RegenerationConflictError(
      'odysseus: the PDFs or the writing for this audit are already being produced',
    );
  }
  markReportProductionStage(auditId, 'writing');

  try {
    let resolution = await resolveSelectedAnalysisPairForAudit(connection, auditId);
    if (resolution.kind === 'none') {
      throw new EnglishGenerationUnavailableError(
        'odysseus: generate the French report before generating English',
      );
    }

    // A legacy audit may resolve a French analysis without having an explicit
    // writing selection. Canonicalize that exact French ID first; this does
    // not replace the French analysis or report.
    const preparation = await getReportPreparation(connection, auditId);
    if (preparation.writingSelection?.selected === undefined) {
      await recordReadyWritingCandidate(connection, auditId, {
        frAnalysisId: resolution.fr.analysisId,
        findingsProvenance: resolution.fr.findingsProvenance,
      });
      await approveWritingCandidate(connection, auditId);
      resolution = await resolveSelectedAnalysisPairForAudit(connection, auditId);
      if (resolution.kind === 'none') {
        throw new EnglishGenerationUnavailableError(
          'odysseus: selected French analysis could not be resolved',
        );
      }
    }

    const selectedFrench = resolution.fr;
    if (
      selectedFrench.generationMode !== 'static-fallback' &&
      selectedFrench.structureGeneratedAt === undefined
    ) {
      throw new EnglishGenerationUnavailableError(
        'odysseus: selected French analysis has no reusable structure provenance',
      );
    }

    const { auditDir, manifest, findings } = await readAuditEvidence(audit);
    const findingsProvenance = buildFindingsProvenance(findings);

    const enStage = await runAnalysisStage(
      auditDir,
      manifest,
      findings,
      {
        language: 'en',
        findingsProvenance,
        regenerateWriting: true,
        ...(selectedFrench.structureGeneratedAt !== undefined
          ? { requiredStructureGeneratedAt: selectedFrench.structureGeneratedAt }
          : {}),
        ...(audit.manualFields?.siren !== undefined
          ? { manualSiren: audit.manualFields.siren.value }
          : {}),
        ...(audit.manualFields?.transactionalFlowOverride !== undefined
          ? {
              siteSignalOverrides: {
                hasTransactionalFlow: audit.manualFields.transactionalFlowOverride,
              },
            }
          : {}),
      },
      connection,
    );

    markReportProductionStage(auditId, 'pdf-generation');
    const report = await runReportStage(
      auditDir,
      manifest,
      findings,
      enStage.analysis,
      connection,
      undefined,
      findingsProvenance,
    );

    // Promote English into the selected writing only after its PDF rendered
    // successfully. A provider or renderer failure therefore leaves the
    // selected French writing state byte-for-byte unchanged.
    await attachEnglishAnalysisToSelection(
      connection,
      auditId,
      enStage.analysis.analysisId,
      enStage.sanitizationWarnings,
    );
    markReportProductionCompleted(auditId);
    return {
      frAnalysisId: selectedFrench.analysisId,
      enAnalysisId: enStage.analysis.analysisId,
      report,
    };
  } catch (error) {
    markReportProductionFailed(auditId, error);
    throw error;
  } finally {
    releaseReportProduction(auditId, 'writing');
  }
}
