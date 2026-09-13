import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { probeMongoAvailability } from '../test-support.js';
import { createHotelCandidateModel } from '../schemas/hotel-candidate.schema.js';
import { createHotelContactModel } from '../schemas/hotel-contact.schema.js';
import { upsertHotelCandidates } from '../hotel-candidates.js';
import { recordHotelContacts, recordManualHotelContact } from '../hotel-contacts.js';
import { getProspectContactView } from './contact-preview-thread-outcome.js';
import { candidateInput } from './test-fixtures.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

describe.skipIf(!mongoAvailable)('manual contact view precedence', () => {
  beforeEach(async () => {
    if (!connection) return;
    await createHotelCandidateModel(connection).deleteMany({});
    await createHotelContactModel(connection).deleteMany({});
  });

  it('keeps the manual override as effective even after the discovered row is re-validated later', async () => {
    if (!connection) return;
    const candidateId = 'cand-precedence';
    await upsertHotelCandidates(connection, [candidateInput({ candidateId })]);

    await recordHotelContacts(connection, [
      {
        candidateId,
        contactVersion: 'cv-1',
        cohortId: 'cohort-1',
        domain: `hotel-${candidateId}.fr`,
        state: 'found',
        reason: 'role-address-published',
        address: 'reception@hotel-precedence.fr',
        localPart: 'reception',
        mxStatus: 'has-mx',
        validatedAt: new Date('2026-08-20T09:00:00.000Z'),
      },
    ]);

    await recordManualHotelContact(connection, {
      candidateId,
      domain: `hotel-${candidateId}.fr`,
      address: 'owner@example.net',
      addressOrigin: 'provided-directly',
      validatedAt: new Date('2026-08-21T09:00:00.000Z'),
    });

    const withOverride = await getProspectContactView(connection, candidateId);
    expect(withOverride?.reason).toBe('operator-entered');

    // A later automated recontact re-validates the discovered row with a
    // newer timestamp than the manual override. A "latest by validatedAt
    // across every version" read would flip back to the discovered row here;
    // the override must still win.
    await recordHotelContacts(connection, [
      {
        candidateId,
        contactVersion: 'cv-1',
        cohortId: 'cohort-1',
        domain: `hotel-${candidateId}.fr`,
        state: 'found',
        reason: 'role-address-published',
        address: 'reception@hotel-precedence.fr',
        localPart: 'reception',
        mxStatus: 'has-mx',
        validatedAt: new Date('2026-09-13T09:00:00.000Z'),
      },
    ]);

    const stillOverridden = await getProspectContactView(connection, candidateId);
    expect(stillOverridden?.reason).toBe('operator-entered');
    expect(stillOverridden?.cohortId).toBeNull();
  });
});
