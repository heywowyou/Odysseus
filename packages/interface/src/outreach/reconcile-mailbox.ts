/**
 * Milestone 9c plan 012: turn what the mailbox reports about a thread into a
 * state change, with no body ever read and nothing ever sent.
 *
 * Reads `MailboxDraftAdapter.getThreadMetadata` for each syncable thread,
 * hands its messages to `@odysseus/core`'s pure `classifyMailboxThread`, and
 * applies whatever fact comes back through the same
 * `transitionOutreachThread` legality gate every other move through the state
 * machine goes through. This module decides nothing about what a message
 * means; it only decides what to do once `core` has.
 *
 * A `dryRun` reconciliation classifies every thread and applies nothing, so an
 * operator can see what a real run would do before committing to it, per this
 * repository's convention for every other bounded prospecting batch.
 *
 * One thread's failure never stops the batch (issue #483): the thread is
 * flagged for review with reason `sync-error` and the next thread is read.
 */

import {
  classifyMailboxThread,
  type MailboxThreadClassification,
  type OutstandingThreadDraft,
} from '@odysseus/core';
import type { OutreachThreadState } from '@odysseus/core';
import type { MailboxDraftAdapter } from './mailbox-draft-adapter.js';

export interface ThreadToSync {
  threadId: string;
  providerThreadId: string;
  state: OutreachThreadState;
  replyWindowDays: number;
  outstandingDraft?: OutstandingThreadDraft;
  lastConfirmedSentAt?: Date;
}

export interface MailboxReconciliationStorePort {
  listThreadsToSync(options: { limit?: number; threadId?: string }): Promise<ThreadToSync[]>;
  recordTouchSent(input: {
    threadId: string;
    touch: number;
    providerMessageId: string;
    sentAt: Date;
    detectedAt: Date;
  }): Promise<void>;
  transition(input: {
    threadId: string;
    from: readonly OutreachThreadState[];
    to: OutreachThreadState;
    at: Date;
    reason?: string;
  }): Promise<boolean>;
  markSynced(input: {
    threadId: string;
    syncedAt: Date;
    needsReview?: { reason: string; detectedAt: Date };
  }): Promise<void>;
  /** Withdraws the thread's live drafts, from the mailbox and the store, once
   *  a reply or bounce has ended the sequence (issue #477): a follow-up
   *  drafted before the answer arrived must not stay one click from sending. */
  withdrawLiveDrafts(input: { threadId: string }): Promise<void>;
  /** Writes permanent suppression before moving a due E3 thread to its
   * terminal state. The store rechecks due-ness before either write. */
  completeSequence(input: { threadId: string; at: Date }): Promise<boolean>;
}

export interface ReconcileMailboxOptions {
  mailbox: MailboxDraftAdapter;
  senderAddress: string;
  store: MailboxReconciliationStorePort;
  now: Date;
  limit?: number;
  threadId?: string;
  /** When true, every thread is classified and nothing is written. */
  dryRun?: boolean;
}

export interface ReconcileMailboxThreadResult {
  threadId: string;
  classification: MailboxThreadClassification;
  applied: boolean;
  sequenceCompleted?: boolean;
  /** The thread could not be read or applied; it was flagged for review. */
  error?: string;
}

export interface ReconcileMailboxResult {
  results: readonly ReconcileMailboxThreadResult[];
}

const TOUCH_STATES: Record<number, { drafted: OutreachThreadState; sent: OutreachThreadState }> = {
  1: { drafted: 'e1-drafted', sent: 'e1-sent' },
  2: { drafted: 'e2-drafted', sent: 'e2-sent' },
  3: { drafted: 'e3-drafted', sent: 'e3-sent' },
};

/** Only a confirmed send licenses a reply or a bounce, per the state machine
 *  (`canTransitionOutreachThread`). A drafted follow-up still has a sent touch
 *  before it, so `e2-drafted` and `e3-drafted` can take a reply or a bounce
 *  (issue #477); `e1-drafted` cannot, since nothing has been sent yet. */
const ANSWERABLE_STATES: readonly OutreachThreadState[] = [
  'e1-sent',
  'e2-drafted',
  'e2-sent',
  'e3-drafted',
  'e3-sent',
];

const DAY_MS = 24 * 60 * 60 * 1000;

function isSequenceCompletionDue(
  thread: ThreadToSync,
  classification: MailboxThreadClassification,
  now: Date,
): boolean {
  if (
    classification.kind === 'reply' ||
    classification.kind === 'bounce' ||
    classification.kind === 'automated' ||
    classification.kind === 'needs-review'
  ) {
    return false;
  }

  const thirdTouchSentAt =
    classification.kind === 'sent' &&
    classification.touch === 3 &&
    classification.inboundBeforeSend === undefined
      ? classification.sentAt
      : classification.kind === 'unchanged' && thread.state === 'e3-sent'
        ? thread.lastConfirmedSentAt
        : undefined;
  if (thirdTouchSentAt === undefined) return false;

  const dueAt = thirdTouchSentAt.getTime() + thread.replyWindowDays * DAY_MS;
  return dueAt <= now.getTime();
}

