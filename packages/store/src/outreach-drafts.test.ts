import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  findLiveOutreachDraft,
  markOutreachDraftDeleted,
  markOutreachDraftDeletionPending,
  recordOutreachDraft,
} from './outreach-drafts.js';
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
