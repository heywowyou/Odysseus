import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { migrateOutreachDraftThreadTouchIndex } from './outreach-draft-index-migration.js';
import { recordOutreachDraft } from './outreach-drafts.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('outreach_draft_index_migration'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

function draftInput() {
  return {
    prospectId: randomUUID(),
    threadId: randomUUID(),
    touch: 1 as const,
    language: 'fr' as const,
    roleAddress: 'contact@hotel-exemple.fr',
    subject: 'Analyse du site',
    body: 'Bonjour',
    htmlBody: '<p>Bonjour</p>',
    evidenceVersion: 'evidence-v1',
    outreachPromptVersion: 'prompt-v1',
    providerDraftId: randomUUID(),
    providerMessageId: randomUUID(),
    providerThreadId: randomUUID(),
    createdAt: new Date(),
  };
}

describe.skipIf(!available)('migrateOutreachDraftThreadTouchIndex', () => {
  it('replaces the legacy index so drafts can be recorded again', async () => {
    const collection = connection!.db!.collection('outreach_drafts');
    await connection!.db!.dropDatabase();
    await collection.createIndex(
      { threadId: 1, touch: 1 },
      { name: 'threadId_1_touch_1', unique: true, partialFilterExpression: { status: 'created' } },
    );
    await expect(recordOutreachDraft(connection!, draftInput())).rejects.toThrow(
      /same name as the requested index/u,
    );

    expect(await migrateOutreachDraftThreadTouchIndex(connection!)).toBe('migrated');
    const index = (await collection.listIndexes().toArray()).find(
      (item) => item.name === 'threadId_1_touch_1',
    );
    expect(index?.['partialFilterExpression']).toEqual({
      status: { $in: ['created', 'mailbox-delete-pending'] },
    });
    expect(await migrateOutreachDraftThreadTouchIndex(connection!)).toBe('current');
  });
});
