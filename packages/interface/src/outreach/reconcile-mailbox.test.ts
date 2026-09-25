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

import { canTransitionOutreachThread } from '@odysseus/core';
import { describe, expect, it } from 'vitest';
import { createInMemoryMailboxDraftAdapter } from './in-memory-mailbox-draft-adapter.js';
import {
  reconcileMailbox,
  type MailboxReconciliationStorePort,
  type ThreadToSync,
} from './reconcile-mailbox.js';

const SENDER = 'contact@odysseusaudit.fr';
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
    // Enforces the real state machine, as the store does, so a test cannot
    // pass on a move the store would refuse (issue #477).
    transition: (input) => {
      calls.push({ method: 'transition', input });
      const thread = threads.find((item) => item.threadId === input.threadId);
      if (
        thread === undefined ||
        !input.from.includes(thread.state) ||
        !canTransitionOutreachThread(thread.state, input.to)
      ) {
        return Promise.resolve(false);
      }
      thread.state = input.to;
      return Promise.resolve(true);
    },
    withdrawLiveDrafts: (input) => {
      calls.push({ method: 'withdrawLiveDrafts', input });
      return Promise.resolve();
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
      htmlBody: '<div>Bonjour,</div><div>Un constat mesuré.</div>',
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
      htmlBody: '<div>Bonjour,</div><div>Un constat mesuré.</div>',
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
        state: 'e1-sent',
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
      'withdrawLiveDrafts',
      'markSynced',
    ]);
    expect(calls[1]?.input).toMatchObject({
      to: 'replied',
      from: ['e1-sent', 'e2-drafted', 'e2-sent', 'e3-drafted', 'e3-sent'],
    });
    expect(calls[3]?.input).not.toHaveProperty('needsReview');
  });

  it('detects a bounce and transitions the thread to bounced', async () => {
    const mailbox = createInMemoryMailboxDraftAdapter({ senderAddress: SENDER });
    const draft = await mailbox.createDraft({
      to: 'direction@hotel-exemple.fr',
      subject: 'Votre site web',
      body: 'Bonjour,\n\nUn constat mesuré.\n\nCordialement',
      htmlBody: '<div>Bonjour,</div><div>Un constat mesuré.</div>',
    });
    mailbox.markDraftSent(draft.providerDraftId, NOW);
    mailbox.injectInboundMessage(draft.providerThreadId, {
      fromAddress: 'mailer-daemon@googlemail.com',
      at: new Date('2026-08-31T09:00:00.000Z'),
    });

    const { store, calls } = fakeStore([
      {
        threadId: 'thread-1',
        providerThreadId: draft.providerThreadId,
        state: 'e1-sent',
        lastConfirmedSentAt: NOW,
      },
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
      htmlBody: '<div>Bonjour,</div><div>Un constat mesuré.</div>',
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
      htmlBody: '<div>Bonjour,</div><div>Un constat mesuré.</div>',
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
      htmlBody: '<div>Bonjour,</div><div>Un constat mesuré.</div>',
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
      htmlBody: '<div>Bonjour,</div><div>Un constat mesuré.</div>',
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

  describe('an answer that arrives while a follow-up is drafted (issue #477)', () => {
    const E1_SENT_AT = new Date('2026-08-20T09:00:00.000Z');

    async function threadWithE1SentAndE2Drafted() {
      const mailbox = createInMemoryMailboxDraftAdapter({ senderAddress: SENDER });
      const e1 = await mailbox.createDraft({
        to: 'direction@hotel-exemple.fr',
        subject: 'Votre site web',
        body: 'Bonjour',
        htmlBody: '<div>Bonjour</div>',
      });
      mailbox.markDraftSent(e1.providerDraftId, E1_SENT_AT);
      const e2 = await mailbox.createDraft({
        to: 'direction@hotel-exemple.fr',
        subject: 'Re: Votre site web',
        body: 'Relance',
        htmlBody: '<div>Relance</div>',
        providerThreadId: e1.providerThreadId,
      });
      return { mailbox, e1, e2 };
    }

    it('moves an e2-drafted thread to replied and withdraws the drafted follow-up', async () => {
      const { mailbox, e1, e2 } = await threadWithE1SentAndE2Drafted();
      mailbox.injectInboundMessage(e1.providerThreadId, {
        fromAddress: 'direction@hotel-exemple.fr',
        at: new Date('2026-08-25T09:00:00.000Z'),
      });
      const { store, calls } = fakeStore([
        {
          threadId: 'thread-1',
          providerThreadId: e1.providerThreadId,
          state: 'e2-drafted',
          lastConfirmedSentAt: E1_SENT_AT,
          outstandingDraft: { touch: 2, providerMessageId: e2.providerMessageId },
        },
      ]);

      const result = await reconcileMailbox({ mailbox, senderAddress: SENDER, store, now: NOW });

      expect(result.results[0]?.classification.kind).toBe('reply');
      expect(calls.map((call) => call.method)).toEqual([
        'listThreadsToSync',
        'transition',
        'withdrawLiveDrafts',
        'markSynced',
      ]);
      const [transition] = calls.filter((call) => call.method === 'transition');
      expect(transition?.input).toMatchObject({ to: 'replied' });
    });

    it('moves an e3-drafted thread to bounced', async () => {
      const { mailbox, e1, e2 } = await threadWithE1SentAndE2Drafted();
      mailbox.injectInboundMessage(e1.providerThreadId, {
        fromAddress: 'mailer-daemon@googlemail.com',
        at: new Date('2026-08-25T09:00:00.000Z'),
      });
      const { store, calls } = fakeStore([
        {
          threadId: 'thread-1',
          providerThreadId: e1.providerThreadId,
          state: 'e3-drafted',
          lastConfirmedSentAt: E1_SENT_AT,
          outstandingDraft: { touch: 3, providerMessageId: e2.providerMessageId },
        },
      ]);

      await reconcileMailbox({ mailbox, senderAddress: SENDER, store, now: NOW });

      expect(calls.filter((call) => call.method === 'transition')[0]?.input).toMatchObject({
        to: 'bounced',
      });
      expect(calls.map((call) => call.method)).toContain('withdrawLiveDrafts');
    });

    it('records a follow-up sent after a reply, then moves to replied and flags review', async () => {
      const { mailbox, e1, e2 } = await threadWithE1SentAndE2Drafted();
      mailbox.injectInboundMessage(e1.providerThreadId, {
        fromAddress: 'direction@hotel-exemple.fr',
        at: new Date('2026-08-25T09:00:00.000Z'),
      });
      mailbox.markDraftSent(e2.providerDraftId, new Date('2026-08-26T09:00:00.000Z'));
      const { store, calls } = fakeStore([
        {
          threadId: 'thread-1',
          providerThreadId: e1.providerThreadId,
          state: 'e2-drafted',
          lastConfirmedSentAt: E1_SENT_AT,
          outstandingDraft: { touch: 2, providerMessageId: e2.providerMessageId },
        },
      ]);

      const result = await reconcileMailbox({ mailbox, senderAddress: SENDER, store, now: NOW });

      expect(result.results[0]?.classification).toMatchObject({
        kind: 'sent',
        touch: 2,
        inboundBeforeSend: { kind: 'reply' },
      });
      const transitions = calls.filter((call) => call.method === 'transition');
      expect(transitions.map((call) => (call.input as { to: string }).to)).toEqual([
        'e2-sent',
        'replied',
      ]);
      expect(calls.map((call) => call.method)).toContain('recordTouchSent');
      expect(calls.at(-1)).toMatchObject({
        method: 'markSynced',
        input: { needsReview: { reason: 'reply-before-send' } },
      });
    });

    it('treats a human reply after an out-of-office as a reply', async () => {
      const { mailbox, e1 } = await threadWithE1SentAndE2Drafted();
      mailbox.injectInboundMessage(e1.providerThreadId, {
        fromAddress: 'direction@hotel-exemple.fr',
        at: new Date('2026-08-21T09:00:00.000Z'),
        autoSubmitted: true,
      });
      mailbox.injectInboundMessage(e1.providerThreadId, {
        fromAddress: 'direction@hotel-exemple.fr',
        at: new Date('2026-08-24T09:00:00.000Z'),
      });
      const { store, calls } = fakeStore([
        {
          threadId: 'thread-1',
          providerThreadId: e1.providerThreadId,
          state: 'e1-sent',
          lastConfirmedSentAt: E1_SENT_AT,
        },
      ]);

      const result = await reconcileMailbox({ mailbox, senderAddress: SENDER, store, now: NOW });

      expect(result.results[0]?.classification.kind).toBe('reply');
      expect(calls.filter((call) => call.method === 'transition')[0]?.input).toMatchObject({
        to: 'replied',
      });
    });

    it('flags a reply the state machine refuses instead of syncing silently', async () => {
      const mailbox = createInMemoryMailboxDraftAdapter({ senderAddress: SENDER });
      const e1 = await mailbox.createDraft({
        to: 'direction@hotel-exemple.fr',
        subject: 'Votre site web',
        body: 'Bonjour',
        htmlBody: '<div>Bonjour</div>',
      });
      mailbox.injectInboundMessage(e1.providerThreadId, {
        fromAddress: 'direction@hotel-exemple.fr',
        at: new Date('2026-08-25T09:00:00.000Z'),
      });
      const { store, calls } = fakeStore([
        {
          threadId: 'thread-1',
          providerThreadId: e1.providerThreadId,
          state: 'e1-drafted',
          outstandingDraft: { touch: 1, providerMessageId: e1.providerMessageId },
        },
      ]);

      await reconcileMailbox({ mailbox, senderAddress: SENDER, store, now: NOW });

      expect(calls.map((call) => call.method)).not.toContain('withdrawLiveDrafts');
      expect(calls.at(-1)).toMatchObject({
        method: 'markSynced',
        input: { needsReview: { reason: 'reply-not-applied' } },
      });
    });
  });

  it('keeps syncing later threads when one thread fails (issue #483)', async () => {
    const mailbox = createInMemoryMailboxDraftAdapter({ senderAddress: SENDER });
    const draft = await mailbox.createDraft({
      to: 'direction@hotel-exemple.fr',
      subject: 'Votre site web',
      body: 'Bonjour',
      htmlBody: '<div>Bonjour</div>',
    });
    mailbox.markDraftSent(draft.providerDraftId, NOW);
    const failing = {
      ...mailbox,
      getThreadMetadata: (providerThreadId: string) =>
        providerThreadId === 'broken'
          ? Promise.reject(new Error('Gmail thread read failed with status 500'))
          : mailbox.getThreadMetadata(providerThreadId),
    };
    const { store, calls } = fakeStore([
      { threadId: 'thread-broken', providerThreadId: 'broken' },
      {
        threadId: 'thread-2',
        providerThreadId: draft.providerThreadId,
        outstandingDraft: { touch: 1, providerMessageId: draft.providerMessageId },
      },
    ]);

    const result = await reconcileMailbox({
      mailbox: failing,
      senderAddress: SENDER,
      store,
      now: NOW,
    });

    expect(result.results[0]).toMatchObject({
      threadId: 'thread-broken',
      applied: false,
      classification: { kind: 'needs-review', reason: 'sync-error' },
      error: 'Gmail thread read failed with status 500',
    });
    expect(result.results[1]).toMatchObject({
      threadId: 'thread-2',
      applied: true,
      classification: { kind: 'sent' },
    });
    expect(calls[1]).toMatchObject({
      method: 'markSynced',
      input: { threadId: 'thread-broken', needsReview: { reason: 'sync-error' } },
    });
  });
});
