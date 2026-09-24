/**
 * Mongo adapter for `MailboxReconciliationStorePort`, milestone 9c plan 012,
 * mirroring `mongo-outreach-draft-store.ts`.
 *
 * A thread's outstanding draft is read from `outreach_drafts`
 * (`status: 'created'`), never from the thread document itself: the thread
 * only ever records a provider-confirmed send in `touches`, by design (see
 * `outreach-thread.schema.ts`), so the one message still awaiting
 * confirmation lives only as a live draft row.
 */

import type { Connection } from 'mongoose';
import {
  completeOutreachSequence,
  findOutreachThreadById,
  listOutreachDrafts,
  listThreadsToSync,
  markOutreachThreadSynced,
  recordOutreachThreadTouchSent,
  recordOutreachTouchSent,
  transitionOutreachThread,
} from '@odysseus/store';
import type { MailboxReconciliationStorePort, ThreadToSync } from './reconcile-mailbox.js';

export function createMongoMailboxReconciliationStore(
  connection: Connection,
): MailboxReconciliationStorePort {
  return {
    async listThreadsToSync(options): Promise<ThreadToSync[]> {
      const threads = await listThreadsToSync(connection, options);
      const result: ThreadToSync[] = [];

      for (const thread of threads) {
        if (thread.providerThreadId === undefined) continue;

        const liveDrafts = await listOutreachDrafts(connection, {
          threadId: thread.threadId,
          status: 'created',
        });
        const outstanding = liveDrafts.find((draft) => draft.providerMessageId !== undefined);

        const lastTouch = thread.touches.reduce<{ touch: number; sentAt: Date } | undefined>(
          (latest, touch) =>
            latest === undefined || touch.sentAt.getTime() > latest.sentAt.getTime()
              ? { touch: touch.touch, sentAt: touch.sentAt }
              : latest,
          undefined,
        );

        result.push({
          threadId: thread.threadId,
          providerThreadId: thread.providerThreadId,
          state: thread.state,
          replyWindowDays: thread.spacing.replyWindowDays,
          ...(outstanding?.providerMessageId === undefined
            ? {}
            : {
                outstandingDraft: {
                  touch: outstanding.touch,
                  providerMessageId: outstanding.providerMessageId,
                  draftedAt: outstanding.createdAt,
                },
              }),
          ...(lastTouch === undefined ? {} : { lastConfirmedSentAt: lastTouch.sentAt }),
        });
      }

      return result;
    },

    async recordTouchSent(input): Promise<void> {
      await recordOutreachThreadTouchSent(connection, input.threadId, {
        touch: input.touch,
        providerMessageId: input.providerMessageId,
        sentAt: input.sentAt,
        detectedAt: input.detectedAt,
      });
      const thread = await findOutreachThreadById(connection, input.threadId);
      if (thread !== null) {
        await recordOutreachTouchSent(connection, {
          prospectId: thread.prospectId,
          threadId: input.threadId,
          touch: input.touch,
          sentAt: input.sentAt,
        });
      }
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

    async markSynced(input): Promise<void> {
      await markOutreachThreadSynced(connection, input.threadId, input.syncedAt, input.needsReview);
    },

    async completeSequence(input): Promise<boolean> {
      const result = await completeOutreachSequence(connection, input);
      return result.changed;
    },
  };
}
