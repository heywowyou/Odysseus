/**
 * Report preparation and writing selection over the audits and analyses
 * collections. Plan 067 makes French canonical and English optional while
 * preserving the historical stored field names at this boundary.
 */
import type { Connection } from 'mongoose';
import {
  applyPreparationPatch,
  isCompatibleAnalysisSelection,
  isEnglishAttachableToFrench,
  resolveSelectedAnalysisPair,
  type AnalysisSelectionRef,
  type ReportPreparation,
  type ReportPreparationPatch,
  type SelectedAnalysisPairResolution,
  type WritingGuardRejection,
  type WritingSanitizationWarning,
} from '@odysseus/core';
import { createAuditModel, type AuditDocument } from './schemas/audit.schema.js';
import { createAnalysisModel, type AnalysisDocument } from './schemas/analysis.schema.js';

export class WritingSelectionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WritingSelectionConflictError';
  }
}

function withStoredDefaults(raw: ReportPreparation | undefined): ReportPreparation {
  return {
    ...(raw?.customCoverQuestion ? { customCoverQuestion: raw.customCoverQuestion } : {}),
    ...(raw?.warningAcknowledgement ? { warningAcknowledgement: raw.warningAcknowledgement } : {}),
    ...(raw?.writingSelection ? { writingSelection: raw.writingSelection } : {}),
    updatedAt: raw?.updatedAt ?? new Date(0).toISOString(),
  };
}

export async function getReportPreparation(
  connection: Connection,
  auditId: string,
): Promise<ReportPreparation> {
  const AuditModel = createAuditModel(connection);
  const audit = await AuditModel.findOne({ auditId }, { reportPreparation: 1 }).lean<
    Pick<AuditDocument, 'reportPreparation'>
  >();
  return withStoredDefaults(audit?.reportPreparation);
}

async function persistPreparation(
  connection: Connection,
  auditId: string,
  next: ReportPreparation,
): Promise<ReportPreparation> {
  const AuditModel = createAuditModel(connection);
  const updated = await AuditModel.findOneAndUpdate(
    { auditId },
    { $set: { reportPreparation: next } },
    { returnDocument: 'after', projection: { reportPreparation: 1 }, runValidators: true },
  ).lean<Pick<AuditDocument, 'reportPreparation'>>();
  if (!updated) throw new Error(`odysseus: audit ${auditId} not found`);
  return withStoredDefaults(updated.reportPreparation ?? next);
}

export async function patchReportPreparationInputs(
  connection: Connection,
  auditId: string,
  patch: ReportPreparationPatch,
): Promise<ReportPreparation> {
  const current = await getReportPreparation(connection, auditId);
  return persistPreparation(
    connection,
    auditId,
    applyPreparationPatch(current, patch, new Date().toISOString()),
  );
}

export async function recordReadyWritingCandidate(
  connection: Connection,
  auditId: string,
  pair: AnalysisSelectionRef,
  warnings: readonly WritingSanitizationWarning[] = [],
): Promise<ReportPreparation> {
  const current = await getReportPreparation(connection, auditId);
  return persistPreparation(connection, auditId, {
    ...current,
    writingSelection: {
      ...(current.writingSelection?.selected
        ? { selected: current.writingSelection.selected }
        : {}),
      candidate: {
        status: 'ready',
        pair,
        createdAt: new Date().toISOString(),
        ...(warnings.length > 0 ? { warnings } : {}),
      },
    },
    updatedAt: new Date().toISOString(),
  });
}

export async function recordFailedWritingCandidate(
  connection: Connection,
  auditId: string,
  reason: string,
  partialPair: { frAnalysisId?: string; enAnalysisId?: string } = {},
  guardRejections: readonly WritingGuardRejection[] = [],
): Promise<ReportPreparation> {
  const current = await getReportPreparation(connection, auditId);
  return persistPreparation(connection, auditId, {
    ...current,
    writingSelection: {
      ...(current.writingSelection?.selected
        ? { selected: current.writingSelection.selected }
        : {}),
      candidate: {
        status: 'failed',
        reason,
        createdAt: new Date().toISOString(),
        ...(partialPair.frAnalysisId || partialPair.enAnalysisId ? { partialPair } : {}),
        ...(guardRejections.length > 0 ? { guardRejections } : {}),
      },
    },
    updatedAt: new Date().toISOString(),
  });
}

