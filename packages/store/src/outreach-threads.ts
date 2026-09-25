/**
 * Read/write helpers around the `outreach_threads` collection, milestone 9c
 * plans 011 and 012. Callers never issue their own operations against it, for
 * the reason `outreach-previews.ts` gives about its own: retention and the
 * one-thread-per-candidate rule live here, and a caller writing directly would
 * have to reimplement both.
 *
 * `openOutreachThread` is an upsert rather than an insert, and that is the
 * only place in this milestone where an upsert is right. A thread is not an
 * event; it is the standing fact that a conversation with this hotel exists.
 * Opening one twice must return the same thread rather than fail, because the
 * second call is what a retried batch does, and the alternative is a command
 * that cannot be safely re-run. Drafts, which are attempts, are insert-only.
 *
 * **`transitionOutreachThread` is the one path that changes `state`.**
 * Legality is decided by `@odysseus/core`'s `canTransitionOutreachThread`
 * before the query ever reaches Mongo, and the query itself still guards on
 * the expected current state, so a race that already moved the thread loses
 * cleanly rather than double-applying a transition.
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import {
  canTransitionOutreachThread,
  normalizeDomainForHash,
  type OutreachThreadState,
} from '@odysseus/core';
import {
  createOutreachThreadModel,
  type OutreachThreadDocument,
  type OutreachThreadSpacing,
  type OutreachThreadTouchRecord,
} from './schemas/outreach-thread.schema.js';
import { addSuppressionEntry } from './suppression.js';

/** Operational retention, per docs/rules/prospect-qualification.md section 7. */
const OUTREACH_THREAD_RETENTION_DAYS = 90;

/** States in which nothing has been sent yet, so reopening the thread for a
 *  new first email may replace its language, recipient and preview. */
const REOPENABLE_STATES: readonly OutreachThreadState[] = ['open', 'e1-drafted'];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OpenOutreachThreadInput {
  prospectId: string;
  previewId: string;
  domain: string;
  roleAddress: string;
  language: 'fr' | 'en';
  openedAt: Date;
  spacing: OutreachThreadSpacing;
  /** Issue #533: stamped on a new thread only; a reopened one keeps its own. */
  campaignVersion: string;
}

export interface OpenedOutreachThread {
  thread: OutreachThreadDocument;
  /** False when a thread already existed, so a caller can report "resumed"
   *  rather than "opened" without a second read. */
  created: boolean;
}

export async function openOutreachThread(
  connection: Connection,
  input: OpenOutreachThreadInput,
): Promise<OpenedOutreachThread> {
  const ThreadModel = createOutreachThreadModel(connection);
  await ThreadModel.init();

  const existing = await ThreadModel.findOne({ prospectId: input.prospectId }).lean();
  if (existing !== null) {
    // Issue #482: before the first email is sent, a redraft (after the
    // operator discarded E1) may change the language, recipient or preview,
    // and follow-ups and sequence completion read them from the thread. Once
    // E1 has gone out they are what the prospect received and never change.
    // Callers refuse a redraft while an E1 draft is still live.
    if (REOPENABLE_STATES.includes(existing.state)) {
      const refreshed = await ThreadModel.findOneAndUpdate(
        { threadId: existing.threadId, state: { $in: REOPENABLE_STATES } },
        {
          $set: {
            language: input.language,
            languageSource: 'operator',
            roleAddress: input.roleAddress,
            previewId: input.previewId,
            updatedAt: input.openedAt,
          },
        },
        { new: true },
      ).lean();
      return { thread: refreshed ?? existing, created: false };
    }
    return { thread: existing, created: false };
  }

  const thread: OutreachThreadDocument = {
    threadId: randomUUID(),
    prospectId: input.prospectId,
    previewId: input.previewId,
    // Stored canonically, so closing every thread for a domain on objection
    // matches the same spelling suppression writes use (see trade-off note in
    // `outreach-previews.ts`).
    domain: normalizeDomainForHash(input.domain),
    roleAddress: input.roleAddress,
    language: input.language,
    languageSource: 'operator',
    currentTouch: 0,
    state: 'open',
    stateEnteredAt: input.openedAt,
    touches: [],
    spacing: input.spacing,
    campaignVersion: input.campaignVersion,
    createdAt: input.openedAt,
    updatedAt: input.openedAt,
    expiresAt: new Date(input.openedAt.getTime() + OUTREACH_THREAD_RETENTION_DAYS * DAY_MS),
  };

  try {
    await ThreadModel.create(thread);
    return { thread, created: true };
  } catch (error) {
    // A concurrent opener won the unique index on `prospectId`. Theirs is as
    // good as ours, so read it back rather than failing the run: this is
    // exactly the race the index exists to decide.
    const raced = await ThreadModel.findOne({ prospectId: input.prospectId }).lean();
    if (raced !== null) return { thread: raced, created: false };
    throw error;
  }
}

