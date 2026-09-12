/**
 * Cross-candidate review lists: the pending Gmail drafts and the threads
 * whose reply state a sync could not confidently classify, both metadata
 * only and always paginated.
 */

import type { Connection } from 'mongoose';
import type { OutreachEvidenceSlot, OutreachThreadState } from '@odysseus/core';
import { getHotelCandidatesByIds } from '../hotel-candidates.js';
import { createOutreachDraftModel } from '../schemas/outreach-draft.schema.js';
import { createOutreachThreadModel } from '../schemas/outreach-thread.schema.js';
import { pageBounds, type OperatorViewPage, type OperatorViewPageOptions } from './shared.js';

export interface OperatorReviewDraftRow {
  draftId: string;
  threadId: string;
  candidateId: string;
  /** Plan 040 slice 6 (approved IA, additive item 2): the catalogue name of
   *  the row's candidate, so a queue row names a business instead of a raw
   *  identifier. Null when the candidate row no longer resolves; never a
   *  guessed name. */
  hotelName: string | null;
  touch: number;
  language: 'fr' | 'en';
  touch1EvidenceSlot: OutreachEvidenceSlot | null;
  hasProviderDraft: boolean;
  createdAt: Date;
}

/** Names for one page's candidate ids in a single bounded $in query. The id
 *  set never exceeds the page limit, so the lookup stays proportional to
 *  what the caller already fetched. */
async function hotelNamesByIds(
  connection: Connection,
  candidateIds: string[],
): Promise<Map<string, string>> {
  const candidates = await getHotelCandidatesByIds(connection, [...new Set(candidateIds)]);
  return new Map(candidates.map((candidate) => [candidate.candidateId, candidate.name]));
}

/** Every pending Gmail draft across candidates, metadata only. Reviewing a
 *  draft happens in the mailbox; this list is what tells the operator which
 *  candidates have one waiting and how old it is. */
export async function listOutreachReviewDrafts(
  connection: Connection,
  options: OperatorViewPageOptions,
): Promise<OperatorViewPage<OperatorReviewDraftRow>> {
  const { limit, offset, skip } = pageBounds(options);
  const DraftModel = createOutreachDraftModel(connection);
  const filter: Record<string, unknown> = { status: 'created' };
  const [total, rows] = await Promise.all([
    DraftModel.countDocuments(filter),
    DraftModel.find(filter)
      .sort({ createdAt: -1, draftId: 1 })
      .skip(skip)
      .limit(limit)
      .select({
        draftId: 1,
        threadId: 1,
        candidateId: 1,
        touch: 1,
        language: 1,
        touch1EvidenceSlot: 1,
        providerDraftId: 1,
        createdAt: 1,
        _id: 0,
      })
      .lean<
        {
          draftId: string;
          threadId: string;
          candidateId: string;
          touch: number;
          language: 'fr' | 'en';
          touch1EvidenceSlot?: OutreachEvidenceSlot;
          providerDraftId?: string;
          createdAt: Date;
        }[]
      >(),
  ]);
  const names = await hotelNamesByIds(
    connection,
    rows.map((row) => row.candidateId),
  );
  return {
    rows: rows.map((row) => ({
      draftId: row.draftId,
      threadId: row.threadId,
      candidateId: row.candidateId,
      hotelName: names.get(row.candidateId) ?? null,
      touch: row.touch,
      language: row.language,
      touch1EvidenceSlot: row.touch1EvidenceSlot ?? null,
      hasProviderDraft: row.providerDraftId !== undefined,
      createdAt: row.createdAt,
    })),
    total,
    limit,
    offset,
  };
}

export interface OperatorReplyReviewRow {
  threadId: string;
  candidateId: string;
  /** Same contract as OperatorReviewDraftRow.hotelName above. */
  hotelName: string | null;
  domain: string;
  language: 'fr' | 'en';
  state: OutreachThreadState;
  currentTouch: number;
  reviewReason: string;
  reviewDetectedAt: Date;
  lastSyncedAt: Date | null;
}

/** Threads whose reply state a sync could not confidently classify. Metadata
 *  only: what the ambiguity is and when it was noticed, never the reply
 *  text, which this collection does not store in the first place. */
export async function listRepliesNeedingReview(
  connection: Connection,
  options: OperatorViewPageOptions,
): Promise<OperatorViewPage<OperatorReplyReviewRow>> {
  const { limit, offset, skip } = pageBounds(options);
  const ThreadModel = createOutreachThreadModel(connection);
  const filter: Record<string, unknown> = { needsReview: { $exists: true } };
  const [total, rows] = await Promise.all([
    ThreadModel.countDocuments(filter),
    ThreadModel.find(filter)
      .sort({ 'needsReview.detectedAt': -1, threadId: 1 })
      .skip(skip)
      .limit(limit)
      .select({
        threadId: 1,
        candidateId: 1,
        domain: 1,
        language: 1,
        state: 1,
        currentTouch: 1,
        'needsReview.reason': 1,
        'needsReview.detectedAt': 1,
        lastSyncedAt: 1,
        _id: 0,
      })
      .lean<
        {
          threadId: string;
          candidateId: string;
          domain: string;
          language: 'fr' | 'en';
          state: OutreachThreadState;
          currentTouch: number;
          needsReview?: { reason: string; detectedAt: Date };
          lastSyncedAt?: Date;
        }[]
      >(),
  ]);
  const names = await hotelNamesByIds(
    connection,
    rows.map((row) => row.candidateId),
  );
  return {
    rows: rows.map((row) => ({
      threadId: row.threadId,
      candidateId: row.candidateId,
      hotelName: names.get(row.candidateId) ?? null,
      domain: row.domain,
      language: row.language,
      state: row.state,
      currentTouch: row.currentTouch,
      reviewReason: row.needsReview?.reason ?? '',
      reviewDetectedAt: row.needsReview?.detectedAt ?? new Date(0),
      lastSyncedAt: row.lastSyncedAt ?? null,
    })),
    total,
    limit,
    offset,
  };
}
