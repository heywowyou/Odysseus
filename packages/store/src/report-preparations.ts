/**
 * Report preparation and writing selection over the `audits` and
 * `analyses` collections (plan 019). Centralized here like every other
 * read/write helper: one place owns the query shape, handlers never issue
 * raw Mongoose updates, and the selection invariants are enforced at this
 * boundary before any atomic selection update.
 *
 * All policy decisions (patch shape, digest, pair compatibility, legacy
 * fallback) live in @odysseus/core's report-preparation module; this file
 * is the I/O boundary that applies them.
 */

import type { Connection } from 'mongoose';
import {
  applyPreparationPatch,
  isCompleteCompatiblePair,
  pruneStaleAcknowledgement,
  resolveSelectedAnalysisPair,
  type AnalysisPairRef,
  type ReportPreparation,
  type ReportPreparationPatch,
  type SelectedAnalysisPairResolution,
} from '@odysseus/core';
import { createAuditModel, type AuditDocument } from './schemas/audit.schema.js';
import { createAnalysisModel, type AnalysisDocument } from './schemas/analysis.schema.js';

/** Thrown when a selection workflow step lost its precondition between the
 *  caller's read and this write, or never had it: approving a candidate
 *  that is no longer the ready one, or approving with no candidate at all.
 *  Routes map this to 409, not 500. */
export class WritingSelectionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WritingSelectionConflictError';
  }
}

/**
 * A preparation read back from Mongo can lack keys whose subdocuments were
 * empty at write time (Mongoose does not persist empty objects inside a
 * $set nested document). Normalize at this boundary so callers always see
 * the complete core aggregate shape.
 */
function withStoredDefaults(raw: ReportPreparation | undefined): ReportPreparation {
  return {
    context: raw?.context ?? {},
    ...(raw?.customCoverQuestion ? { customCoverQuestion: raw.customCoverQuestion } : {}),
    stakeholders: raw?.stakeholders ?? {},
    journeyDecisions: raw?.journeyDecisions ?? [],
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
    { returnDocument: 'after', projection: { reportPreparation: 1 } },
  ).lean<Pick<AuditDocument, 'reportPreparation'>>();
  if (!updated) {
    throw new Error(`odysseus: audit ${auditId} not found`);
  }
  return withStoredDefaults(updated.reportPreparation ?? next);
}

/** Apply an already-validated operator patch (core's parse function ran at
 *  the transport boundary). Absent keys are unchanged, null clears;
 *  workflow metadata passes through untouched. */
export async function patchReportPreparationInputs(
  connection: Connection,
  auditId: string,
  patch: ReportPreparationPatch,
): Promise<ReportPreparation> {
  const current = await getReportPreparation(connection, auditId);
  const next = applyPreparationPatch(current, patch, new Date().toISOString());
  return persistPreparation(connection, auditId, next);
}

/** Record a confirmation of the current missing-context warnings. The
 *  digest is computed by the caller from the same core function the
 *  preview uses; this method only stores it. */
