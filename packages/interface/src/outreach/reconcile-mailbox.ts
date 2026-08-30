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
 *  (`canTransitionOutreachThread`): both are unreachable from a merely
 *  drafted state. */
const SENT_STATES: readonly OutreachThreadState[] = ['e1-sent', 'e2-sent', 'e3-sent'];

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
    classification.kind === 'sent' && classification.touch === 3
      ? classification.sentAt
      : classification.kind === 'unchanged' && thread.state === 'e3-sent'
        ? thread.lastConfirmedSentAt
        : undefined;
  if (thirdTouchSentAt === undefined) return false;

  const dueAt = thirdTouchSentAt.getTime() + thread.replyWindowDays * DAY_MS;
  return dueAt <= now.getTime();
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
      await store.markSynced({ threadId, syncedAt: now });
      return;
    }
    case 'reply': {
      await store.transition({
        threadId,
        from: SENT_STATES,
        to: 'replied',
        at: now,
        reason: 'reply-detected',
      });
      await store.markSynced({ threadId, syncedAt: now });
      return;
    }
    case 'bounce': {
      await store.transition({
        threadId,
        from: SENT_STATES,
        to: 'bounced',
        at: now,
        reason: 'bounce-detected',
      });
      await store.markSynced({ threadId, syncedAt: now });
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
    const metadata = await options.mailbox.getThreadMetadata(thread.providerThreadId);
    const classification = classifyMailboxThread({
      messages: metadata?.messages ?? [],
      senderAddress: options.senderAddress,
      ...(thread.outstandingDraft === undefined
        ? {}
        : { outstandingDraft: thread.outstandingDraft }),
      ...(thread.lastConfirmedSentAt === undefined
        ? {}
        : { lastConfirmedSentAt: thread.lastConfirmedSentAt }),
    });

    if (options.dryRun === true) {
      results.push({ threadId: thread.threadId, classification, applied: false });
      continue;
    }

    await applyClassification(options.store, thread.threadId, classification, options.now);
    const sequenceCompleted = isSequenceCompletionDue(thread, classification, options.now)
      ? await options.store.completeSequence({ threadId: thread.threadId, at: options.now })
      : false;
    results.push({
      threadId: thread.threadId,
      classification,
      applied: true,
      ...(sequenceCompleted ? { sequenceCompleted: true } : {}),
    });
  }

  return { results };
}
