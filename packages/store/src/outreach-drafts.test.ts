import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  acknowledgeUnverifiedProviderDrafts,
  confirmOutreachSentByOperator,
  findLiveOutreachDraft,
  findUnverifiedProviderDraft,
  recordFailedOutreachDraft,
  recordUnrecordedProviderDraft,
  markOutreachDraftDeleted,
  markOutreachDraftDeletionPending,
  recordOutreachDraft,
} from './outreach-drafts.js';
import {
  findOutreachThreadById,
  markOutreachThreadDrafted,
  openOutreachThread,
  transitionOutreachThread,
} from './outreach-threads.js';
import { createProspectHub } from './prospect-hub.js';
import { createOutreachDraftModel } from './schemas/outreach-draft.schema.js';
import { createProspectEventModel } from './schemas/prospect-event.schema.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('outreach_drafts'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

describe.skipIf(!available)('recordOutreachDraft', () => {
  it('keeps pending provider deletion live to guards until the provider confirms removal', async () => {
    const prospect = await createProspectHub(connection!, {
      sector: 'hotel',
      name: 'Pending Delete',
    });
    const draft = await recordOutreachDraft(connection!, {
      prospectId: prospect.prospectId,
      threadId: randomUUID(),
      touch: 1,
      language: 'fr',
      roleAddress: 'contact@pending-delete.fr',
      subject: 'Objet',
      body: 'Corps',
      htmlBody: '<p>Corps</p>',
      evidenceVersion: 'v1',
      outreachPromptVersion: 'v1',
      providerDraftId: 'g-pending',
      providerMessageId: 'm-pending',
      providerThreadId: 't-pending',
      createdAt: new Date(),
    });

    await expect(
      markOutreachDraftDeletionPending(connection!, draft.draftId, 'skipped'),
    ).resolves.toEqual({
      changed: true,
    });
    expect((await findLiveOutreachDraft(connection!, draft.threadId, 1))?.status).toBe(
      'mailbox-delete-pending',
    );
    await expect(markOutreachDraftDeleted(connection!, draft.draftId)).resolves.toEqual({
      changed: true,
    });
    expect(await findLiveOutreachDraft(connection!, draft.threadId, 1)).toBeNull();
  });

  it('retires the inserted draft when its event write fails, so a retry can record one', async () => {
    const prospect = await createProspectHub(connection!, { sector: 'hotel', name: 'Draft Event' });
    const threadId = randomUUID();
    const input = (providerDraftId: string) => ({
      prospectId: prospect.prospectId,
      threadId,
      touch: 1,
      language: 'fr' as const,
      roleAddress: 'contact@draft-event.fr',
      subject: 'Objet',
      body: 'Corps',
      htmlBody: '<p>Corps</p>',
      evidenceVersion: 'v1',
      outreachPromptVersion: 'v1',
      providerDraftId,
      providerMessageId: `${providerDraftId}-m`,
      providerThreadId: `${providerDraftId}-t`,
      createdAt: new Date(),
    });

    const Events = createProspectEventModel(connection!);
    const originalCreate = Events.create;
    Events.create = (async () => {
      throw new Error('event write failed');
    }) as never;
    try {
      await expect(recordOutreachDraft(connection!, input('g-1'))).rejects.toThrow(
        'event write failed',
      );
    } finally {
      Events.create = originalCreate;
    }

    const failed = await createOutreachDraftModel(connection!)
      .findOne({ providerDraftId: 'g-1' })
      .lean();
    expect(failed?.status).toBe('deleted');
    expect(await findLiveOutreachDraft(connection!, threadId, 1)).toBeNull();

    const retried = await recordOutreachDraft(connection!, input('g-2'));
    expect(retried.status).toBe('created');
  });
});

