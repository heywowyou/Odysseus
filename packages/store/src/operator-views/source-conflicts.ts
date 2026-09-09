/**
 * Source conflict views: the join review queue's evidence, the candidate's
 * recorded conflicts plus the pointers to the immutable source records
 * behind it.
 */

import type { Connection } from 'mongoose';
import type { HotelCandidateReviewState, HotelIdentityStatus } from '@odysseus/core';
import { getHotelCandidate } from '../hotel-candidates.js';

export interface OperatorSourceConflictRow {
  kind: string;
  detail: string;
  candidateIds: string[];
}

export interface OperatorSourceRefRow {
  source: string;
  sourceId: string;
  sourceVersion: string;
  ingestRunId: string;
}

export interface OperatorSourceConflictsView {
  candidateId: string;
  identityStatus: HotelIdentityStatus;
  reviewState: HotelCandidateReviewState;
  conflicts: OperatorSourceConflictRow[];
  /** The pointers to the immutable source records behind this candidate. The
   *  candidate never absorbed them, so a human reviewing the merge reads the
   *  original rows, not a re-telling. */
  sourceRefs: OperatorSourceRefRow[];
}

export async function getProspectSourceConflicts(
  connection: Connection,
  candidateId: string,
): Promise<OperatorSourceConflictsView | null> {
  const candidate = await getHotelCandidate(connection, candidateId);
  if (candidate === null) return null;
  return {
    candidateId: candidate.candidateId,
    identityStatus: candidate.identityStatus,
    reviewState: candidate.review.state,
    conflicts: candidate.conflicts.map((conflict) => ({
      kind: conflict.kind,
      detail: conflict.detail,
      candidateIds: [...conflict.candidateIds],
    })),
    sourceRefs: candidate.sourceRefs.map((ref) => ({
      source: ref.source,
      sourceId: ref.sourceId,
      sourceVersion: ref.sourceVersion,
      ingestRunId: ref.ingestRunId,
    })),
  };
}
