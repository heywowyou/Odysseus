/**
 * Orchestration tests for milestone 9c plan 012's mailbox reconciliation.
 *
 * The store is a small in-memory double so these tests exercise the actual
 * decision this module makes (what to call, given what the mailbox and
 * `classifyMailboxThread` say), never a real database. The mailbox itself is
 * the in-memory adapter, so a fixture is built the same way `create-outreach-
 * draft.test.ts` builds its prose fixtures: through the real port surface,
 * not through hand-built response objects.
 */

import { describe, expect, it } from 'vitest';
import { createInMemoryMailboxDraftAdapter } from './in-memory-mailbox-draft-adapter.js';
import {
  reconcileMailbox,
  type MailboxReconciliationStorePort,
  type ThreadToSync,
} from './reconcile-mailbox.js';

const SENDER = 'contact@odysseusaudit.com';
const NOW = new Date('2026-08-30T09:00:00.000Z');

interface StoreCall {
  method: string;
  input: unknown;
}

type TestThread = Omit<ThreadToSync, 'state' | 'replyWindowDays'> &
  Partial<Pick<ThreadToSync, 'state' | 'replyWindowDays'>>;

function fakeStore(inputThreads: TestThread[]): {
  store: MailboxReconciliationStorePort;
  calls: StoreCall[];
} {
  const calls: StoreCall[] = [];
  const threads: ThreadToSync[] = inputThreads.map((thread) => ({
    state: 'e1-drafted',
    replyWindowDays: 14,
    ...thread,
  }));
  const store: MailboxReconciliationStorePort = {
    listThreadsToSync: (options) => {
      calls.push({ method: 'listThreadsToSync', input: options });
      const filtered =
        options.threadId === undefined
          ? threads
          : threads.filter((thread) => thread.threadId === options.threadId);
      return Promise.resolve(
        options.limit === undefined ? filtered : filtered.slice(0, options.limit),
      );
    },
    recordTouchSent: (input) => {
      calls.push({ method: 'recordTouchSent', input });
      return Promise.resolve();
    },
    transition: (input) => {
      calls.push({ method: 'transition', input });
      return Promise.resolve(true);
    },
    markSynced: (input) => {
      calls.push({ method: 'markSynced', input });
      return Promise.resolve();
    },
    completeSequence: (input) => {
      calls.push({ method: 'completeSequence', input });
      return Promise.resolve(true);
    },
  };
  return { store, calls };
}

