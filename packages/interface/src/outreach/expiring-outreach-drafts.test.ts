import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { listOutreachDrafts, recordOutreachDraft } from '@odysseus/store';
import { probeMongoAvailability, scopedMongoTestUri } from '@odysseus/store/test-support.js';
import { createInMemoryMailboxDraftAdapter } from './in-memory-mailbox-draft-adapter.js';
import type { MailboxDraftAdapter } from './mailbox-draft-adapter.js';
import {
  DRAFT_EXPIRY_LEAD_DAYS,
  withdrawExpiringOutreachDrafts,
} from './expiring-outreach-drafts.js';

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('expiring_outreach_drafts'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-12-31T00:00:00.000Z');

async function draftCreatedDaysAgo(mailbox: MailboxDraftAdapter, days: number) {
  const threadId = randomUUID();
  const provider = await mailbox.createDraft({
    to: 'contact@expiring.fr',
    subject: 'Objet',
    body: 'Corps',
    htmlBody: '<p>Corps</p>',
  });
  const draft = await recordOutreachDraft(connection!, {
    prospectId: randomUUID(),
    threadId,
    touch: 1,
    language: 'fr',
    roleAddress: 'contact@expiring.fr',
    subject: 'Objet',
    body: 'Corps',
    htmlBody: '<p>Corps</p>',
    evidenceVersion: 'v1',
    outreachPromptVersion: 'v1',
    ...provider,
    createdAt: new Date(NOW.getTime() - days * DAY_MS),
  });
  return { draft, threadId };
}

describe.skipIf(!available)('withdrawExpiringOutreachDrafts (issue #553)', () => {
  it('withdraws a draft from the mailbox before its row expires and leaves a recent one', async () => {
    const mailbox = createInMemoryMailboxDraftAdapter();
    const old = await draftCreatedDaysAgo(mailbox, 90 - DRAFT_EXPIRY_LEAD_DAYS + 1);
    const recent = await draftCreatedDaysAgo(mailbox, 10);

    await expect(
      withdrawExpiringOutreachDrafts({ connection: connection!, mailbox, now: NOW }),
    ).resolves.toEqual({ withdrawn: 1, notRemoved: 0 });

    expect(mailbox.recorded().map((draft) => draft.providerDraftId)).toEqual([
      recent.draft.providerDraftId,
    ]);
    const [oldRow] = await listOutreachDrafts(connection!, { threadId: old.threadId });
    expect(oldRow?.status).toBe('deleted');
  });

  it('keeps a draft the mailbox could not delete as a pending deletion that outlives its old expiry', async () => {
    const mailbox = createInMemoryMailboxDraftAdapter();
    const old = await draftCreatedDaysAgo(mailbox, 89);
    mailbox.deleteDraft = () => Promise.reject(new Error('Gmail unavailable'));

    await expect(
      withdrawExpiringOutreachDrafts({ connection: connection!, mailbox, now: NOW }),
    ).resolves.toEqual({ withdrawn: 0, notRemoved: 1 });

    const [row] = await listOutreachDrafts(connection!, { threadId: old.threadId });
    expect(row?.status).toBe('mailbox-delete-pending');
    expect(row!.expiresAt.getTime()).toBeGreaterThan(NOW.getTime() + 20 * DAY_MS);
  });
});
