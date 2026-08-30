import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { openOutreachThread } from './outreach-threads.js';
import {
  listOutreachOutcomes,
  recordOutreachOutcome,
  OUTREACH_OUTCOME_RETENTION_DAYS,
} from './outreach-outcomes.js';
import { createOutreachOutcomeModel } from './schemas/outreach-outcome.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const RECORDED_AT = new Date('2026-08-30T09:00:00.000Z');

describe.skipIf(!mongoAvailable)('outreach outcomes', () => {
  beforeEach(async () => {
    if (!connection) return;
    await createOutreachOutcomeModel(connection).deleteMany({});
    await createOutreachThreadModel(connection).deleteMany({});
  });

  it('records an auditable event once and repoints the thread on an idempotent retry', async () => {
    if (!connection) return;
    const { thread } = await openOutreachThread(connection, {
      candidateId: randomUUID(),
      prescanId: randomUUID(),
      previewId: randomUUID(),
      domain: 'hotel-exemple.fr',
      roleAddress: 'direction@hotel-exemple.fr',
      language: 'fr',
      openedAt: RECORDED_AT,
      spacing: { touch2AfterDays: 4, touch3AfterDays: 11, replyWindowDays: 14 },
    });

    const first = await recordOutreachOutcome(connection, {
      threadId: thread.threadId,
      outcome: 'reply-positive',
      actor: 'operator',
      recordedAt: RECORDED_AT,
    });
    const retry = await recordOutreachOutcome(connection, {
      threadId: thread.threadId,
      outcome: 'reply-positive',
      actor: 'operator',
      recordedAt: new Date('2026-08-30T10:00:00.000Z'),
    });
    if ('reason' in first || 'reason' in retry) throw new Error('expected a known thread');

    expect(first.recorded).toBe(true);
    expect(retry).toEqual({ recorded: false, outcome: first.outcome });
    expect(first.outcome.expiresAt.getTime() - RECORDED_AT.getTime()).toBe(
      OUTREACH_OUTCOME_RETENTION_DAYS * DAY_MS,
    );
    expect(await listOutreachOutcomes(connection, { threadId: thread.threadId })).toHaveLength(1);
    const storedThread = await createOutreachThreadModel(connection)
      .findOne({ threadId: thread.threadId })
      .lean();
    expect(storedThread?.currentOutcome).toBe(first.outcome.outcomeId);
  });

  it('retains earlier events when the operator records a later outcome', async () => {
    if (!connection) return;
    const { thread } = await openOutreachThread(connection, {
      candidateId: randomUUID(),
      prescanId: randomUUID(),
      previewId: randomUUID(),
      domain: 'hotel-exemple.fr',
      roleAddress: 'direction@hotel-exemple.fr',
      language: 'fr',
      openedAt: RECORDED_AT,
      spacing: { touch2AfterDays: 4, touch3AfterDays: 11, replyWindowDays: 14 },
    });

    await recordOutreachOutcome(connection, {
      threadId: thread.threadId,
      outcome: 'reply-positive',
      actor: 'operator',
      recordedAt: RECORDED_AT,
    });
    const quoted = await recordOutreachOutcome(connection, {
      threadId: thread.threadId,
      outcome: 'quoted',
      actor: 'operator',
      recordedAt: new Date('2026-08-31T09:00:00.000Z'),
    });
    if ('reason' in quoted) throw new Error('expected a known thread');

    expect(await listOutreachOutcomes(connection, { threadId: thread.threadId })).toHaveLength(2);
    const storedThread = await createOutreachThreadModel(connection)
      .findOne({ threadId: thread.threadId })
      .lean();
    expect(storedThread?.currentOutcome).toBe(quoted.outcome.outcomeId);
  });
});
