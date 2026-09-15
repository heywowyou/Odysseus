import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { recordOutreachDraft } from './outreach-drafts.js';
import { createProspectHub, listProspectEvents } from './prospect-hub.js';
import {
  removeProspectEmail,
  removeProspectWebsite,
  setOutreachProspectEmail,
  setPrimaryProspectWebsite,
} from './prospect-contacts.js';
import { createOutreachDraftModel } from './schemas/outreach-draft.schema.js';
import { isSuppressed } from './suppression.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
});

async function fixture() {
  return createProspectHub(connection!, {
    sector: 'hotel',
    name: 'Contacts Fixture',
    websites: [
      {
        url: 'https://booking-platform.example/hotel',
        registrableDomain: 'booking-platform.example',
        kind: 'vendor-hosted',
        primary: true,
      },
      {
        url: 'https://hotel-right.example/',
        registrableDomain: 'hotel-right.example',
        kind: 'own',
        primary: false,
      },
    ],
    emails: [
      { address: 'wrong@other.example', origin: 'site-discovery' },
      { address: 'contact@hotel-right.example', origin: 'atout-france' },
    ],
  });
}

describe.skipIf(!mongoAvailable)('prospect contact corrections', () => {
  it('promotes the next website when the primary is removed, and logs the removal', async () => {
    const created = await fixture();
    const result = await removeProspectWebsite(
      connection!,
      created.prospectId,
      'https://booking-platform.example/hotel',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prospect.websites).toEqual([
      expect.objectContaining({ url: 'https://hotel-right.example/', primary: true }),
    ]);
    const events = await listProspectEvents(connection!, created.prospectId);
    expect(events.map((e) => e.payload)).toContainEqual(
      expect.objectContaining({
        action: 'website-removed',
        url: 'https://booking-platform.example/hotel',
        wasPrimary: true,
      }),
    );

    const last = await removeProspectWebsite(
      connection!,
      created.prospectId,
      'https://hotel-right.example/',
    );
    expect(last.ok && last.prospect.websites).toEqual([]);
  });

  it('keeps exactly one primary when the operator chooses another website', async () => {
    const created = await fixture();
    const result = await setPrimaryProspectWebsite(
      connection!,
      created.prospectId,
      'https://hotel-right.example/',
    );
    expect(result.ok && result.prospect.websites.map((w) => w.primary)).toEqual([false, true]);
    expect(
      await setPrimaryProspectWebsite(connection!, created.prospectId, 'https://missing.example/'),
    ).toEqual({
      ok: false,
      refusal: 'contact-not-found',
    });
  });

  it('moves the chosen address first so outreach uses it', async () => {
    const created = await fixture();
    const result = await setOutreachProspectEmail(
      connection!,
      created.prospectId,
      'CONTACT@hotel-right.example',
    );
    expect(result.ok && result.prospect.emails.map((e) => e.address)).toEqual([
      'contact@hotel-right.example',
      'wrong@other.example',
    ]);
  });

  it('withdraws unsent drafts to a removed address, logs only its hash, and blacklists on request', async () => {
    const created = await fixture();
    const draft = await recordOutreachDraft(connection!, {
      prospectId: created.prospectId,
      threadId: randomUUID(),
      touch: 1,
      language: 'fr',
      roleAddress: 'wrong@other.example',
      subject: 's',
      body: 'b',
      htmlBody: '<p>b</p>',
      evidenceVersion: 'v',
      outreachPromptVersion: 'v',
      providerDraftId: 'provider-draft-1',
      providerMessageId: 'm',
      providerThreadId: 't',
      createdAt: new Date(),
    });

    const result = await removeProspectEmail(
      connection!,
      created.prospectId,
      'wrong@other.example',
      { suppress: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prospect.emails.map((e) => e.address)).toEqual(['contact@hotel-right.example']);
    expect(result.withdrawnProviderDraftIds).toEqual(['provider-draft-1']);
    const stored = await createOutreachDraftModel(connection!)
      .findOne({ draftId: draft.draftId })
      .lean();
    expect(stored?.status).toBe('deleted');
    expect(await isSuppressed(connection!, 'other.example', 'wrong@other.example')).toBe(true);

    const events = await listProspectEvents(connection!, created.prospectId);
    const removal = events.find((e) => e.payload['action'] === 'email-removed');
    expect(removal?.payload).toMatchObject({
      origin: 'site-discovery',
      wasRecipient: true,
      suppressed: true,
      withdrawnDrafts: 1,
    });
    expect(JSON.stringify(removal?.payload)).not.toContain('wrong@other.example');
  });
});
