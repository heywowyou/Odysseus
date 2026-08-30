/**
 * Read/write helpers around the `outreach_threads` collection, milestone 9c
 * plan 011. Callers never issue their own operations against it, for the
 * reason `outreach-previews.ts` gives about its own: retention and the
 * one-thread-per-candidate rule live here, and a caller writing directly would
 * have to reimplement both.
 *
 * `openOutreachThread` is an upsert rather than an insert, and that is the
 * only place in this milestone where an upsert is right. A thread is not an
 * event; it is the standing fact that a conversation with this hotel exists.
 * Opening one twice must return the same thread rather than fail, because the
 * second call is what a retried batch does, and the alternative is a command
 * that cannot be safely re-run. Drafts, which are attempts, are insert-only.
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import { normalizeDomainForHash } from '@odysseus/core';
import {
  createOutreachThreadModel,
  type OutreachThreadDocument,
} from './schemas/outreach-thread.schema.js';

/** Operational retention, per docs/rules/prospect-qualification.md section 7. */
export const OUTREACH_THREAD_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OpenOutreachThreadInput {
  candidateId: string;
  prescanId: string;
  previewId: string;
  domain: string;
  roleAddress: string;
  language: 'fr' | 'en';
  openedAt: Date;
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

  const existing = await ThreadModel.findOne({ candidateId: input.candidateId }).lean();
  if (existing !== null) return { thread: existing, created: false };

  const thread: OutreachThreadDocument = {
    threadId: randomUUID(),
    candidateId: input.candidateId,
    prescanId: input.prescanId,
    previewId: input.previewId,
    // Stored canonically, so closing every thread for a domain on objection
    // matches the same spelling suppression writes use (see trade-off note in
    // `outreach-previews.ts`).
    domain: normalizeDomainForHash(input.domain),
    roleAddress: input.roleAddress,
    language: input.language,
    languageSource: 'operator',
    currentTouch: 0,
    status: 'open',
    createdAt: input.openedAt,
    updatedAt: input.openedAt,
    expiresAt: new Date(input.openedAt.getTime() + OUTREACH_THREAD_RETENTION_DAYS * DAY_MS),
  };

  try {
    await ThreadModel.create(thread);
    return { thread, created: true };
  } catch (error) {
    // A concurrent opener won the unique index on `candidateId`. Theirs is as
    // good as ours, so read it back rather than failing the run: this is
    // exactly the race the index exists to decide.
    const raced = await ThreadModel.findOne({ candidateId: input.candidateId }).lean();
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

export async function findOutreachThreadByCandidate(
  connection: Connection,
  candidateId: string,
): Promise<OutreachThreadDocument | null> {
  const ThreadModel = createOutreachThreadModel(connection);
  return ThreadModel.findOne({ candidateId }).lean();
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

export interface CloseOutreachThreadsResult {
  closed: number;
}

/**
 * Close every open thread for a domain.
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
  const result = await ThreadModel.updateMany(
    { domain: normalizeDomainForHash(domain), status: 'open' },
    {
      $set: { status: 'closed', closedAt: new Date(), closedReason: reason, updatedAt: new Date() },
    },
  );
  return { closed: result.modifiedCount };
}

export interface ListOutreachThreadsOptions {
  status?: 'open' | 'closed';
  domain?: string;
  limit?: number;
}

export async function listOutreachThreads(
  connection: Connection,
  options: ListOutreachThreadsOptions = {},
): Promise<OutreachThreadDocument[]> {
  const ThreadModel = createOutreachThreadModel(connection);
  const query: Record<string, unknown> = {};
  if (options.status !== undefined) query['status'] = options.status;
  if (options.domain !== undefined) query['domain'] = normalizeDomainForHash(options.domain);
  const cursor = ThreadModel.find(query).sort({ createdAt: -1 });
  if (options.limit !== undefined) cursor.limit(options.limit);
  return cursor.lean();
}
