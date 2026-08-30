import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  advanceThreadTouch,
  attachProviderThreadId,
  closeOutreachThreadsForDomain,
  completeOutreachSequence,
  findOutreachThreadByCandidate,
  findOutreachThreadById,
  listOutreachThreads,
  listThreadsDueForFollowUp,
  listThreadsToSync,
  markOutreachThreadSynced,
  openOutreachThread,
  recordOutreachThreadTouchSent,
  setOutreachThreadOutcome,
  transitionOutreachThread,
  OUTREACH_THREAD_RETENTION_DAYS,
  type OpenOutreachThreadInput,
} from './outreach-threads.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { createSuppressionModel } from './schemas/suppression.schema.js';
import { isSuppressed } from './suppression.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const OPENED_AT = new Date('2026-08-30T09:00:00.000Z');
const SPACING = { touch2AfterDays: 4, touch3AfterDays: 11, replyWindowDays: 14 };

function input(overrides: Partial<OpenOutreachThreadInput> = {}): OpenOutreachThreadInput {
  return {
    candidateId: randomUUID(),
    prescanId: randomUUID(),
    previewId: randomUUID(),
    domain: 'hotel-exemple.fr',
    roleAddress: 'direction@hotel-exemple.fr',
    language: 'fr',
    openedAt: OPENED_AT,
    spacing: SPACING,
    ...overrides,
  };
}