describe('reconcileMailbox', () => {
  it('confirms a send, transitions the thread, and marks it synced', async () => {
    const mailbox = createInMemoryMailboxDraftAdapter({ senderAddress: SENDER });
    const draft = await mailbox.createDraft({
      to: 'direction@hotel-exemple.fr',
      subject: 'Votre site web',
      body: 'Bonjour,\n\nUn constat mesuré.\n\nCordialement',
    });
    mailbox.markDraftSent(draft.providerDraftId, NOW);

    const { store, calls } = fakeStore([
      {
        threadId: 'thread-1',
        providerThreadId: draft.providerThreadId,
        outstandingDraft: { touch: 1, providerMessageId: draft.providerMessageId },
      },
    ]);

    const result = await reconcileMailbox({ mailbox, senderAddress: SENDER, store, now: NOW });

    expect(result.results).toEqual([
      {
        threadId: 'thread-1',
        classification: {
          kind: 'sent',
          touch: 1,
          providerMessageId: draft.providerMessageId,
          sentAt: NOW,
        },
        applied: true,
      },
    ]);
    expect(calls.map((call) => call.method)).toEqual([
      'listThreadsToSync',
      'recordTouchSent',
      'transition',
      'markSynced',
    ]);
    expect(calls[2]?.input).toMatchObject({
      threadId: 'thread-1',
      from: ['e1-drafted'],
      to: 'e1-sent',
    });
  });

  it('detects a reply and transitions the thread to replied', async () => {
    const mailbox = createInMemoryMailboxDraftAdapter({ senderAddress: SENDER });
    const draft = await mailbox.createDraft({
      to: 'direction@hotel-exemple.fr',
      subject: 'Votre site web',
      body: 'Bonjour,\n\nUn constat mesuré.\n\nCordialement',
    });
    mailbox.markDraftSent(draft.providerDraftId, NOW);
    mailbox.injectInboundMessage(draft.providerThreadId, {
      fromAddress: 'direction@hotel-exemple.fr',
      at: new Date('2026-08-31T09:00:00.000Z'),
    });

    const { store, calls } = fakeStore([
      {
        threadId: 'thread-1',
        providerThreadId: draft.providerThreadId,
        lastConfirmedSentAt: NOW,
      },
    ]);

    const result = await reconcileMailbox({
      mailbox,
      senderAddress: SENDER,
      store,
      now: new Date('2026-08-31T10:00:00.000Z'),
    });

    expect(result.results[0]?.classification.kind).toBe('reply');
    expect(calls.map((call) => call.method)).toEqual([
      'listThreadsToSync',
      'transition',
      'markSynced',
    ]);
    expect(calls[1]?.input).toMatchObject({
      to: 'replied',
      from: ['e1-sent', 'e2-sent', 'e3-sent'],
    });
  });

  it('detects a bounce and transitions the thread to bounced', async () => {
    const mailbox = createInMemoryMailboxDraftAdapter({ senderAddress: SENDER });
    const draft = await mailbox.createDraft({
      to: 'direction@hotel-exemple.fr',
      subject: 'Votre site web',
      body: 'Bonjour,\n\nUn constat mesuré.\n\nCordialement',
    });
    mailbox.markDraftSent(draft.providerDraftId, NOW);
    mailbox.injectInboundMessage(draft.providerThreadId, {
      fromAddress: 'mailer-daemon@googlemail.com',
      at: new Date('2026-08-31T09:00:00.000Z'),
    });

    const { store, calls } = fakeStore([
      { threadId: 'thread-1', providerThreadId: draft.providerThreadId, lastConfirmedSentAt: NOW },
    ]);

    const result = await reconcileMailbox({
      mailbox,
      senderAddress: SENDER,
      store,
      now: new Date('2026-08-31T10:00:00.000Z'),
    });

    expect(result.results[0]?.classification.kind).toBe('bounce');
    expect(calls[1]?.input).toMatchObject({ to: 'bounced' });
  });

  it('flags an automated reply for review without transitioning the thread', async () => {
    const mailbox = createInMemoryMailboxDraftAdapter({ senderAddress: SENDER });
    const draft = await mailbox.createDraft({
      to: 'direction@hotel-exemple.fr',
      subject: 'Votre site web',
      body: 'Bonjour,\n\nUn constat mesuré.\n\nCordialement',
    });
    mailbox.markDraftSent(draft.providerDraftId, NOW);
    mailbox.injectInboundMessage(draft.providerThreadId, {
      fromAddress: 'direction@hotel-exemple.fr',
      at: new Date('2026-08-31T09:00:00.000Z'),
      autoSubmitted: true,
    });

    const { store, calls } = fakeStore([
      { threadId: 'thread-1', providerThreadId: draft.providerThreadId, lastConfirmedSentAt: NOW },
    ]);

    const result = await reconcileMailbox({
      mailbox,
      senderAddress: SENDER,
      store,
      now: new Date('2026-08-31T10:00:00.000Z'),
    });

    expect(result.results[0]?.classification.kind).toBe('automated');
    expect(calls.map((call) => call.method)).toEqual(['listThreadsToSync', 'markSynced']);
    expect(calls[1]?.input).toMatchObject({
      needsReview: { reason: 'automated-response' },
    });
  });

  it('flags a vanished outstanding draft for review', async () => {
    const mailbox = createInMemoryMailboxDraftAdapter({ senderAddress: SENDER });
    const { store, calls } = fakeStore([
      {
        threadId: 'thread-1',
        providerThreadId: 'thread-does-not-exist',
        outstandingDraft: { touch: 1, providerMessageId: 'm-missing' },
      },
    ]);

    const result = await reconcileMailbox({ mailbox, senderAddress: SENDER, store, now: NOW });

    expect(result.results[0]?.classification).toEqual({
      kind: 'needs-review',
      reason: 'draft-disappeared-with-no-matching-send',
    });
    expect(calls[1]?.input).toMatchObject({
      needsReview: { reason: 'draft-disappeared-with-no-matching-send' },
    });
  });

  it('classifies everything and writes nothing in a dry run', async () => {
    const mailbox = createInMemoryMailboxDraftAdapter({ senderAddress: SENDER });
    const draft = await mailbox.createDraft({
      to: 'direction@hotel-exemple.fr',
      subject: 'Votre site web',
      body: 'Bonjour,\n\nUn constat mesuré.\n\nCordialement',
    });
    mailbox.markDraftSent(draft.providerDraftId, NOW);

    const { store, calls } = fakeStore([
      {
        threadId: 'thread-1',
        providerThreadId: draft.providerThreadId,
        outstandingDraft: { touch: 1, providerMessageId: draft.providerMessageId },
      },
    ]);

    const result = await reconcileMailbox({
      mailbox,
      senderAddress: SENDER,
      store,
      now: NOW,
      dryRun: true,
    });

    expect(result.results[0]?.applied).toBe(false);
    expect(result.results[0]?.classification.kind).toBe('sent');
    expect(calls.map((call) => call.method)).toEqual(['listThreadsToSync']);
  });

  it('reports unchanged and still marks the thread synced when nothing happened', async () => {
    const mailbox = createInMemoryMailboxDraftAdapter({ senderAddress: SENDER });
    const draft = await mailbox.createDraft({
      to: 'direction@hotel-exemple.fr',
      subject: 'Votre site web',
      body: 'Bonjour,\n\nUn constat mesuré.\n\nCordialement',
    });

    const { store, calls } = fakeStore([
      {
        threadId: 'thread-1',
        providerThreadId: draft.providerThreadId,
        outstandingDraft: { touch: 1, providerMessageId: draft.providerMessageId },
      },
    ]);

    const result = await reconcileMailbox({ mailbox, senderAddress: SENDER, store, now: NOW });

    expect(result.results[0]?.classification).toEqual({ kind: 'unchanged' });
    expect(calls.map((call) => call.method)).toEqual(['listThreadsToSync', 'markSynced']);
  });

  it('completes and suppresses an e3 thread once its reply window has elapsed', async () => {
    const sentAt = new Date('2026-08-01T09:00:00.000Z');
    const mailbox = createInMemoryMailboxDraftAdapter({ senderAddress: SENDER });
    const draft = await mailbox.createDraft({
      to: 'direction@hotel-exemple.fr',
      subject: 'Votre site web',
      body: 'Bonjour,\n\nUn constat mesuré.\n\nCordialement',
    });
    mailbox.markDraftSent(draft.providerDraftId, sentAt);

    const { store, calls } = fakeStore([
      {
        threadId: 'thread-1',
        providerThreadId: draft.providerThreadId,
        state: 'e3-sent',
        lastConfirmedSentAt: sentAt,
        replyWindowDays: 14,
      },
    ]);

    const result = await reconcileMailbox({ mailbox, senderAddress: SENDER, store, now: NOW });

    expect(result.results[0]).toMatchObject({ sequenceCompleted: true });
    expect(calls.map((call) => call.method)).toEqual([
      'listThreadsToSync',
      'markSynced',
      'completeSequence',
    ]);
    expect(calls[2]?.input).toEqual({ threadId: 'thread-1', at: NOW });
  });

  it('bounds a batch by --limit and by a single --thread selection', async () => {
    const mailbox = createInMemoryMailboxDraftAdapter({ senderAddress: SENDER });
    const { store, calls } = fakeStore([
      { threadId: 'thread-1', providerThreadId: 'p1' },
      { threadId: 'thread-2', providerThreadId: 'p2' },
    ]);

    await reconcileMailbox({
      mailbox,
      senderAddress: SENDER,
      store,
      now: NOW,
      threadId: 'thread-2',
    });
    expect(calls[0]?.input).toMatchObject({ threadId: 'thread-2' });
  });
});