export async function findOutreachThreadById(
  connection: Connection,
  threadId: string,
): Promise<OutreachThreadDocument | null> {
  const ThreadModel = createOutreachThreadModel(connection);
  return ThreadModel.findOne({ threadId }).lean();
}

export async function findOutreachThreadByProspect(
  connection: Connection,
  prospectId: string,
): Promise<OutreachThreadDocument | null> {
  const ThreadModel = createOutreachThreadModel(connection);
  return ThreadModel.findOne({ prospectId }).lean();
}

/**
 * Record the provider's own thread id, once.
 *
 * Compare-and-set on the field being absent rather than a plain update: the
 * first draft on a thread establishes which provider conversation it is, and a
 * later attempt that produced a different one means something is wrong that
 * should be visible rather than overwritten.
 */
export async function attachProviderThreadId(
  connection: Connection,
  threadId: string,
  providerThreadId: string,
): Promise<boolean> {
  const ThreadModel = createOutreachThreadModel(connection);
  const result = await ThreadModel.updateOne(
    { threadId, providerThreadId: { $exists: false } },
    { $set: { providerThreadId, updatedAt: new Date() } },
  );
  return result.modifiedCount === 1;
}

/**
 * Point the thread at the Gmail conversation of a new first-touch draft.
 * Unlike `attachProviderThreadId` this overwrites: a first email redrafted
 * after a discard starts a new conversation, because Gmail deleted the old
 * one together with its only draft, and follow-ups and mailbox sync must
 * follow the new one.
 */
export async function replaceProviderThreadId(
  connection: Connection,
  threadId: string,
  providerThreadId: string,
): Promise<void> {
  const ThreadModel = createOutreachThreadModel(connection);
  await ThreadModel.updateOne({ threadId }, { $set: { providerThreadId, updatedAt: new Date() } });
}

/**
 * Move the thread to a touch, only ever forward.
 *
 * The guard is `$lt`, so a retry that already advanced the thread is a no-op
 * rather than a rewind. A caller cannot tell those apart from the return
 * value alone, which is intended: both mean "the thread is at least here".
 */
export async function advanceThreadTouch(
  connection: Connection,
  threadId: string,
  touch: number,
): Promise<void> {
  const ThreadModel = createOutreachThreadModel(connection);
  await ThreadModel.updateOne(
    { threadId, currentTouch: { $lt: touch } },
    { $set: { currentTouch: touch, updatedAt: new Date() } },
  );
}

export interface TransitionOutreachThreadInput {
  threadId: string;
  /** States the thread must currently be in for the move to apply. Rejecting
   *  a state not in this list, or one the state machine itself refuses, both
   *  read as `changed: false` - the caller does not need to distinguish an
   *  illegal move from a race it lost. */
  from: readonly OutreachThreadState[];
  to: OutreachThreadState;
  at: Date;
  reason?: string;
}

export interface TransitionOutreachThreadResult {
  changed: boolean;
  thread: OutreachThreadDocument | null;
}

/**
 * The one path that changes `state`. Every `from` candidate is checked
 * against the state machine before the query runs, so a caller cannot ask for
 * a move the table refuses even if some `from` value happens to match what is
 * stored.
 */
export async function transitionOutreachThread(
  connection: Connection,
  input: TransitionOutreachThreadInput,
): Promise<TransitionOutreachThreadResult> {
  const legalFrom = input.from.filter((state) => canTransitionOutreachThread(state, input.to));
  if (legalFrom.length === 0) return { changed: false, thread: null };

  const ThreadModel = createOutreachThreadModel(connection);
  const result = await ThreadModel.findOneAndUpdate(
    { threadId: input.threadId, state: { $in: legalFrom } },
    {
      $set: {
        state: input.to,
        stateEnteredAt: input.at,
        updatedAt: input.at,
        ...(input.reason !== undefined ? { stateReason: input.reason } : {}),
      },
    },
    { returnDocument: 'after' },
  ).lean();

  if (result === null) {
    const current = await findOutreachThreadById(connection, input.threadId);
    return { changed: false, thread: current };
  }
  return { changed: true, thread: result };
}

