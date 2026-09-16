import { afterAll, describe, expect, it } from 'vitest';
import { departmentFromPostcodeForTest } from './prospect-hub.js';
import {
  createProspectHub,
  getProspectHub,
  setProspectStatus,
  updateProspect,
  withdrawProspectOutreach,
} from './prospect-hub.js';
import { recordOutreachDraft, recordOutreachTouchSent } from './outreach-drafts.js';
import { createOutreachDraftModel } from './schemas/outreach-draft.schema.js';
import { createOutreachPreviewModel } from './schemas/outreach-preview.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { createProspectHubModel } from './schemas/prospect-hub.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
});

describe('prospect hub pure helpers', () => {
  it('derives metropolitan departments and Corsica from postcodes', () => {
    expect(departmentFromPostcodeForTest('92100')).toBe('92');
    expect(departmentFromPostcodeForTest('20000')).toBe('2A');
    expect(departmentFromPostcodeForTest('20200')).toBe('2B');
  });
});

describe.skipIf(!mongoAvailable)('prospect hub persistence', () => {
  it('updates a prospect without leaking Mongoose metadata into the strict domain object', async () => {
    const created = await createProspectHub(connection!, {
      sector: 'hotel',
      name: 'Metadata Fixture',
      websites: [
        {
          url: 'https://example.com/',
          registrableDomain: 'example.com',
          kind: 'own',
          primary: true,
        },
      ],
    });

    const updated = await updateProspect(connection!, created.prospectId, {
      notes: 'Edited locally',
    });

    expect(updated?.notes).toBe('Edited locally');
    expect(updated).not.toHaveProperty('_id');
    expect(updated).not.toHaveProperty('__v');
    expect(
      await createProspectHubModel(connection!).countDocuments({ prospectId: created.prospectId }),
    ).toBe(1);
  });

  it('stores, edits, and removes stakeholders through a full-list update', async () => {
    const created = await createProspectHub(connection!, {
      sector: 'hotel',
      name: 'Stakeholder Fixture',
      websites: [],
    });
    expect(created.stakeholders).toBeUndefined();

    await updateProspect(connection!, created.prospectId, {
      stakeholders: [{ name: ' Jeanne Dupont ', position: ' Directrice ' }, { name: 'Sam Martin' }],
    });
    expect((await getProspectHub(connection!, created.prospectId))?.stakeholders).toEqual([
      { name: 'Jeanne Dupont', position: 'Directrice' },
      { name: 'Sam Martin' },
    ]);

    await updateProspect(connection!, created.prospectId, {
      stakeholders: [{ name: 'Sam Martin', position: 'Responsable technique' }],
    });
    expect((await getProspectHub(connection!, created.prospectId))?.stakeholders).toEqual([
      { name: 'Sam Martin', position: 'Responsable technique' },
    ]);

    await expect(
      updateProspect(connection!, created.prospectId, { stakeholders: [{ name: '  ' }] }),
    ).rejects.toThrow();
  });
});

describe.skipIf(!mongoAvailable)('withdrawing a prospect outreach', () => {
  it('withdraws pending drafts, revokes live previews and closes the active thread', async () => {
    const prospect = await createProspectHub(connection!, { sector: 'hotel', name: 'Withdraw' });
    const { prospectId } = prospect;
    const now = new Date();
    await createOutreachDraftModel(connection!).collection.insertMany([
      {
        draftId: 'd-pending',
        prospectId,
        status: 'created',
        providerDraftId: 'g-1',
        createdAt: now,
      },
      { draftId: 'd-sent', prospectId, status: 'deleted', providerDraftId: 'g-0', createdAt: now },
    ]);
    await createOutreachPreviewModel(connection!).collection.insertOne({
      previewId: 'pv-1',
      prospectId,
      status: 'live',
      objectKey: 'hotel/preview.html',
    });
    await createOutreachThreadModel(connection!).collection.insertOne({
      threadId: 't-1',
      prospectId,
      state: 'e1-drafted',
    });

    const withdrawn = await withdrawProspectOutreach(connection!, prospectId, 'opted-out');

    expect(withdrawn).toEqual({
      drafts: 1,
      previews: 1,
      threadClosed: true,
      providerDraftIds: ['g-1'],
      previewObjectKeys: ['hotel/preview.html'],
    });
    const draft = await createOutreachDraftModel(connection!).collection.findOne({
      draftId: 'd-pending',
    });
    expect(draft?.['status']).toBe('deleted');
    const preview = await createOutreachPreviewModel(connection!).collection.findOne({
      previewId: 'pv-1',
    });
    expect(preview?.['status']).toBe('revoked');
    const thread = await createOutreachThreadModel(connection!).collection.findOne({
      threadId: 't-1',
    });
    expect(thread?.['state']).toBe('opted-out');

    const again = await withdrawProspectOutreach(connection!, prospectId, 'opted-out');
    expect(again).toMatchObject({ drafts: 0, previews: 0, threadClosed: false });
  });
});

describe.skipIf(!mongoAvailable)('draft creation and confirmed sends', () => {
  it('keeps the status on draft creation and marks the prospect contacted on a confirmed send', async () => {
    const prospect = await createProspectHub(connection!, { sector: 'hotel', name: 'Sent' });
    await setProspectStatus(connection!, prospect.prospectId, 'audited');
    const now = new Date();
    await recordOutreachDraft(connection!, {
      prospectId: prospect.prospectId,
      threadId: 't-sent',
      touch: 1,
      language: 'fr',
      roleAddress: 'contact@sent.fr',
      subject: 'Objet',
      body: 'Corps',
      htmlBody: '<p>Corps</p>',
      evidenceVersion: 'v1',
      outreachPromptVersion: 'v1',
      providerDraftId: 'g-d',
      providerMessageId: 'g-m',
      providerThreadId: 'g-t',
      createdAt: now,
    });
    expect((await getProspectHub(connection!, prospect.prospectId))?.status).toBe('audited');

    await recordOutreachTouchSent(connection!, {
      prospectId: prospect.prospectId,
      threadId: 't-sent',
      touch: 1,
      sentAt: now,
    });

    expect((await getProspectHub(connection!, prospect.prospectId))?.status).toBe('contacted');
    const draft = await createOutreachDraftModel(connection!).collection.findOne({
      threadId: 't-sent',
    });
    expect(draft).toMatchObject({ status: 'deleted', reviewOutcome: 'approved' });
  });
});
