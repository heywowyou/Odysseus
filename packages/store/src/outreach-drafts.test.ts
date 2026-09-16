import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { findLiveOutreachDraft, recordOutreachDraft } from './outreach-drafts.js';
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