export async function approveWritingCandidate(
  connection: Connection,
  auditId: string,
): Promise<ReportPreparation> {
  const current = await getReportPreparation(connection, auditId);
  const candidate = current.writingSelection?.candidate;
  if (!candidate || candidate.status !== 'ready') {
    throw new WritingSelectionConflictError(
      'odysseus: no ready writing candidate to approve for this audit',
    );
  }

  const fr = await getAnalysisById(connection, auditId, candidate.pair.frAnalysisId);
  const en =
    candidate.pair.enAnalysisId === undefined
      ? undefined
      : await getAnalysisById(connection, auditId, candidate.pair.enAnalysisId);
  if (
    !isCompatibleAnalysisSelection(fr ?? undefined, en ?? undefined) ||
    fr?.findingsProvenance.findingsDigest !== candidate.pair.findingsProvenance.findingsDigest ||
    (candidate.pair.enAnalysisId !== undefined && !en)
  ) {
    throw new WritingSelectionConflictError(
      'odysseus: writing candidate no longer refers to a compatible French-led selection',
    );
  }

  const filter: Record<string, unknown> = {
    auditId,
    'reportPreparation.writingSelection.candidate.status': 'ready',
    'reportPreparation.writingSelection.candidate.pair.frAnalysisId': candidate.pair.frAnalysisId,
  };
  if (candidate.pair.enAnalysisId !== undefined) {
    filter['reportPreparation.writingSelection.candidate.pair.enAnalysisId'] =
      candidate.pair.enAnalysisId;
  }

  const updated = await createAuditModel(connection)
    .findOneAndUpdate(
      filter,
      {
        $set: {
          'reportPreparation.writingSelection.selected': candidate.pair,
          'reportPreparation.writingSelection.candidate.status': 'selected',
          'reportPreparation.writingSelection.candidate.approvedAt': new Date().toISOString(),
          'reportPreparation.updatedAt': new Date().toISOString(),
        },
      },
      { returnDocument: 'after', projection: { reportPreparation: 1 } },
    )
    .lean<Pick<AuditDocument, 'reportPreparation'>>();

  if (!updated?.reportPreparation) {
    throw new WritingSelectionConflictError(
      'odysseus: the ready writing candidate changed before approval could be recorded',
    );
  }
  return withStoredDefaults(updated.reportPreparation);
}

/**
 * Attach one explicitly requested English analysis to the selected French
 * analysis. This never changes frAnalysisId. Both analyses must carry the
 * same findings provenance and the same structureGeneratedAt, so a stale or
 * independently structured English version cannot be spliced onto French.
 */
export async function attachEnglishAnalysisToSelection(
  connection: Connection,
  auditId: string,
  enAnalysisId: string,
  warnings: readonly WritingSanitizationWarning[] = [],
): Promise<ReportPreparation> {
  const current = await getReportPreparation(connection, auditId);
  const selected = current.writingSelection?.selected;
  if (!selected) {
    throw new WritingSelectionConflictError(
      'odysseus: a selected French analysis is required before English can be generated',
    );
  }
  const [fr, en] = await Promise.all([
    getAnalysisById(connection, auditId, selected.frAnalysisId),
    getAnalysisById(connection, auditId, enAnalysisId),
  ]);
  if (!isEnglishAttachableToFrench(fr ?? undefined, en ?? undefined)) {
    throw new WritingSelectionConflictError(
      'odysseus: English analysis does not match the selected French findings and structure provenance',
    );
  }

  const existingWarnings = current.writingSelection?.candidate?.warnings ?? [];
  const combinedWarnings = [...existingWarnings, ...warnings];
  const setFields: Record<string, unknown> = {
    'reportPreparation.writingSelection.selected.enAnalysisId': enAnalysisId,
    'reportPreparation.updatedAt': new Date().toISOString(),
  };
  if (current.writingSelection?.candidate !== undefined && combinedWarnings.length > 0) {
    setFields['reportPreparation.writingSelection.candidate.warnings'] = combinedWarnings;
  }

  const updated = await createAuditModel(connection)
    .findOneAndUpdate(
      {
        auditId,
        'reportPreparation.writingSelection.selected.frAnalysisId': selected.frAnalysisId,
        ...(selected.enAnalysisId !== undefined
          ? { 'reportPreparation.writingSelection.selected.enAnalysisId': selected.enAnalysisId }
          : {}),
      },
      { $set: setFields },
      { returnDocument: 'after', projection: { reportPreparation: 1 }, runValidators: true },
    )
    .lean<Pick<AuditDocument, 'reportPreparation'>>();

  if (!updated?.reportPreparation) {
    throw new WritingSelectionConflictError(
      'odysseus: selected French analysis changed while English was being attached',
    );
  }
  return withStoredDefaults(updated.reportPreparation);
}

export async function getAnalysisById(
  connection: Connection,
  auditId: string,
  analysisId: string,
): Promise<AnalysisDocument | null> {
  return createAnalysisModel(connection)
    .findOne({ analysisId, auditId })
    .lean<AnalysisDocument>();
}

async function listAnalysesForAudit(
  connection: Connection,
  auditId: string,
): Promise<AnalysisDocument[]> {
  return createAnalysisModel(connection).find({ auditId }).lean<AnalysisDocument[]>();
}

export type SelectedAuditAnalysisPairResolution = SelectedAnalysisPairResolution<AnalysisDocument>;

export function resolveSelectedAnalysisPairForAudit(
  connection: Connection,
  auditId: string,
): Promise<SelectedAuditAnalysisPairResolution> {
  return (async () => {
    const [preparation, analyses] = await Promise.all([
      getReportPreparation(connection, auditId),
      listAnalysesForAudit(connection, auditId),
    ]);
    return resolveSelectedAnalysisPair<AnalysisDocument>(preparation.writingSelection, analyses);
  })();
}
