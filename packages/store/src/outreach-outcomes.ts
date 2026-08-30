/** Insert-only, operator-set outreach outcome events, milestone 9c plan 012. */
import { createHash, randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import type { OutreachLostReason, OutreachOutcome } from '@odysseus/core';
import { findOutreachThreadById, setOutreachThreadOutcome } from './outreach-threads.js';
import {
  createOutreachOutcomeModel,
  type OutreachOutcomeDocument,
} from './schemas/outreach-outcome.schema.js';

export const OUTREACH_OUTCOME_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecordOutreachOutcomeInput {
  threadId: string;
  outcome: OutreachOutcome;
  lostReason?: OutreachLostReason;
  actor: string;
  recordedAt: Date;
}

export type RecordOutreachOutcomeResult =
  | { recorded: boolean; outcome: OutreachOutcomeDocument }
  | { recorded: false; reason: 'thread-unknown' };

function idempotencyKey(input: RecordOutreachOutcomeInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify([input.threadId, input.outcome, input.lostReason ?? null, input.actor.trim()]),
      'utf8',
    )
    .digest('hex');
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

export async function recordOutreachOutcome(
  connection: Connection,
  input: RecordOutreachOutcomeInput,
): Promise<RecordOutreachOutcomeResult> {
  if (input.outcome !== 'lost' && input.lostReason !== undefined) {
    throw new Error('lostReason is allowed only when outcome is lost');
  }
  const actor = input.actor.trim();
  if (actor === '') throw new Error('actor must not be empty');

  const thread = await findOutreachThreadById(connection, input.threadId);
  if (thread === null) return { recorded: false, reason: 'thread-unknown' };

  const OutcomeModel = createOutreachOutcomeModel(connection);
  await OutcomeModel.init();
  const key = idempotencyKey({ ...input, actor });
  const existing = await OutcomeModel.findOne({ idempotencyKey: key })
    .select({ _id: 0, __v: 0 })
    .lean();
  if (existing !== null) {
    await setOutreachThreadOutcome(connection, input.threadId, existing.outcomeId);
    return { recorded: false, outcome: existing };
  }

  const outcome: OutreachOutcomeDocument = {
    outcomeId: randomUUID(),
    idempotencyKey: key,
    threadId: input.threadId,
    candidateId: thread.candidateId,
    outcome: input.outcome,
    ...(input.lostReason === undefined ? {} : { lostReason: input.lostReason }),
    actor,
    recordedAt: input.recordedAt,
    expiresAt: new Date(input.recordedAt.getTime() + OUTREACH_OUTCOME_RETENTION_DAYS * DAY_MS),
  };

  try {
    await OutcomeModel.create(outcome);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const raced = await OutcomeModel.findOne({ idempotencyKey: key })
      .select({ _id: 0, __v: 0 })
      .lean();
    if (raced === null) throw error;
    await setOutreachThreadOutcome(connection, input.threadId, raced.outcomeId);
    return { recorded: false, outcome: raced };
  }
  await setOutreachThreadOutcome(connection, input.threadId, outcome.outcomeId);
  return { recorded: true, outcome };
}

export interface ListOutreachOutcomesOptions {
  threadId?: string;
  limit?: number;
}

export async function listOutreachOutcomes(
  connection: Connection,
  options: ListOutreachOutcomesOptions = {},
): Promise<OutreachOutcomeDocument[]> {
  const query: Record<string, unknown> = {};
  if (options.threadId !== undefined) query['threadId'] = options.threadId;
  const cursor = createOutreachOutcomeModel(connection)
    .find(query)
    .select({ _id: 0, __v: 0 })
    .sort({ recordedAt: -1 });
  if (options.limit !== undefined) cursor.limit(options.limit);
  return cursor.lean();
}