/**
 * Record a provider-confirmed send, once per touch. `touches` accumulates
 * rather than replaces, since a thread may carry up to three.
 */
export async function recordOutreachThreadTouchSent(
  connection: Connection,
  threadId: string,
  touch: OutreachThreadTouchRecord,
): Promise<boolean> {
  const ThreadModel = createOutreachThreadModel(connection);
  const result = await ThreadModel.updateOne(
    { threadId, 'touches.touch': { $ne: touch.touch } },
    { $push: { touches: touch }, $set: { updatedAt: new Date() } },
  );
  return result.modifiedCount === 1;
}

/** Sets `lastSyncedAt` and clears or sets `needsReview`, independent of any
 *  state transition: a sync that found nothing new still recorded that it
 *  ran. */
export async function markOutreachThreadSynced(
  connection: Connection,
  threadId: string,
  syncedAt: Date,
  needsReview?: { reason: string; detectedAt: Date },
): Promise<void> {
  const ThreadModel = createOutreachThreadModel(connection);
  await ThreadModel.updateOne(
    { threadId },
    {
      $set: {
        lastSyncedAt: syncedAt,
        updatedAt: syncedAt,
        ...(needsReview !== undefined ? { needsReview } : {}),
      },
      ...(needsReview === undefined ? { $unset: { needsReview: '' } } : {}),
    },
  );
}

export interface CloseOutreachThreadsResult {
  closed: number;
}

/**
 * Close every active thread for a domain, whatever active state each is in.
 *
 * Called on objection and on suppression, alongside preview revocation, so the
 * two halves of one `prospect object` run cannot disagree: the domain is
 * canonicalized through `normalizeDomainForHash` here for the same reason
 * `listLivePreviewsForDomain` does it.
 */
export async function closeOutreachThreadsForDomain(
  connection: Connection,
  domain: string,
  reason: string,
): Promise<CloseOutreachThreadsResult> {
  const ThreadModel = createOutreachThreadModel(connection);
  const now = new Date();
  const result = await ThreadModel.updateMany(
    {
      domain: normalizeDomainForHash(domain),
      state: { $nin: ['replied', 'bounced', 'opted-out', 'sequence-complete', 'closed'] },
    },
    {
      $set: {
        state: 'closed',
        stateEnteredAt: now,
        stateReason: reason,
        updatedAt: now,
      },
    },
  );
  return { closed: result.modifiedCount };
}

/** Returns the most recent provider reconciliation timestamp without exposing
 *  a thread or any mailbox identity. The inbox uses this as freshness
 *  context; absence means no successful sync has stamped a thread yet. */
export async function getLatestOutreachSyncAt(connection: Connection): Promise<Date | null> {
  const row = await createOutreachThreadModel(connection)
    .findOne({ lastSyncedAt: { $exists: true } })
    .sort({ lastSyncedAt: -1 })
    .select({ _id: 0, lastSyncedAt: 1 })
    .lean<{ lastSyncedAt?: Date } | null>();
  return row?.lastSyncedAt ?? null;
}

/**
 * When the next follow-up of a thread in `e1-sent` or `e2-sent` becomes due:
 * the previous touch's confirmed `sentAt` plus the thread's own spacing
 * snapshot. Undefined in any other state, or before that touch's send is
 * recorded. The one formula the due list, the To-do list and the follow-up
 * guard share (issue #479).
 */
export function followUpDueAt(
  thread: Pick<OutreachThreadDocument, 'state' | 'touches' | 'spacing'>,
): Date | undefined {
  const lastTouch = thread.state === 'e1-sent' ? 1 : thread.state === 'e2-sent' ? 2 : undefined;
  if (lastTouch === undefined) return undefined;
  const sent = thread.touches.find((touch) => touch.touch === lastTouch);
  if (sent === undefined) return undefined;
  const afterDays =
    lastTouch === 1 ? thread.spacing.touch2AfterDays : thread.spacing.touch3AfterDays;
  return new Date(new Date(sent.sentAt).getTime() + afterDays * DAY_MS);
}

