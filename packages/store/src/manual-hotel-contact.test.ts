import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  MANUAL_CONTACT_VERSION,
  deleteManualHotelContact,
  getEffectiveHotelContact,
  getHotelContact,
  getManualHotelContact,
  recordHotelContacts,
  recordManualHotelContact,
} from './hotel-contacts.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

describe.skipIf(!mongoAvailable)('manual hotel contact override', () => {
  it('wins over the exact requested discovered version and deletes back to that version', async () => {
    const candidateId = randomUUID();
    const requestedVersion = `cv-requested-${randomUUID()}`;
    const newerVersion = `cv-newer-${randomUUID()}`;
    const validatedAt = new Date('2026-09-13T00:00:00.000Z');

    await recordHotelContacts(connection!, [
      {
        candidateId,
        cohortId: 'cohort-requested',
        contactVersion: requestedVersion,
        domain: 'hotel-exemple.fr',
        state: 'found',
        reason: 'role-address-published',
        address: 'reception@hotel-exemple.fr',
        localPart: 'reception',
        source: 'contact-page',
        sourceUrl: 'https://hotel-exemple.fr/contact',
        mxStatus: 'has-mx',
        validatedAt,
      },
      {
        candidateId,
        cohortId: 'cohort-newer',
        contactVersion: newerVersion,
        domain: 'hotel-exemple.fr',
        state: 'found',
        reason: 'role-address-published',
        address: 'direction@hotel-exemple.fr',
        localPart: 'direction',
        source: 'contact-page',
        sourceUrl: 'https://hotel-exemple.fr/direction',
        mxStatus: 'has-mx',
        validatedAt: new Date('2026-09-13T01:00:00.000Z'),
      },
    ]);

    await expect(
      getEffectiveHotelContact(connection!, requestedVersion, candidateId),
    ).resolves.toMatchObject({
      contactVersion: requestedVersion,
      address: 'reception@hotel-exemple.fr',
    });

    const attestedAt = new Date('2026-09-13T02:00:00.000Z');
    const manual = await recordManualHotelContact(connection!, {
      candidateId,
      domain: 'hotel-exemple.fr',
      address: '  Owner@Example.NET  ',
      addressOrigin: 'provided-directly',
      freeMailAttestedAt: attestedAt,
      validatedAt: attestedAt,
    });

    expect(manual).toMatchObject({
      contactVersion: MANUAL_CONTACT_VERSION,
      address: 'owner@example.net',
      localPart: 'owner',
      addressOrigin: 'provided-directly',
      state: 'found',
      reason: 'operator-entered',
      mxStatus: 'unknown',
      freeMailAttestedAt: attestedAt,
    });
    expect(manual.cohortId).toBeUndefined();

    await expect(
      getEffectiveHotelContact(connection!, requestedVersion, candidateId),
    ).resolves.toMatchObject({
      contactVersion: MANUAL_CONTACT_VERSION,
      address: 'owner@example.net',
    });

    await expect(deleteManualHotelContact(connection!, candidateId)).resolves.toBe(true);
    await expect(getManualHotelContact(connection!, candidateId)).resolves.toBeNull();
    await expect(
      getEffectiveHotelContact(connection!, requestedVersion, candidateId),
    ).resolves.toMatchObject({
      contactVersion: requestedVersion,
      address: 'reception@hotel-exemple.fr',
    });

    await expect(getHotelContact(connection!, newerVersion, candidateId)).resolves.toMatchObject({
      address: 'direction@hotel-exemple.fr',
    });
  });
});
