/**
 * Mongo adapter for `OutreachDraftStorePort`, milestone 9c plan 011,
 * mirroring `mongo-outreach-preview-store.ts`.
 *
 * Plan 045 resolves contacts deterministically: manual-v1 wins, otherwise the
 * exact discovered contact generation configured for this draft runtime.
 */

import type { Connection } from 'mongoose';
import {
  advanceThreadTouch,
  attachProviderThreadId,
  findLiveOutreachDraft,
  getEffectiveHotelContact,
  getHotelCandidate,
  getHotelQualification,
  getLatestPrescan,
  isSuppressed,
  openOutreachThread,
  recordFailedOutreachDraft,
  recordOutreachDraft,
  transitionOutreachThread,
} from '@odysseus/store';
import type {
  OutreachDraftRow,
  OutreachDraftStorePort,
  OutreachThreadRef,
  RecordDraftFacts,
  RecordFailureFacts,
} from './create-outreach-draft.js';

export interface MongoOutreachDraftStoreOptions {
  prescanVersion: string;
  qualificationVersion: string;
  contactVersion: string;
}

export function createMongoOutreachDraftStore(
  connection: Connection,
  options: MongoOutreachDraftStoreOptions,
): OutreachDraftStorePort {
  return {
    async findDraftRow(candidateId: string): Promise<OutreachDraftRow | null> {
      const candidate = await getHotelCandidate(connection, candidateId);
      if (candidate === null) return null;

      const prescan = await getLatestPrescan(connection, candidateId, options.prescanVersion);
      if (prescan === null) return null;

      const contact = await getEffectiveHotelContact(
        connection,
        options.contactVersion,
        candidateId,
      );
      const qualification = await getHotelQualification(
        connection,
        options.qualificationVersion,
        candidateId,
      );
      const join = qualification?.sireneJoin;

      return {
        candidateId,
        domain: prescan.domain,
        businessName: candidate.name,
        prescanId: prescan.prescanId,
        prescanVersion: prescan.prescanVersion,
        prescanExpiresAt: prescan.expiresAt,
        ...(prescan.evidence === undefined ? {} : { evidence: prescan.evidence }),
        ...(contact === null
          ? {}
          : {
              contact: {
                address: contact.address ?? '',
                state: contact.state,
                ...(contact.addressOrigin === undefined
                  ? {}
                  : { addressOrigin: contact.addressOrigin }),
              },
            }),
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

    isSuppressed(domain: string, address?: string): Promise<boolean> {
      return isSuppressed(connection, domain, address);
    },

    async openThread(input): Promise<OutreachThreadRef> {
      const { thread } = await openOutreachThread(connection, input);
      return {
        threadId: thread.threadId,
        state: thread.state,
        currentTouch: thread.currentTouch,
        ...(thread.providerThreadId === undefined
          ? {}
          : { providerThreadId: thread.providerThreadId }),
      };
    },

    async findLiveDraft(threadId: string, touch: number): Promise<{ draftId: string } | null> {
      const draft = await findLiveOutreachDraft(connection, threadId, touch);
      return draft === null ? null : { draftId: draft.draftId };
    },

    async recordDraft(facts: RecordDraftFacts): Promise<{ draftId: string }> {
      const draft = await recordOutreachDraft(connection, facts);
      return { draftId: draft.draftId };
    },

    async recordFailure(facts: RecordFailureFacts): Promise<void> {
      await recordFailedOutreachDraft(connection, facts);
    },

    attachProviderThreadId(threadId: string, providerThreadId: string): Promise<boolean> {
      return attachProviderThreadId(connection, threadId, providerThreadId);
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