/**
 * Moves the thread to `replied` or `bounced` and withdraws its live drafts.
 * A refused move is never silent: the thread is flagged for a person, since
 * an answer the state machine could not record must not leave the next
 * follow-up looking due.
 */
async function applyAnswer(
  store: MailboxReconciliationStorePort,
  threadId: string,
  kind: 'reply' | 'bounce',
  now: Date,
  reviewReason: string | undefined,
): Promise<void> {
  const to = kind === 'reply' ? 'replied' : 'bounced';
  const moved = await store.transition({
    threadId,
    from: ANSWERABLE_STATES,
    to,
    at: now,
    reason: kind === 'reply' ? 'reply-detected' : 'bounce-detected',
  });
  if (!moved) {
    await store.markSynced({
      threadId,
      syncedAt: now,
      needsReview: { reason: `${kind}-not-applied`, detectedAt: now },
    });
    return;
  }
  await store.withdrawLiveDrafts({ threadId });
  await store.markSynced({
    threadId,
    syncedAt: now,
    ...(reviewReason === undefined
      ? {}
      : { needsReview: { reason: reviewReason, detectedAt: now } }),
  });
}

async function applyClassification(
  store: MailboxReconciliationStorePort,
  threadId: string,
  classification: MailboxThreadClassification,
  now: Date,
): Promise<void> {
  switch (classification.kind) {
    case 'sent': {
      const states = TOUCH_STATES[classification.touch];
      await store.recordTouchSent({
        threadId,
        touch: classification.touch,
        providerMessageId: classification.providerMessageId,
        sentAt: classification.sentAt,
        detectedAt: now,
      });
      if (states !== undefined) {
        await store.transition({
          threadId,
          from: [states.drafted],
          to: states.sent,
          at: now,
          reason: 'confirmed-send',
        });
      }
      // The prospect answered the previous touch before this one went out.
      // The send is recorded as a fact; the answer still ends the sequence,
      // and a person should look at why a follow-up went after it.
      const answer = classification.inboundBeforeSend;
      if (answer !== undefined) {
        await applyAnswer(store, threadId, answer.kind, now, `${answer.kind}-before-send`);
        return;
      }
      await store.markSynced({ threadId, syncedAt: now });
      return;
    }
    case 'reply':
    case 'bounce': {
      await applyAnswer(store, threadId, classification.kind, now, undefined);
      return;
    }
    case 'automated': {
      // An automated response never counts as a reply and never licenses a
      // follow-up: the thread stays exactly where it is, flagged for a person
      // to look at.
      await store.markSynced({
        threadId,
        syncedAt: now,
        needsReview: { reason: 'automated-response', detectedAt: now },
      });
      return;
    }
    case 'needs-review': {
      await store.markSynced({
        threadId,
        syncedAt: now,
        needsReview: { reason: classification.reason, detectedAt: now },
      });
      return;
    }
    case 'unchanged': {
      await store.markSynced({ threadId, syncedAt: now });
      return;
    }
  }
}

export async function reconcileMailbox(
  options: ReconcileMailboxOptions,
): Promise<ReconcileMailboxResult> {
  const threads = await options.store.listThreadsToSync({
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    ...(options.threadId === undefined ? {} : { threadId: options.threadId }),
  });

  const results: ReconcileMailboxThreadResult[] = [];

  for (const thread of threads) {
    try {
      results.push(await reconcileThread(options, thread));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const classification: MailboxThreadClassification = {
        kind: 'needs-review',
        reason: 'sync-error',
      };
      if (options.dryRun !== true) {
        // Best effort: a store that is down fails this write too, and the
        // next thread still deserves its turn.
        await options.store
          .markSynced({
            threadId: thread.threadId,
            syncedAt: options.now,
            needsReview: { reason: 'sync-error', detectedAt: options.now },
          })
          .catch(() => undefined);
      }
      results.push({ threadId: thread.threadId, classification, applied: false, error: message });
    }
  }

  return { results };
}

async function reconcileThread(
  options: ReconcileMailboxOptions,
  thread: ThreadToSync,
): Promise<ReconcileMailboxThreadResult> {
  const metadata = await options.mailbox.getThreadMetadata(thread.providerThreadId);
  const classification = classifyMailboxThread({
    messages: metadata?.messages ?? [],
    senderAddress: options.senderAddress,
    ...(thread.outstandingDraft === undefined ? {} : { outstandingDraft: thread.outstandingDraft }),
    ...(thread.lastConfirmedSentAt === undefined
      ? {}
      : { lastConfirmedSentAt: thread.lastConfirmedSentAt }),
  });

  if (options.dryRun === true) {
    return { threadId: thread.threadId, classification, applied: false };
  }

  await applyClassification(options.store, thread.threadId, classification, options.now);
  const sequenceCompleted = isSequenceCompletionDue(thread, classification, options.now)
    ? await options.store.completeSequence({ threadId: thread.threadId, at: options.now })
    : false;
  return {
    threadId: thread.threadId,
    classification,
    applied: true,
    ...(sequenceCompleted ? { sequenceCompleted: true } : {}),
  };
}