describe.skipIf(!mongoAvailable)('outreach threads', () => {
  beforeEach(async () => {
    if (connection) {
      await createOutreachThreadModel(connection).deleteMany({});
      await createSuppressionModel(connection).deleteMany({});
    }
  });

  it('opens a thread at touch zero with a 90 day retention', async () => {
    if (!connection) return;
    const { thread, created } = await openOutreachThread(connection, input());

    expect(created).toBe(true);
    expect(thread.state).toBe('open');
    expect(thread.currentTouch).toBe(0);
    expect(thread.touches).toEqual([]);
    expect(thread.providerThreadId).toBeUndefined();
    expect(thread.spacing).toEqual(SPACING);
    expect(thread.expiresAt.getTime() - OPENED_AT.getTime()).toBe(
      OUTREACH_THREAD_RETENTION_DAYS * DAY_MS,
    );
  });

  it('records the language source as operator, never as detected', async () => {
    if (!connection) return;
    const { thread } = await openOutreachThread(connection, input());
    // docs/rules/outreach-rules.md section 7: the prospect's site language has no
    // deterministic source yet, so the record must not imply one was used.
    expect(thread.languageSource).toBe('operator');
  });

  it('returns the existing thread rather than opening a second for one hotel', async () => {
    if (!connection) return;
    const first = await openOutreachThread(connection, input({ candidateId: 'candidate-1' }));
    const second = await openOutreachThread(connection, input({ candidateId: 'candidate-1' }));

    expect(second.created).toBe(false);
    expect(second.thread.threadId).toBe(first.thread.threadId);
    expect(await createOutreachThreadModel(connection).countDocuments({})).toBe(1);
  });

  it('survives two openers racing the unique index', async () => {
    if (!connection) return;
    const shared = input({ candidateId: 'candidate-race' });
    const [a, b] = await Promise.all([
      openOutreachThread(connection, shared),
      openOutreachThread(connection, shared),
    ]);

    expect(a.thread.threadId).toBe(b.thread.threadId);
    expect(await createOutreachThreadModel(connection).countDocuments({})).toBe(1);
  });

  it('canonicalizes the stored domain so objection matches suppression', async () => {
    if (!connection) return;
    const { thread } = await openOutreachThread(
      connection,
      input({ domain: 'WWW.Hotel-Exemple.FR' }),
    );
    expect(thread.domain).toBe('hotel-exemple.fr');
  });

  it('attaches a provider thread id once and refuses to overwrite it', async () => {
    if (!connection) return;
    const { thread } = await openOutreachThread(connection, input());

    await expect(
      attachProviderThreadId(connection, thread.threadId, 'gmail-thread-1'),
    ).resolves.toBe(true);
    // A different provider thread on a second attempt means something is wrong
    // upstream, and must be visible rather than silently replacing the first.
    await expect(
      attachProviderThreadId(connection, thread.threadId, 'gmail-thread-2'),
    ).resolves.toBe(false);
    const stored = await findOutreachThreadById(connection, thread.threadId);
    expect(stored?.providerThreadId).toBe('gmail-thread-1');
  });

  it('advances a touch forward only', async () => {
    if (!connection) return;
    const { thread } = await openOutreachThread(connection, input());

    await advanceThreadTouch(connection, thread.threadId, 2);
    await advanceThreadTouch(connection, thread.threadId, 1);

    const stored = await findOutreachThreadById(connection, thread.threadId);
    expect(stored?.currentTouch).toBe(2);
  });

  it('closes every active thread for a domain however the objection spells it', async () => {
    if (!connection) return;
    await openOutreachThread(connection, input({ candidateId: 'a', domain: 'hotel-exemple.fr' }));
    await openOutreachThread(connection, input({ candidateId: 'b', domain: 'hotel-exemple.fr' }));
    await openOutreachThread(connection, input({ candidateId: 'c', domain: 'autre-hotel.fr' }));

    const result = await closeOutreachThreadsForDomain(
      connection,
      'https://WWW.hotel-exemple.fr/',
      'objection',
    );

    expect(result.closed).toBe(2);
    expect(await listOutreachThreads(connection, { state: 'open' })).toHaveLength(1);
    const closed = await findOutreachThreadByCandidate(connection, 'a');
    expect(closed?.state).toBe('closed');
    expect(closed?.stateReason).toBe('objection');
  });

  it('closing twice reports nothing further closed', async () => {
    if (!connection) return;
    await openOutreachThread(connection, input({ domain: 'hotel-exemple.fr' }));
    await closeOutreachThreadsForDomain(connection, 'hotel-exemple.fr', 'objection');
    const again = await closeOutreachThreadsForDomain(connection, 'hotel-exemple.fr', 'objection');
    expect(again.closed).toBe(0);
  });

  it('closes a thread that already advanced past open', async () => {
    if (!connection) return;
    const { thread } = await openOutreachThread(connection, input({ domain: 'a-hotel.fr' }));
    await transitionOutreachThread(connection, {
      threadId: thread.threadId,
      from: ['open'],
      to: 'e1-drafted',
      at: OPENED_AT,
    });
    await transitionOutreachThread(connection, {
      threadId: thread.threadId,
      from: ['e1-drafted'],
      to: 'e1-sent',
      at: OPENED_AT,
    });

    const result = await closeOutreachThreadsForDomain(connection, 'a-hotel.fr', 'objection');
    expect(result.closed).toBe(1);
  });

  it('never closes a thread that already reached a terminal state', async () => {
    if (!connection) return;
    const { thread } = await openOutreachThread(connection, input({ domain: 'a-hotel.fr' }));
    await transitionOutreachThread(connection, {
      threadId: thread.threadId,
      from: ['open'],
      to: 'e1-drafted',
      at: OPENED_AT,
    });
    await transitionOutreachThread(connection, {
      threadId: thread.threadId,
      from: ['e1-drafted'],
      to: 'e1-sent',
      at: OPENED_AT,
    });
    await transitionOutreachThread(connection, {
      threadId: thread.threadId,
      from: ['e1-sent'],
      to: 'replied',
      at: OPENED_AT,
    });

    const result = await closeOutreachThreadsForDomain(connection, 'a-hotel.fr', 'objection');
    expect(result.closed).toBe(0);
    const stored = await findOutreachThreadById(connection, thread.threadId);
    expect(stored?.state).toBe('replied');
  });

  describe('transitionOutreachThread', () => {
    it('applies a legal transition and preserves the reason', async () => {
      if (!connection) return;
      const { thread } = await openOutreachThread(connection, input());

      const result = await transitionOutreachThread(connection, {
        threadId: thread.threadId,
        from: ['open'],
        to: 'e1-drafted',
        at: new Date('2026-08-30T10:00:00.000Z'),
        reason: 'draft created',
      });

      expect(result.changed).toBe(true);
      expect(result.thread?.state).toBe('e1-drafted');
      expect(result.thread?.stateReason).toBe('draft created');
    });

    it('refuses a transition the state machine does not allow', async () => {
      if (!connection) return;
      const { thread } = await openOutreachThread(connection, input());

      const result = await transitionOutreachThread(connection, {
        threadId: thread.threadId,
        from: ['open'],
        to: 'e1-sent',
        at: OPENED_AT,
      });

      expect(result.changed).toBe(false);
      const stored = await findOutreachThreadById(connection, thread.threadId);
      expect(stored?.state).toBe('open');
    });

    it('loses a race cleanly rather than double-applying', async () => {
      if (!connection) return;
      const { thread } = await openOutreachThread(connection, input());
      await transitionOutreachThread(connection, {
        threadId: thread.threadId,
        from: ['open'],
        to: 'e1-drafted',
        at: OPENED_AT,
      });

      // A retry that thinks the thread is still `open` loses cleanly.
      const retry = await transitionOutreachThread(connection, {
        threadId: thread.threadId,
        from: ['open'],
        to: 'e1-drafted',
        at: OPENED_AT,
      });
      expect(retry.changed).toBe(false);
      expect(retry.thread?.state).toBe('e1-drafted');
    });

    it('preserves earlier timestamps on an idempotent re-sync', async () => {
      if (!connection) return;
      const { thread } = await openOutreachThread(connection, input());
      const firstAt = new Date('2026-08-30T10:00:00.000Z');
      await transitionOutreachThread(connection, {
        threadId: thread.threadId,
        from: ['open'],
        to: 'e1-drafted',
        at: firstAt,
      });

      // A second sync attempting the same move from the same prior state is
      // rejected rather than resetting stateEnteredAt to a later time.
      const secondAt = new Date('2026-08-30T12:00:00.000Z');
      await transitionOutreachThread(connection, {
        threadId: thread.threadId,
        from: ['open'],
        to: 'e1-drafted',
        at: secondAt,
      });

      const stored = await findOutreachThreadById(connection, thread.threadId);
      expect(stored?.stateEnteredAt.toISOString()).toBe(firstAt.toISOString());
    });

    it('prevents any further transition once a terminal state is reached', async () => {
      if (!connection) return;
      const { thread } = await openOutreachThread(connection, input());
      await transitionOutreachThread(connection, {
        threadId: thread.threadId,
        from: ['open'],
        to: 'opted-out',
        at: OPENED_AT,
        reason: 'objection',
      });

      const result = await transitionOutreachThread(connection, {
        threadId: thread.threadId,
        from: ['opted-out'],
        to: 'e1-drafted',
        at: OPENED_AT,
      });
      expect(result.changed).toBe(false);
      const stored = await findOutreachThreadById(connection, thread.threadId);
      expect(stored?.state).toBe('opted-out');
    });
  });

  describe('recordOutreachThreadTouchSent', () => {
    it('records a touch once and refuses a duplicate', async () => {
      if (!connection) return;
      const { thread } = await openOutreachThread(connection, input());
      const sentAt = new Date('2026-08-30T11:00:00.000Z');

      await expect(
        recordOutreachThreadTouchSent(connection, thread.threadId, {
          touch: 1,
          providerMessageId: 'message-1',
          sentAt,
          detectedAt: sentAt,
        }),
      ).resolves.toBe(true);
      await expect(
        recordOutreachThreadTouchSent(connection, thread.threadId, {
          touch: 1,
          providerMessageId: 'message-1-again',
          sentAt,
          detectedAt: sentAt,
        }),
      ).resolves.toBe(false);

      const stored = await findOutreachThreadById(connection, thread.threadId);
      expect(stored?.touches).toHaveLength(1);
      expect(stored?.touches[0]?.providerMessageId).toBe('message-1');
    });
  });

  describe('markOutreachThreadSynced and setOutreachThreadOutcome', () => {
    it('records a review flag and later clears it', async () => {
      if (!connection) return;
      const { thread } = await openOutreachThread(connection, input());
      const detectedAt = new Date('2026-08-30T11:00:00.000Z');

      await markOutreachThreadSynced(connection, thread.threadId, detectedAt, {
        reason: 'ambiguous-disappearance',
        detectedAt,
      });
      const flagged = await findOutreachThreadById(connection, thread.threadId);
      expect(flagged?.needsReview?.reason).toBe('ambiguous-disappearance');

      await markOutreachThreadSynced(connection, thread.threadId, new Date());
      const cleared = await findOutreachThreadById(connection, thread.threadId);
      expect(cleared?.needsReview).toBeUndefined();
    });

    it('sets an operator outcome event pointer without touching state', async () => {
      if (!connection) return;
      const { thread } = await openOutreachThread(connection, input());
      await setOutreachThreadOutcome(connection, thread.threadId, 'outcome-event-1');

      const stored = await findOutreachThreadById(connection, thread.threadId);
      expect(stored?.currentOutcome).toBe('outcome-event-1');
      expect(stored?.state).toBe('open');
    });
  });

  describe('listThreadsDueForFollowUp', () => {
    async function seedSentThread(
      candidateId: string,
      touch: 1 | 2,
      sentAt: Date,
    ): Promise<string> {
      if (!connection) throw new Error('no connection');
      const { thread } = await openOutreachThread(connection, input({ candidateId }));
      await recordOutreachThreadTouchSent(connection, thread.threadId, {
        touch,
        providerMessageId: `message-${candidateId}`,
        sentAt,
        detectedAt: sentAt,
      });
      type Step = 'open' | 'e1-drafted' | 'e1-sent' | 'e2-drafted' | 'e2-sent';
      const path: readonly Step[] =
        touch === 1
          ? ['e1-drafted', 'e1-sent']
          : ['e1-drafted', 'e1-sent', 'e2-drafted', 'e2-sent'];
      let from: Step = 'open';
      for (const to of path) {
        await transitionOutreachThread(connection, {
          threadId: thread.threadId,
          from: [from],
          to,
          at: sentAt,
        });
        from = to;
      }
      return thread.threadId;
    }

    it('excludes a thread before its due date and includes it once due', async () => {
      if (!connection) return;
      const sentAt = new Date('2026-08-30T09:00:00.000Z');
      await seedSentThread('due-1', 1, sentAt);

      const beforeDue = await listThreadsDueForFollowUp(connection, {
        now: new Date(sentAt.getTime() + 3 * DAY_MS),
      });
      expect(beforeDue).toHaveLength(0);

      const atDue = await listThreadsDueForFollowUp(connection, {
        now: new Date(sentAt.getTime() + 4 * DAY_MS),
      });
      expect(atDue).toHaveLength(1);
    });

    it('excludes a thread flagged for review', async () => {
      if (!connection) return;
      const sentAt = new Date('2026-08-30T09:00:00.000Z');
      const threadId = await seedSentThread('due-review', 1, sentAt);
      await markOutreachThreadSynced(connection, threadId, sentAt, {
        reason: 'ambiguous-disappearance',
        detectedAt: sentAt,
      });

      const due = await listThreadsDueForFollowUp(connection, {
        now: new Date(sentAt.getTime() + 30 * DAY_MS),
      });
      expect(due).toHaveLength(0);
    });

    it('respects the limit', async () => {
      if (!connection) return;
      const sentAt = new Date('2026-08-30T09:00:00.000Z');
      await seedSentThread('due-a', 1, sentAt);
      await seedSentThread('due-b', 1, sentAt);

      const due = await listThreadsDueForFollowUp(connection, {
        now: new Date(sentAt.getTime() + 30 * DAY_MS),
        limit: 1,
      });
      expect(due).toHaveLength(1);
    });
  });

  describe('completeOutreachSequence', () => {
    it('suppresses first and completes a due e3 thread idempotently', async () => {
      if (!connection) return;
      const sentAt = new Date('2026-08-01T09:00:00.000Z');
      const { thread } = await openOutreachThread(
        connection,
        input({ candidateId: 'completed-sequence', domain: 'hotel-complete.fr' }),
      );
      type Step =
        'open' | 'e1-drafted' | 'e1-sent' | 'e2-drafted' | 'e2-sent' | 'e3-drafted' | 'e3-sent';
      const path: readonly Step[] = [
        'e1-drafted',
        'e1-sent',
        'e2-drafted',
        'e2-sent',
        'e3-drafted',
        'e3-sent',
      ];
      let from: Step = 'open';
      for (const to of path) {
        await transitionOutreachThread(connection, {
          threadId: thread.threadId,
          from: [from],
          to,
          at: sentAt,
        });
        from = to;
      }
      await recordOutreachThreadTouchSent(connection, thread.threadId, {
        touch: 3,
        providerMessageId: 'message-3',
        sentAt,
        detectedAt: sentAt,
      });

      const atDue = new Date(sentAt.getTime() + 14 * DAY_MS);
      await expect(
        completeOutreachSequence(connection, {
          threadId: thread.threadId,
          at: new Date(atDue.getTime() - 1),
        }),
      ).resolves.toEqual({ changed: false });
      await expect(isSuppressed(connection, 'hotel-complete.fr')).resolves.toBe(false);
      await expect(
        completeOutreachSequence(connection, { threadId: thread.threadId, at: atDue }),
      ).resolves.toEqual({ changed: true });
      await expect(isSuppressed(connection, 'hotel-complete.fr')).resolves.toBe(true);
      expect((await findOutreachThreadById(connection, thread.threadId))?.state).toBe(
        'sequence-complete',
      );
      await expect(
        completeOutreachSequence(connection, { threadId: thread.threadId, at: atDue }),
      ).resolves.toEqual({ changed: false });
      expect(await createSuppressionModel(connection).countDocuments({})).toBe(1);
    });
  });

  describe('listThreadsToSync', () => {
    it('excludes a thread with no providerThreadId attached yet', async () => {
      if (!connection) return;
      await openOutreachThread(connection, input({ candidateId: 'never-drafted' }));

      const toSync = await listThreadsToSync(connection);
      expect(toSync).toHaveLength(0);
    });

    it('includes a drafted thread once it carries a providerThreadId', async () => {
      if (!connection) return;
      const { thread } = await openOutreachThread(connection, input({ candidateId: 'drafted' }));
      await attachProviderThreadId(connection, thread.threadId, 'provider-thread-1');
      await transitionOutreachThread(connection, {
        threadId: thread.threadId,
        from: ['open'],
        to: 'e1-drafted',
        at: OPENED_AT,
      });

      const toSync = await listThreadsToSync(connection);
      expect(toSync.map((row) => row.threadId)).toEqual([thread.threadId]);
    });

    it('excludes a thread in a terminal state', async () => {
      if (!connection) return;
      const { thread } = await openOutreachThread(connection, input({ candidateId: 'terminal' }));
      await attachProviderThreadId(connection, thread.threadId, 'provider-thread-2');
      await transitionOutreachThread(connection, {
        threadId: thread.threadId,
        from: ['open'],
        to: 'opted-out',
        at: OPENED_AT,
      });

      const toSync = await listThreadsToSync(connection);
      expect(toSync).toHaveLength(0);
    });

    it('filters to a single thread when threadId is given', async () => {
      if (!connection) return;
      const first = await openOutreachThread(connection, input({ candidateId: 'first' }));
      const second = await openOutreachThread(connection, input({ candidateId: 'second' }));
      for (const { thread } of [first, second]) {
        await attachProviderThreadId(connection, thread.threadId, `provider-${thread.threadId}`);
        await transitionOutreachThread(connection, {
          threadId: thread.threadId,
          from: ['open'],
          to: 'e1-drafted',
          at: OPENED_AT,
        });
      }

      const toSync = await listThreadsToSync(connection, { threadId: first.thread.threadId });
      expect(toSync.map((row) => row.threadId)).toEqual([first.thread.threadId]);
    });

    it('respects the limit', async () => {
      if (!connection) return;
      for (const candidateId of ['a', 'b', 'c']) {
        const { thread } = await openOutreachThread(connection, input({ candidateId }));
        await attachProviderThreadId(connection, thread.threadId, `provider-${candidateId}`);
        await transitionOutreachThread(connection, {
          threadId: thread.threadId,
          from: ['open'],
          to: 'e1-drafted',
          at: OPENED_AT,
        });
      }

      const toSync = await listThreadsToSync(connection, { limit: 2 });
      expect(toSync).toHaveLength(2);
    });
  });
});