describe.skipIf(!available)('confirmOutreachSentByOperator', () => {
  async function draftedFirstTouch(name: string) {
    const prospect = await createProspectHub(connection!, { sector: 'hotel', name });
    const openedAt = new Date('2026-09-27T08:00:00.000Z');
    const { thread } = await openOutreachThread(connection!, {
      prospectId: prospect.prospectId,
      previewId: randomUUID(),
      domain: 'shared-contact.fr',
      roleAddress: 'contact@shared-contact.fr',
      language: 'fr',
      openedAt,
      spacing: { touch2AfterDays: 4, touch3AfterDays: 11, replyWindowDays: 14 },
      campaignVersion: 'v1',
    });
    await transitionOutreachThread(connection!, {
      threadId: thread.threadId,
      from: ['open'],
      to: 'e1-drafted',
      at: openedAt,
    });
    const draft = await recordOutreachDraft(connection!, {
      prospectId: prospect.prospectId,
      threadId: thread.threadId,
      touch: 1,
      language: 'fr',
      roleAddress: 'contact@shared-contact.fr',
      subject: 'Objet',
      body: 'Corps',
      htmlBody: '<p>Corps</p>',
      evidenceVersion: 'v1',
      outreachPromptVersion: 'v1',
      providerDraftId: `g-${name}`,
      providerMessageId: `m-${name}`,
      providerThreadId: `t-${name}`,
      createdAt: openedAt,
    });
    return { prospect, thread, draft };
  }

  it('confirms touch 1, approves and withdraws its draft, and closes the thread', async () => {
    const { prospect, thread, draft } = await draftedFirstTouch('Confirmed Elsewhere');
    const at = new Date('2026-09-28T09:00:00.000Z');

    const result = await confirmOutreachSentByOperator(
      connection!,
      prospect.prospectId,
      'contacted',
      at,
    );

    expect(result).toEqual({
      touch: 1,
      threadClosed: true,
      providerDrafts: [{ draftId: draft.draftId, providerDraftId: 'g-Confirmed Elsewhere' }],
    });
    const storedDraft = await createOutreachDraftModel(connection!)
      .findOne({ draftId: draft.draftId })
      .lean();
    expect(storedDraft).toMatchObject({
      status: 'mailbox-delete-pending',
      reviewOutcome: 'approved',
    });
    const stored = await findOutreachThreadById(connection!, thread.threadId);
    expect(stored).toMatchObject({ state: 'closed', stateReason: 'operator-confirmed-send' });
    expect(stored?.touches).toEqual([
      { touch: 1, confirmedBy: 'operator', sentAt: at, detectedAt: at },
    ]);

    // A rerun has nothing left to confirm.
    await expect(
      confirmOutreachSentByOperator(connection!, prospect.prospectId, 'contacted', at),
    ).resolves.toEqual({ threadClosed: false, providerDrafts: [] });
  });

  it('leaves the thread alone when the status does not match the drafted touch', async () => {
    const { prospect, thread } = await draftedFirstTouch('Wrong Touch');

    await expect(
      confirmOutreachSentByOperator(connection!, prospect.prospectId, 'follow-up'),
    ).resolves.toEqual({ threadClosed: false, providerDrafts: [] });
    expect((await findOutreachThreadById(connection!, thread.threadId))?.state).toBe('e1-drafted');
  });

  it('confirms nothing when the drafted touch was already discarded', async () => {
    const { prospect, thread, draft } = await draftedFirstTouch('Discarded');
    await markOutreachDraftDeleted(connection!, draft.draftId);

    await expect(
      confirmOutreachSentByOperator(connection!, prospect.prospectId, 'contacted'),
    ).resolves.toEqual({ threadClosed: false, providerDrafts: [] });
    expect((await findOutreachThreadById(connection!, thread.threadId))?.touches).toEqual([]);
  });
});

