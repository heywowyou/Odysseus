import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  advanceThreadTouch,
  attachProviderThreadId,
  closeOutreachThreadsForDomain,
  findOutreachThreadByCandidate,
  findOutreachThreadById,
  listOutreachThreads,
  openOutreachThread,
  OUTREACH_THREAD_RETENTION_DAYS,
  type OpenOutreachThreadInput,
} from './outreach-threads.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const OPENED_AT = new Date('2026-08-30T09:00:00.000Z');

function input(overrides: Partial<OpenOutreachThreadInput> = {}): OpenOutreachThreadInput {
  return {
    candidateId: randomUUID(),
    prescanId: randomUUID(),
    previewId: randomUUID(),
    domain: 'hotel-exemple.fr',
    roleAddress: 'direction@hotel-exemple.fr',
    language: 'fr',
    openedAt: OPENED_AT,
    ...overrides,
  };
}

describe.skipIf(!mongoAvailable)('outreach threads', () => {
  beforeEach(async () => {
    if (connection) await createOutreachThreadModel(connection).deleteMany({});
  });

  it('opens a thread at touch zero with a 90 day retention', async () => {
    if (!connection) return;
    const { thread, created } = await openOutreachThread(connection, input());

    expect(created).toBe(true);
    expect(thread.status).toBe('open');
    expect(thread.currentTouch).toBe(0);
    expect(thread.providerThreadId).toBeUndefined();
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

  it('closes every open thread for a domain however the objection spells it', async () => {
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
    expect(await listOutreachThreads(connection, { status: 'open' })).toHaveLength(1);
    const closed = await findOutreachThreadByCandidate(connection, 'a');
    expect(closed?.status).toBe('closed');
    expect(closed?.closedReason).toBe('objection');
  });

  it('closing twice reports nothing further closed', async () => {
    if (!connection) return;
    await openOutreachThread(connection, input({ domain: 'hotel-exemple.fr' }));
    await closeOutreachThreadsForDomain(connection, 'hotel-exemple.fr', 'objection');
    const again = await closeOutreachThreadsForDomain(connection, 'hotel-exemple.fr', 'objection');
    expect(again.closed).toBe(0);
  });
});