export async function setWarningAcknowledgement(
  connection: Connection,
  auditId: string,
  digest: string,
): Promise<ReportPreparation> {
  const current = await getReportPreparation(connection, auditId);
  const next: ReportPreparation = {
    ...current,
    warningAcknowledgement: { digest, acknowledgedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  };
  return persistPreparation(connection, auditId, next);
}

/** Drop a stored acknowledgement whose digest no longer matches the
 *  current inputs. Confirmation is remembered only while the
 *  warning-relevant input has not changed. */
export async function clearStaleWarningAcknowledgement(
  connection: Connection,
  auditId: string,
  currentDigest: string,
): Promise<ReportPreparation> {
  const current = await getReportPreparation(connection, auditId);
  const next = {
    ...pruneStaleAcknowledgement(current, currentDigest),
    updatedAt: new Date().toISOString(),
  };
  if (next.warningAcknowledgement === current.warningAcknowledgement) return next;
  return persistPreparation(connection, auditId, next);
}

/** Persist a finished French/English pair as the immutable ready candidate.
 *  Never touches `selected`: a candidate cannot become effective before the
 *  operator approves it, and a failed run must leave the current report
 *  alone. */
export async function recordReadyWritingCandidate(
  connection: Connection,
  auditId: string,
  pair: AnalysisPairRef,
): Promise<ReportPreparation> {
  const current = await getReportPreparation(connection, auditId);
  const next: ReportPreparation = {
    ...current,
    writingSelection: {
      ...(current.writingSelection?.selected
        ? { selected: current.writingSelection.selected }
        : {}),
      candidate: { status: 'ready', pair, createdAt: new Date().toISOString() },
    },
    updatedAt: new Date().toISOString(),
  };
  return persistPreparation(connection, auditId, next);
}

/** Persist a failed regeneration as a failed candidate. The previously
 *  selected references survive untouched, so the paid report is unchanged.
 *  When one language succeeded before the failure, its analysis id is
 *  recorded as a partial so the selection fallback can exclude the
 *  half-generated content. */
export async function recordFailedWritingCandidate(
  connection: Connection,
  auditId: string,
  reason: string,
  partialPair: { frAnalysisId?: string; enAnalysisId?: string } = {},
): Promise<ReportPreparation> {
  const current = await getReportPreparation(connection, auditId);
  const next: ReportPreparation = {
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
      },
    },
    updatedAt: new Date().toISOString(),
  };
  return persistPreparation(connection, auditId, next);
}

/**
 * Atomically make the current ready candidate the selected pair. Before
 * the update, the referenced analyses are re-read and must form a complete
 * compatible bilingual pair of this audit; the update filter itself
 * requires that exact ready candidate to still be present, so racing an
 * approval against a newer regeneration loses safely (conflict) instead of
 * selecting the wrong pair.
 */
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
  const en = await getAnalysisById(connection, auditId, candidate.pair.enAnalysisId);
  if (!isCompleteCompatiblePair(fr ?? undefined, en ?? undefined)) {
    throw new WritingSelectionConflictError(
      'odysseus: writing candidate no longer refers to a complete compatible bilingual pair',
    );
  }

  const AuditModel = createAuditModel(connection);
  const updated = await AuditModel.findOneAndUpdate(
    {
      auditId,
      'reportPreparation.writingSelection.candidate.status': 'ready',
      'reportPreparation.writingSelection.candidate.pair.frAnalysisId': candidate.pair.frAnalysisId,
      'reportPreparation.writingSelection.candidate.pair.enAnalysisId': candidate.pair.enAnalysisId,
    },
    {
      $set: {
        'reportPreparation.writingSelection.selected': candidate.pair,
        'reportPreparation.writingSelection.candidate.status': 'selected',
        'reportPreparation.writingSelection.candidate.approvedAt': new Date().toISOString(),
        'reportPreparation.updatedAt': new Date().toISOString(),
      },
    },
    { returnDocument: 'after', projection: { reportPreparation: 1 } },
  ).lean<Pick<AuditDocument, 'reportPreparation'>>();

  if (!updated?.reportPreparation) {
    throw new WritingSelectionConflictError(
      'odysseus: the ready writing candidate changed before approval could be recorded',
    );
  }
  return withStoredDefaults(updated.reportPreparation);
}

/** Exact-ID analysis read, scoped to one audit: a candidate reference from
 *  another audit can never resolve here, even with a valid analysisId. */
export async function getAnalysisById(
  connection: Connection,
  auditId: string,
  analysisId: string,
): Promise<AnalysisDocument | null> {
  const AnalysisModel = createAnalysisModel(connection);
  return AnalysisModel.findOne({ analysisId, auditId }).lean<AnalysisDocument>();
}

export async function listAnalysesForAudit(
  connection: Connection,
  auditId: string,
): Promise<AnalysisDocument[]> {
  const AnalysisModel = createAnalysisModel(connection);
  return AnalysisModel.find({ auditId }).lean<AnalysisDocument[]>();
}

export type SelectedAuditAnalysisPairResolution = SelectedAnalysisPairResolution<AnalysisDocument>;

/**
 * The one selected-pair selector, plan 019 step 2. Resolves the exact
 * selected pair when a selection exists, and otherwise falls back to the
 * latest complete pre-feature pair for legacy audits. Callers (report
 * orchestration, CLI, preview endpoints) must use this, not their own
 * latest-record query.
 */
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