describe.skipIf(!available)('provider drafts the store could not confirm (issue #552)', () => {
  const failedRow = (threadId: string) => ({
    prospectId: randomUUID(),
    threadId,
    touch: 1,
    language: 'fr' as const,
    roleAddress: 'contact@unconfirmed.fr',
    evidenceVersion: 'v1',
    outreachPromptVersion: 'v1',
    createdAt: new Date(),
  });

  it('keeps an undeleted provider draft live, and so the touch blocked, until the sweep removes it', async () => {
    const threadId = randomUUID();
    const row = await recordUnrecordedProviderDraft(connection!, {
      ...failedRow(threadId),
      providerDraftId: 'g-unrecorded',
    });

    const live = await findLiveOutreachDraft(connection!, threadId, 1);
    expect(live).toMatchObject({
      status: 'mailbox-delete-pending',
      providerDraftId: 'g-unrecorded',
    });
    await markOutreachDraftDeleted(connection!, row.draftId);
    expect(await findLiveOutreachDraft(connection!, threadId, 1)).toBeNull();
  });

  it('blocks the touch after an unanswered provider request until the operator checks the mailbox', async () => {
    const threadId = randomUUID();
    await recordFailedOutreachDraft(connection!, {
      ...failedRow(threadId),
      failureReason: 'provider-draft-unrecorded',
    });
    await recordFailedOutreachDraft(connection!, {
      ...failedRow(threadId),
      failureReason: 'assembly-refused',
    });

    expect(await findUnverifiedProviderDraft(connection!, threadId, 1)).not.toBeNull();
    expect(await findUnverifiedProviderDraft(connection!, threadId, 2)).toBeNull();
    await expect(
      acknowledgeUnverifiedProviderDrafts(connection!, threadId, new Date()),
    ).resolves.toBe(1);
    expect(await findUnverifiedProviderDraft(connection!, threadId, 1)).toBeNull();
  });
});

describe.skipIf(!available)('markOutreachThreadDrafted (issue #552)', () => {
  async function openThread(): Promise<string> {
    const domain = `${randomUUID().slice(0, 8)}.example`;
    const { thread } = await openOutreachThread(connection!, {
      prospectId: randomUUID(),
      previewId: randomUUID(),
      domain,
      roleAddress: `contact@${domain}`,
      language: 'fr',
      openedAt: new Date(),
      spacing: { touch2AfterDays: 4, touch3AfterDays: 7, replyWindowDays: 14 },
      campaignVersion: 'test-campaign',
    });
    return thread.threadId;
  }
  const drafted = (threadId: string, at = new Date()) => ({
    threadId,
    touch: 1,
    from: ['open'] as const,
    to: 'e1-drafted' as const,
    at,
    reason: 'draft-created',
    providerThreadId: 'provider-thread-new',
  });

  it('moves the state, touch and conversation in one write', async () => {
    const threadId = await openThread();

    await expect(markOutreachThreadDrafted(connection!, drafted(threadId))).resolves.toEqual({
      changed: true,
    });

    const thread = await findOutreachThreadById(connection!, threadId);
    expect(thread).toMatchObject({
      state: 'e1-drafted',
      currentTouch: 1,
      providerThreadId: 'provider-thread-new',
    });
    expect(thread?.needsReview).toBeUndefined();
  });

  it('keeps a redrafted touch in its state and its first date, with the new conversation', async () => {
    const threadId = await openThread();
    const first = new Date('2026-09-01T10:00:00.000Z');
    await markOutreachThreadDrafted(connection!, drafted(threadId, first));

    await expect(
      markOutreachThreadDrafted(connection!, {
        ...drafted(threadId),
        providerThreadId: 'provider-thread-redraft',
      }),
    ).resolves.toEqual({ changed: true });

    const thread = await findOutreachThreadById(connection!, threadId);
    expect(thread).toMatchObject({
      state: 'e1-drafted',
      stateEnteredAt: first,
      providerThreadId: 'provider-thread-redraft',
    });
  });

  it('flags the thread when it left the expected state before the draft landed', async () => {
    const threadId = await openThread();
    await transitionOutreachThread(connection!, {
      threadId,
      from: ['open'],
      to: 'opted-out',
      at: new Date(),
    });

    await expect(markOutreachThreadDrafted(connection!, drafted(threadId))).resolves.toEqual({
      changed: false,
    });

    const thread = await findOutreachThreadById(connection!, threadId);
    expect(thread?.state).toBe('opted-out');
    expect(thread?.needsReview?.reason).toBe('draft-not-applied');
  });
});