export interface ListThreadsDueForFollowUpOptions {
  now: Date;
  limit?: number;
}

/**
 * Threads whose prior touch is provider-confirmed sent, whose due date (that
 * touch's `sentAt` plus the thread's own spacing snapshot) has passed, and
 * which carry no reply/bounce/opt-out/review flag. Suppression is rechecked by
 * the caller immediately before drafting, per plan 012 step 4 - this query
 * answers "who is due", not "who may still be contacted".
 */
export async function listThreadsDueForFollowUp(
  connection: Connection,
  options: ListThreadsDueForFollowUpOptions,
): Promise<OutreachThreadDocument[]> {
  const ThreadModel = createOutreachThreadModel(connection);
  const candidates = await ThreadModel.find({
    state: { $in: ['e1-sent', 'e2-sent'] },
    needsReview: { $exists: false },
  })
    .sort({ createdAt: 1 })
    .lean();

  const due: OutreachThreadDocument[] = [];
  for (const thread of candidates) {
    const dueAt = followUpDueAt(thread);
    if (dueAt === undefined) continue;
    if (dueAt.getTime() <= options.now.getTime()) due.push(thread);
    if (options.limit !== undefined && due.length >= options.limit) break;
  }
  return due;
}

export interface CompleteOutreachSequenceInput {
  threadId: string;
  at: Date;
}

export interface CompleteOutreachSequenceResult {
  changed: boolean;
}

/**
 * Permanently suppress a three-touch sequence whose own reply window elapsed,
 * then move it to its terminal state. The irreversible safety write comes
 * first: a failure or race after it may conservatively leave a replied thread
 * suppressed, but can never leave a completed thread eligible for ingestion.
 */
export async function completeOutreachSequence(
  connection: Connection,
  input: CompleteOutreachSequenceInput,
): Promise<CompleteOutreachSequenceResult> {
  const ThreadModel = createOutreachThreadModel(connection);
  const thread = await ThreadModel.findOne({
    threadId: input.threadId,
    state: 'e3-sent',
    needsReview: { $exists: false },
  }).lean();
  if (thread === null) return { changed: false };

  const thirdTouch = thread.touches.find((touch) => touch.touch === 3);
  if (thirdTouch === undefined) return { changed: false };
  const dueAt = new Date(thirdTouch.sentAt).getTime() + thread.spacing.replyWindowDays * DAY_MS;
  if (dueAt > input.at.getTime()) return { changed: false };

  await addSuppressionEntry(connection, {
    domain: thread.domain,
    address: thread.roleAddress,
    reasonCode: 'sequence-complete',
    reason: 'three-touch outreach sequence completed with no reply',
  });
  const transition = await transitionOutreachThread(connection, {
    threadId: input.threadId,
    from: ['e3-sent'],
    to: 'sequence-complete',
    at: input.at,
    reason: 'reply-window-elapsed',
  });
  return { changed: transition.changed };
}

/** States worth asking the mailbox about: a touch has been drafted (so a send
 *  could confirm at any time) or already sent (so a reply or bounce could
 *  arrive at any time). A thread with no `providerThreadId` yet has nothing to
 *  ask the mailbox about, since no message has ever been created for it. */
const SYNCABLE_OUTREACH_THREAD_STATES: readonly OutreachThreadState[] = [
  'e1-drafted',
  'e1-sent',
  'e2-drafted',
  'e2-sent',
  'e3-drafted',
  'e3-sent',
];

export interface ListThreadsToSyncOptions {
  limit?: number;
  threadId?: string;
}

export async function listThreadsToSync(
  connection: Connection,
  options: ListThreadsToSyncOptions = {},
): Promise<OutreachThreadDocument[]> {
  const ThreadModel = createOutreachThreadModel(connection);
  const query: Record<string, unknown> = {
    state: { $in: SYNCABLE_OUTREACH_THREAD_STATES },
    providerThreadId: { $exists: true },
  };
  if (options.threadId !== undefined) query['threadId'] = options.threadId;
  const cursor = ThreadModel.find(query).sort({ createdAt: 1 });
  if (options.limit !== undefined) cursor.limit(options.limit);
  return cursor.lean();
}
