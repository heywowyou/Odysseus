/**
 * Mongo adapter for `CreateFollowUpDraftStorePort`, milestone 9c plan 012 step
 * 4, mirroring `mongo-outreach-draft-store.ts`.
 *
 * Assembles one follow-up drafting row from the thread itself (state,
 * candidateId, providerThreadId, roleAddress, language) plus the candidate,
 * the current prescan (for evidence and its retention) and the qualification
 * (for the Sirene join touch 3's facts block may quote), the same four
 * sources touch 1's row builder reads. Doing the joins here keeps
 * `createFollowUpDraft` free of queries and testable without a database.
 */

import type { Connection } from 'mongoose';
import {
  findLiveOutreachDraft,
  findOutreachThreadById,
  getHotelCandidate,
  getHotelQualification,
  getLatestPrescan,
  isSuppressed,
  advanceThreadTouch,
  recordFailedOutreachDraft,
  recordOutreachDraft,
  transitionOutreachThread,
} from '@odysseus/store';
import type {
  CreateFollowUpDraftStorePort,
  FollowUpDraftRow,
  RecordFollowUpDraftFacts,
  RecordFollowUpFailureFacts,
} from './create-follow-up-draft.js';

export interface MongoFollowUpDraftStoreOptions {
  prescanVersion: string;
  qualificationVersion: string;
}

export function createMongoFollowUpDraftStore(
  connection: Connection,
  options: MongoFollowUpDraftStoreOptions,
): CreateFollowUpDraftStorePort {
  return {
    async findFollowUpRow(threadId: string): Promise<FollowUpDraftRow | null> {
      const thread = await findOutreachThreadById(connection, threadId);
      if (thread === null) return null;

      const candidate = await getHotelCandidate(connection, thread.candidateId);
      if (candidate === null) return null;

      const prescan = await getLatestPrescan(
        connection,
        thread.candidateId,
        options.prescanVersion,
      );
      if (prescan === null) return null;

      const qualification = await getHotelQualification(
        connection,
        options.qualificationVersion,
        thread.candidateId,
      );
      const join = qualification?.sireneJoin;

      return {
        threadId: thread.threadId,
        candidateId: thread.candidateId,
        domain: thread.domain,
        businessName: candidate.name,
        language: thread.language,
        roleAddress: thread.roleAddress,
        state: thread.state,
        ...(thread.providerThreadId === undefined
          ? {}
          : { providerThreadId: thread.providerThreadId }),
        prescanVersion: prescan.prescanVersion,
        prescanExpiresAt: prescan.expiresAt,
        ...(prescan.evidence === undefined ? {} : { evidence: prescan.evidence }),
        // The same Sirene facts touch 1's row and the preview store read, in
        // the same shape, so one builder turns them into registry facts for
        // every document that carries argument B.
        ...(join?.status === 'matched' && join.denomination !== undefined
          ? {
              sirene: {
                denomination: join.denomination,
                ...(join.effectifBandCode === undefined
                  ? {}
                  : { effectifBandCode: join.effectifBandCode }),
                checkedAt: join.checkedAt,
                ...(join.stockVersion === undefined ? {} : { stockVersion: join.stockVersion }),
              },
            }
          : {}),
      };
    },

    isSuppressed(domain: string): Promise<boolean> {
      return isSuppressed(connection, domain);
    },

    async findPreviousDraft(threadId: string, touch: number): Promise<{ subject: string } | null> {
      const draft = await findLiveOutreachDraft(connection, threadId, touch);
      return draft === null ? null : { subject: draft.subject };
    },

    async findLiveDraft(threadId: string, touch: number): Promise<{ draftId: string } | null> {
      const draft = await findLiveOutreachDraft(connection, threadId, touch);
      return draft === null ? null : { draftId: draft.draftId };
    },

    async recordDraft(facts: RecordFollowUpDraftFacts): Promise<{ draftId: string }> {
      // No previewId/previewUrl: touch 2 and 3 publish no preview and add no
      // link (trade-off 54), so the fields the schema now makes optional are
      // simply omitted rather than filled with a sentinel.
      const draft = await recordOutreachDraft(connection, facts);
      return { draftId: draft.draftId };
    },

    async recordFailure(facts: RecordFollowUpFailureFacts): Promise<void> {
      await recordFailedOutreachDraft(connection, facts);
    },

    advanceTouch(threadId: string, touch: number): Promise<void> {
      return advanceThreadTouch(connection, threadId, touch);
    },

    async transition(input): Promise<boolean> {
      const result = await transitionOutreachThread(connection, {
        threadId: input.threadId,
        from: input.from,
        to: input.to,
        at: input.at,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      });
      return result.changed;
    },
  };
}
