/**
 * Write helpers around the `outreach_outcomes` collection: the operator's
 * categorical result for one conversation. Rows are insert-only; the thread's
 * `currentOutcome` points at the latest one, which is what the funnel reads
 * (`outreach-funnel.ts`).
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import {
  isOutreachLostReason,
  isOutreachOutcome,
  type OutreachLostReason,
  type OutreachOutcome,
} from '@odysseus/core';
import { threadExpiry } from './outreach-threads.js';
import { createOutreachOutcomeModel } from './schemas/outreach-outcome.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { createProspectEventModel } from './schemas/prospect-event.schema.js';

export interface RecordOutreachThreadOutcomeInput {
  prospectId: string;
  outcome: OutreachOutcome;
  lostReason?: OutreachLostReason;
  actor: string;
  at: Date;
  /** A retried request repeats its key and then writes no second row. */
  idempotencyKey?: string;
}

/** `no-thread`: nothing was ever prepared for this prospect, so there is no
 *  conversation to attach the outcome to. */
export type RecordOutreachThreadOutcomeResult = 'recorded' | 'already-recorded' | 'no-thread';

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

/**
 * Stores the outcome row of the prospect's thread and points the thread at
 * its latest row. The pointer is derived from the stored rows rather than
 * from this call, so a retry after a crash between the two writes repairs
 * it instead of leaving the thread without an outcome.
 */
export async function recordOutreachThreadOutcome(
  connection: Connection,
  input: RecordOutreachThreadOutcomeInput,
): Promise<RecordOutreachThreadOutcomeResult> {
  const Threads = createOutreachThreadModel(connection);
  const thread = await Threads.findOne({ prospectId: input.prospectId })
    .select({ _id: 0, threadId: 1 })
    .lean<{ threadId: string } | null>();
  if (thread === null) return 'no-thread';

  const Outcomes = createOutreachOutcomeModel(connection);
  const outcomeId = randomUUID();
  const expiresAt = threadExpiry(input.at);
  let result: RecordOutreachThreadOutcomeResult = 'recorded';
  try {
    await Outcomes.create({
      outcomeId,
      // Scoped to the prospect, so a key reused on another prospect is a
      // different request.
      idempotencyKey:
        input.idempotencyKey === undefined
          ? outcomeId
          : `${input.prospectId}:${input.idempotencyKey}`,
      threadId: thread.threadId,
      prospectId: input.prospectId,
      outcome: input.outcome,
      ...(input.lostReason === undefined ? {} : { lostReason: input.lostReason }),
      actor: input.actor,
      recordedAt: input.at,
      expiresAt,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    result = 'already-recorded';
  }

  const latest = await Outcomes.findOne({ threadId: thread.threadId })
    .sort({ recordedAt: -1, _id: -1 })
    .select({ _id: 0, outcomeId: 1 })
    .lean<{ outcomeId: string } | null>();
  if (latest !== null) {
    await Threads.updateOne(
      { threadId: thread.threadId },
      {
        $set: {
          currentOutcome: latest.outcomeId,
          ...(result === 'recorded' ? { updatedAt: input.at, expiresAt } : {}),
        },
      },
    );
  }
  return result;
}

export interface OutreachOutcomeBackfillResult {
  /** Threads carrying no outcome pointer. */
  threadsWithoutOutcome: number;
  /** Of those, threads whose prospect still has a recorded outcome event. */
  recoverable: number;
  /** Rows written; zero on a dry run. */
  written: number;
}

/**
 * One-off repair for outcomes recorded before they reached the thread: each
 * thread without a pointer takes its prospect's latest recorded outcome
 * event still stored. A thread that already points at an outcome is never
 * touched. Counts only; `apply: false` writes nothing.
 */
export async function backfillOutreachThreadOutcomes(
  connection: Connection,
  options: { apply: boolean },
): Promise<OutreachOutcomeBackfillResult> {
  const Threads = createOutreachThreadModel(connection);
  const threads = await Threads.find({ currentOutcome: { $exists: false } })
    .select({ _id: 0, threadId: 1, prospectId: 1, expiresAt: 1 })
    .lean<{ threadId: string; prospectId: string; expiresAt: Date }[]>();
  const events = await createProspectEventModel(connection)
    .find({
      prospectId: { $in: threads.map((thread) => thread.prospectId) },
      type: { $in: ['outcome-recorded', 'opted-out'] },
    })
    .sort({ at: -1 })
    .select({ _id: 0, eventId: 1, prospectId: 1, payload: 1, actor: 1, at: 1 })
    .lean<
      {
        eventId: string;
        prospectId: string;
        payload?: Record<string, unknown>;
        actor: string;
        at: Date;
      }[]
    >();
  // Newest first, so the first event kept per prospect is its latest.
  const latestByProspect = new Map<string, (typeof events)[number]>();
  for (const event of events) {
    const outcome = event.payload?.['outcome'];
    if (typeof outcome !== 'string' || !isOutreachOutcome(outcome)) continue;
    if (!latestByProspect.has(event.prospectId)) latestByProspect.set(event.prospectId, event);
  }

  const result: OutreachOutcomeBackfillResult = {
    threadsWithoutOutcome: threads.length,
    recoverable: 0,
    written: 0,
  };
  const Outcomes = createOutreachOutcomeModel(connection);
  for (const thread of threads) {
    const event = latestByProspect.get(thread.prospectId);
    if (event === undefined) continue;
    result.recoverable += 1;
    if (!options.apply) continue;
    const lostReason = event.payload?.['lostReason'];
    const idempotencyKey = `backfill:${event.eventId}`;
    try {
      await Outcomes.create({
        outcomeId: randomUUID(),
        idempotencyKey,
        threadId: thread.threadId,
        prospectId: thread.prospectId,
        outcome: event.payload?.['outcome'] as OutreachOutcome,
        ...(typeof lostReason === 'string' && isOutreachLostReason(lostReason)
          ? { lostReason }
          : {}),
        actor: event.actor,
        recordedAt: event.at,
        // The row leaves with the thread it describes.
        expiresAt: thread.expiresAt,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
    const row = await Outcomes.findOne({ idempotencyKey })
      .select({ _id: 0, outcomeId: 1 })
      .lean<{ outcomeId: string } | null>();
    if (row === null) continue;
    const pointed = await Threads.updateOne(
      { threadId: thread.threadId, currentOutcome: { $exists: false } },
      { $set: { currentOutcome: row.outcomeId } },
    );
    result.written += pointed.modifiedCount;
  }
  return result;
}
