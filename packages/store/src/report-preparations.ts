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

/** Inputs retired from preparation. Writes set single fields, so these
 *  legacy keys would otherwise stay on old audit rows, stakeholder names
 *  included. Mongoose strips unknown paths from an update, so they are
 *  unset through the driver. */
const RETIRED_PREPARATION_FIELDS = {
  'reportPreparation.context': '',
  'reportPreparation.stakeholders': '',
  'reportPreparation.journeyDecisions': '',
  'reportPreparation.turnover': '',
};

async function persistPreparation(
  connection: Connection,
  auditId: string,
  update: { set: Record<string, unknown>; unset?: readonly string[] },
): Promise<ReportPreparation> {
  const AuditModel = createAuditModel(connection);
  await AuditModel.collection.updateOne({ auditId }, { $unset: RETIRED_PREPARATION_FIELDS });
  const updated = await AuditModel.findOneAndUpdate(
    { auditId },
    {
      $set: update.set,
      ...(update.unset && update.unset.length > 0
        ? { $unset: Object.fromEntries(update.unset.map((field) => [field, ''])) }
        : {}),
    },
    { returnDocument: 'after', projection: { reportPreparation: 1 }, runValidators: true },
  ).lean<Pick<AuditDocument, 'reportPreparation'>>();
  if (!updated) throw new Error(`odysseus: audit ${auditId} not found`);
  return withStoredDefaults(updated.reportPreparation);
}

export async function patchReportPreparationInputs(
  connection: Connection,
  auditId: string,
  patch: ReportPreparationPatch,
): Promise<ReportPreparation> {
  const current = await getReportPreparation(connection, auditId);
  const next = applyPreparationPatch(current, patch, new Date().toISOString());
  const set: Record<string, unknown> = { 'reportPreparation.updatedAt': next.updatedAt };
  const unset: string[] = [];
  if ('customCoverQuestion' in patch) {
    if (next.customCoverQuestion === undefined) unset.push('reportPreparation.customCoverQuestion');
    else set['reportPreparation.customCoverQuestion'] = next.customCoverQuestion;
  }
  if ('warningAcknowledgement' in patch) {
    if (next.warningAcknowledgement === undefined)
      unset.push('reportPreparation.warningAcknowledgement');
    else set['reportPreparation.warningAcknowledgement'] = next.warningAcknowledgement;
  }
  return persistPreparation(connection, auditId, { set, unset });
}

export async function recordReadyWritingCandidate(
  connection: Connection,
  auditId: string,
  pair: AnalysisSelectionRef,
  warnings: readonly WritingSanitizationWarning[] = [],
): Promise<ReportPreparation> {
  const now = new Date().toISOString();
  return persistPreparation(connection, auditId, {
    set: {
      'reportPreparation.writingSelection.candidate': {
        status: 'ready',
        pair,
        createdAt: now,
        ...(warnings.length > 0 ? { warnings } : {}),
      },
      'reportPreparation.updatedAt': now,
    },
  });
}

export async function recordFailedWritingCandidate(
  connection: Connection,
  auditId: string,
  reason: string,
  partialPair: { frAnalysisId?: string; enAnalysisId?: string } = {},
  guardRejections: readonly WritingGuardRejection[] = [],
): Promise<ReportPreparation> {
  const now = new Date().toISOString();
  return persistPreparation(connection, auditId, {
    set: {
      'reportPreparation.writingSelection.candidate': {
        status: 'failed',
        reason,
        createdAt: now,
        ...(partialPair.frAnalysisId || partialPair.enAnalysisId ? { partialPair } : {}),
        ...(guardRejections.length > 0 ? { guardRejections } : {}),
      },
      'reportPreparation.updatedAt': now,
    },
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
  const candidateProvenance = candidate.pair.findingsProvenance;
  const frProvenance = fr?.findingsProvenance;
  const candidateMatchesFrench =
    frProvenance !== undefined &&
    frProvenance.findingsSchemaVersion === candidateProvenance.findingsSchemaVersion &&
    frProvenance.normalizationFingerprint === candidateProvenance.normalizationFingerprint &&
    frProvenance.findingsDigest === candidateProvenance.findingsDigest;
  if (
    !isCompatibleAnalysisSelection(fr ?? undefined, en ?? undefined) ||
    !candidateMatchesFrench ||
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

  const candidate = current.writingSelection?.candidate;
  const existingWarnings =
    candidate?.status === 'ready' || candidate?.status === 'selected'
      ? (candidate.warnings ?? [])
      : [];
  const combinedWarnings = [...existingWarnings, ...warnings];
  const setFields: Record<string, unknown> = {
    'reportPreparation.writingSelection.selected.enAnalysisId': enAnalysisId,
    'reportPreparation.updatedAt': new Date().toISOString(),
  };
  if (
    (candidate?.status === 'ready' || candidate?.status === 'selected') &&
    combinedWarnings.length > 0
  ) {
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
  return createAnalysisModel(connection).findOne({ analysisId, auditId }).lean<AnalysisDocument>();
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
