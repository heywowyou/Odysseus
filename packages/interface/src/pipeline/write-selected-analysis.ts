/**
 * Issue #568: write the French analysis of an audit and make it the selected
 * writing, in one place. The full audit job, makeReportReady, writing
 * regeneration and English generation each ran runAnalysisStage, then
 * recordReadyWritingCandidate, then approveWritingCandidate by hand; the
 * manual-field options were copied between them, and only regeneration
 * checked that the candidate became ready and then selected. The others went
 * on to render a report whatever the selection said.
 *
 * Every entry point now stops with WritingSelectionFailedError when the new
 * analysis is not recorded as ready, then not selected. The analysis itself
 * stays persisted, as it does when a later report stage fails.
 */

import type { Connection } from 'mongoose';
import type {
  AnalysisSelectionRef,
  AuditManifest,
  AuditManualFields,
  Finding,
  FindingsProvenance,
  ObligationAssessment,
  WritingSanitizationWarning,
} from '@odysseus/core';
import {
  approveWritingCandidate,
  getAuditManualFields,
  recordReadyWritingCandidate,
} from '@odysseus/store';
import {
  runAnalysisStage,
  type AnalysisStageResult,
  type RunAnalysisStageOptions,
} from './analysis-stage.js';
import { catalogueContextOption } from './catalogue-site-context.js';

export type WritingSelectionFailure = 'not-ready' | 'not-selected';

export class WritingSelectionFailedError extends Error {
  readonly failure: WritingSelectionFailure;
  readonly frAnalysisId: string;

  constructor(failure: WritingSelectionFailure, frAnalysisId: string) {
    super(
      failure === 'not-ready'
        ? 'odysseus: the ready writing candidate could not be recorded'
        : 'odysseus: the writing candidate could not be selected',
    );
    this.name = 'WritingSelectionFailedError';
    this.failure = failure;
    this.frAnalysisId = frAnalysisId;
  }
}

/** The analysis stage options the operator's manual fields decide: the SIREN
 *  and the transactional-flow override feed the obligation assessment when
 *  the stage has to compute one. */
export function manualFieldStageOptions(
  manualFields: AuditManualFields | undefined,
): Pick<RunAnalysisStageOptions, 'manualSiren' | 'siteSignalOverrides'> {
  return {
    ...(manualFields?.siren !== undefined ? { manualSiren: manualFields.siren.value } : {}),
    ...(manualFields?.transactionalFlowOverride !== undefined
      ? {
          siteSignalOverrides: {
            hasTransactionalFlow: manualFields.transactionalFlowOverride,
          },
        }
      : {}),
  };
}

/** Records a French analysis as the ready candidate and selects it, or throws
 *  WritingSelectionFailedError. Returns when the selection was approved. */
export async function selectFrenchAnalysis(
  connection: Connection,
  auditId: string,
  pair: AnalysisSelectionRef,
  warnings: readonly WritingSanitizationWarning[] = [],
): Promise<{ approvedAt: string }> {
  const readied = await recordReadyWritingCandidate(connection, auditId, pair, warnings);
  if (readied.writingSelection?.candidate?.status !== 'ready') {
    throw new WritingSelectionFailedError('not-ready', pair.frAnalysisId);
  }
  const approved = await approveWritingCandidate(connection, auditId);
  const candidate = approved.writingSelection?.candidate;
  if (candidate?.status !== 'selected') {
    throw new WritingSelectionFailedError('not-selected', pair.frAnalysisId);
  }
  return { approvedAt: candidate.approvedAt };
}

export interface WriteSelectedAnalysisInput {
  auditDir: string;
  manifest: AuditManifest;
  findings: Finding[];
  findingsProvenance: FindingsProvenance;
  /** The scan's own assessment, when the caller has one; otherwise the stage
   *  derives it, reading the manual fields. */
  obligationAssessment?: ObligationAssessment;
  regenerateStructure?: boolean;
  regenerateWriting?: boolean;
  /** Called once the analysis is persisted, before it is selected, so a
   *  caller can record it as a partial result if selection then fails. */
  onAnalysed?: (analysisId: string) => void;
}

export interface WriteSelectedAnalysisResult {
  stage: AnalysisStageResult;
  pair: AnalysisSelectionRef;
  approvedAt: string;
}

/** Writes the French analysis from the stored audit's manual fields and
 *  catalogue context, then selects it. */
export async function writeSelectedAnalysis(
  connection: Connection,
  input: WriteSelectedAnalysisInput,
): Promise<WriteSelectedAnalysisResult> {
  const auditId = input.manifest.auditId;
  const [manualFields, catalogue] = await Promise.all([
    getAuditManualFields(connection, auditId),
    catalogueContextOption(connection, auditId),
  ]);
  const stage = await runAnalysisStage(
    input.auditDir,
    input.manifest,
    input.findings,
    {
      language: 'fr',
      findingsProvenance: input.findingsProvenance,
      ...catalogue,
      ...(input.obligationAssessment !== undefined
        ? { obligationAssessment: input.obligationAssessment }
        : {}),
      ...(input.regenerateStructure !== undefined
        ? { regenerateStructure: input.regenerateStructure }
        : {}),
      ...(input.regenerateWriting !== undefined
        ? { regenerateWriting: input.regenerateWriting }
        : {}),
      ...manualFieldStageOptions(manualFields),
    },
    connection,
  );
  input.onAnalysed?.(stage.analysis.analysisId);
  const pair: AnalysisSelectionRef = {
    frAnalysisId: stage.analysis.analysisId,
    findingsProvenance: stage.analysis.findingsProvenance,
  };
  const { approvedAt } = await selectFrenchAnalysis(
    connection,
    auditId,
    pair,
    stage.sanitizationWarnings,
  );
  return { stage, pair, approvedAt };
}
