/**
 * Issue #477: the reconciliation store against real Mongo, driven through
 * `reconcileMailbox` with the in-memory mailbox, so the state machine the
 * store enforces is the one under test rather than a fake that accepts any
 * move. Docker-gated: skips cleanly when mongo-test is down.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { attachProviderThreadId } from '@odysseus/store/outreach-threads.js';
import {
  findOutreachThreadById,
  listOutreachDrafts,
  openOutreachThread,
  recordOutreachDraft,
  recordOutreachThreadTouchSent,
  transitionOutreachThread,
} from '@odysseus/store';
import { probeMongoAvailability, scopedMongoTestUri } from '@odysseus/store/test-support.js';
import { createInMemoryMailboxDraftAdapter } from './in-memory-mailbox-draft-adapter.js';
import { createMongoMailboxReconciliationStore } from './mongo-mailbox-reconciliation-store.js';
import { reconcileMailbox } from './reconcile-mailbox.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability(
  scopedMongoTestUri('mailbox_reconciliation_store'),
);

const SENDER = 'contact@odysseusaudit.fr';
const RECIPIENT = 'direction@hotel-exemple.fr';
const E1_SENT_AT = new Date('2026-09-20T09:00:00.000Z');
const E2_DRAFTED_AT = new Date('2026-09-24T09:00:00.000Z');
const NOW = new Date('2026-09-25T09:00:00.000Z');

afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
});

describe.skipIf(!mongoAvailable)('createMongoMailboxReconciliationStore', () => {
  beforeEach(async () => {
    await connection!.dropDatabase();
  });

  /** E1 sent, E2 drafted in the mailbox and recorded as the live draft. */
  async function seedThreadWithDraftedFollowUp() {
    const db = connection!;
    const mailbox = createInMemoryMailboxDraftAdapter({ senderAddress: SENDER });
    const e1 = await mailbox.createDraft({
      to: RECIPIENT,
      subject: 'Votre site web',
      body: 'Bonjour',
      htmlBody: '<div>Bonjour</div>',
    });
    mailbox.markDraftSent(e1.providerDraftId, E1_SENT_AT);

    const { thread } = await openOutreachThread(db, {
      prospectId: randomUUID(),
      previewId: 'preview-1',
      domain: 'hotel-exemple.fr',
      roleAddress: RECIPIENT,
      language: 'fr',
      openedAt: E1_SENT_AT,
      spacing: { touch2AfterDays: 4, touch3AfterDays: 7, replyWindowDays: 14 },
      campaignVersion: 'test-campaign',
    });
    await attachProviderThreadId(db, thread.threadId, e1.providerThreadId);
    for (const [from, to] of [
      ['open', 'e1-drafted'],
      ['e1-drafted', 'e1-sent'],
      ['e1-sent', 'e2-drafted'],
    ] as const) {
      await transitionOutreachThread(db, { threadId: thread.threadId, from: [from], to, at: NOW });
    }
    await recordOutreachThreadTouchSent(db, thread.threadId, {
      touch: 1,
      providerMessageId: e1.providerMessageId,
      sentAt: E1_SENT_AT,
      detectedAt: E1_SENT_AT,
    });

    const e2 = await mailbox.createDraft({
      to: RECIPIENT,
      subject: 'Re: Votre site web',
      body: 'Relance',
      htmlBody: '<div>Relance</div>',
      providerThreadId: e1.providerThreadId,
    });
    await recordOutreachDraft(db, {
      prospectId: thread.prospectId,
      threadId: thread.threadId,
      touch: 2,
      language: 'fr',
      roleAddress: RECIPIENT,
      subject: 'Re: Votre site web',
      body: 'Relance',
      htmlBody: '<div>Relance</div>',
      evidenceVersion: 'test',
      outreachPromptVersion: 'test',
      providerDraftId: e2.providerDraftId,
      providerMessageId: e2.providerMessageId,
      providerThreadId: e2.providerThreadId,
      createdAt: E2_DRAFTED_AT,
    });
    return { db, mailbox, thread, e1, e2 };
  }

  it('moves an e2-drafted thread to replied and withdraws the follow-up draft', async () => {
    const { db, mailbox, thread, e1, e2 } = await seedThreadWithDraftedFollowUp();
    mailbox.injectInboundMessage(e1.providerThreadId, {
      fromAddress: RECIPIENT,
      at: new Date('2026-09-24T12:00:00.000Z'),
    });

    await reconcileMailbox({
      mailbox,
      senderAddress: SENDER,
      store: createMongoMailboxReconciliationStore(db, mailbox),
      now: NOW,
    });

    expect((await findOutreachThreadById(db, thread.threadId))?.state).toBe('replied');
    expect(await listOutreachDrafts(db, { threadId: thread.threadId, status: 'created' })).toEqual(
      [],
    );
    expect(await mailbox.getDraft(e2.providerDraftId)).toBeNull();
  });

  it('records a follow-up sent after the reply, then moves to replied and flags review', async () => {
    const { db, mailbox, thread, e1, e2 } = await seedThreadWithDraftedFollowUp();
    mailbox.injectInboundMessage(e1.providerThreadId, {
      fromAddress: RECIPIENT,
      at: new Date('2026-09-24T12:00:00.000Z'),
    });
    mailbox.markDraftSent(e2.providerDraftId, new Date('2026-09-24T15:00:00.000Z'));

    await reconcileMailbox({
      mailbox,
      senderAddress: SENDER,
      store: createMongoMailboxReconciliationStore(db, mailbox),
      now: NOW,
    });

    const stored = await findOutreachThreadById(db, thread.threadId);
    expect(stored?.state).toBe('replied');
    expect(stored?.touches.map((touch) => touch.touch).sort()).toEqual([1, 2]);
    expect(stored?.needsReview?.reason).toBe('reply-before-send');
  });

  it('still refuses a reply on a thread whose first email was never sent', async () => {
    const db = connection!;
    const mailbox = createInMemoryMailboxDraftAdapter({ senderAddress: SENDER });
    const e1 = await mailbox.createDraft({
      to: RECIPIENT,
      subject: 'Votre site web',
      body: 'Bonjour',
      htmlBody: '<div>Bonjour</div>',
    });
    const { thread } = await openOutreachThread(db, {
      prospectId: randomUUID(),
      previewId: 'preview-1',
      domain: 'hotel-exemple.fr',
      roleAddress: RECIPIENT,
      language: 'fr',
      openedAt: NOW,
      spacing: { touch2AfterDays: 4, touch3AfterDays: 7, replyWindowDays: 14 },
      campaignVersion: 'test-campaign',
    });
    await attachProviderThreadId(db, thread.threadId, e1.providerThreadId);
    await transitionOutreachThread(db, {
      threadId: thread.threadId,
      from: ['open'],
      to: 'e1-drafted',
      at: NOW,
    });
    mailbox.injectInboundMessage(e1.providerThreadId, {
      fromAddress: RECIPIENT,
      at: new Date('2026-09-24T12:00:00.000Z'),
    });

    await reconcileMailbox({
      mailbox,
      senderAddress: SENDER,
      store: createMongoMailboxReconciliationStore(db, mailbox),
      now: NOW,
    });

    const stored = await findOutreachThreadById(db, thread.threadId);
    expect(stored?.state).toBe('e1-drafted');
    expect(stored?.needsReview?.reason).toBe('reply-not-applied');
  });
});
