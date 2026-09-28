import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  confirmOutreachSentByOperator,
  findLiveOutreachDraft,
  markOutreachDraftDeleted,
  markOutreachDraftDeletionPending,
  recordOutreachDraft,
} from './outreach-drafts.js';
import {
  findOutreachThreadById,
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
