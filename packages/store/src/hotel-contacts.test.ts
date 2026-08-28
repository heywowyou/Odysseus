import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { HotelCandidate } from '@odysseus/core';
import {
  listCohortMembersToContact,
  recordHotelContacts,
  getHotelContact,
  getHotelContactSummary,
  listHotelContacts,
  type RecordHotelContactInput,
} from './hotel-contacts.js';
import { upsertHotelCandidates } from './hotel-candidates.js';
import { addSuppressionEntry } from './suppression.js';
import { createHotelContactModel } from './schemas/hotel-contact.schema.js';
import { createHotelScoreCohortModel } from './schemas/score-cohort.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

function candidate(candidateId: string, overrides: Partial<HotelCandidate> = {}): HotelCandidate {
  return {
    candidateId,
    resolutionVersion: 'v1',
    identityKey: `domain:${candidateId}.fr`,
    identityStatus: 'unmatched',
    sourceRefs: [
      { source: 'atout-france', sourceId: 'a1', sourceVersion: 'v', ingestRunId: 'run-1' },
    ],
    name: 'Hôtel Exemple',
    normalizedName: 'hotel exemple',
    starRating: 3,
    campaignEligibility: 'eligible',
    websiteCandidates: [],
    ownRegistrableDomain: `${candidateId}.fr`,
    groupStatus: 'independent',
    conflicts: [],
    review: { state: 'not-required' },
    ...overrides,
  };
}

/** Drops keys entirely rather than setting them to undefined: a row with no
 *  address has no such field, and the store's write path distinguishes the two. */
function without(
  input: RecordHotelContactInput,
  ...fields: (keyof RecordHotelContactInput)[]
): RecordHotelContactInput {
  const copy = { ...input } as Record<string, unknown>;
  for (const field of fields) delete copy[field];
  return copy as unknown as RecordHotelContactInput;
}

function contact(overrides: Partial<RecordHotelContactInput> = {}): RecordHotelContactInput {
  return {
    candidateId: randomUUID(),
    cohortId: 'cohort-1',
    contactVersion: `cv-${randomUUID()}`,
    domain: 'hotel-exemple.fr',
    state: 'found',
    reason: 'role-address-published',
    address: 'contact@hotel-exemple.fr',
    localPart: 'contact',
    source: 'contact-page',
    sourceUrl: 'https://hotel-exemple.fr/contact',
    mxStatus: 'has-mx',
    validatedAt: new Date(),
    ...overrides,
  };
}

/** A cohort with the given members, all selected unless stated otherwise. */
async function seedCohort(
  scoringVersion: string,
  members: { candidateId: string; state?: 'selected' | 'calibration' }[],
): Promise<string> {
  const cohortId = randomUUID();
  await createHotelScoreCohortModel(connection!).create({
    cohortId,
    scoringVersion,
    selectionRuleVersion: 'half-ability-decile-brokenness-v1',
    approved: true,
    populationSize: members.length,
    abilityCutoff: 0,
    brokennessCutoff: 0,
    selectedCount: members.length,
    members: members.map((member, index) => ({
      candidateId: member.candidateId,
      scoreId: randomUUID(),
      rank: index + 1,
      state: member.state ?? 'selected',
      reason: 'top-brokenness-decile',
    })),
    notSelectedByReason: {},
    computedAt: new Date(),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  });
  return cohortId;
}

describe.skipIf(!mongoAvailable)('hotel_contacts', () => {
  it('writes one document per evaluation and reads it back whole', async () => {
    const input = contact();
    const result = await recordHotelContacts(connection!, [input]);
    expect(result.created).toBe(1);

    const stored = await getHotelContact(connection!, input.contactVersion, input.candidateId);
    expect(stored).toMatchObject({
      state: 'found',
      reason: 'role-address-published',
      address: 'contact@hotel-exemple.fr',
      localPart: 'contact',
      sourceUrl: 'https://hotel-exemple.fr/contact',
      mxStatus: 'has-mx',
      cohortId: 'cohort-1',
    });
    expect(stored?.contactId).toBeTruthy();
  });

  it('expires on the ninety-day operational retention policy', async () => {
    const input = contact();
    await recordHotelContacts(connection!, [input]);
    const stored = await getHotelContact(connection!, input.contactVersion, input.candidateId);

    const days = (stored!.expiresAt.getTime() - stored!.createdAt.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(90);
  });

  it('re-running the same version updates in place rather than duplicating', async () => {
    const input = contact();
    await recordHotelContacts(connection!, [input]);
    const second = await recordHotelContacts(connection!, [
      without({ ...input, state: 'parked', reason: 'no-address-published' }, 'address'),
    ]);

    expect(second.created).toBe(0);
    const rows = await createHotelContactModel(connection!)
      .find({ contactVersion: input.contactVersion, candidateId: input.candidateId })
      .lean();
    expect(rows).toHaveLength(1);
  });

  it('clears a stale address when a re-run no longer finds one', async () => {
    const input = contact();
    await recordHotelContacts(connection!, [input]);
    await recordHotelContacts(connection!, [
      without(
        { ...input, state: 'parked', reason: 'no-address-published' },
        'address',
        'localPart',
        'source',
        'sourceUrl',
      ),
    ]);

    const stored = await getHotelContact(connection!, input.contactVersion, input.candidateId);
    expect(stored?.state).toBe('parked');
    expect(stored?.address).toBeUndefined();
    expect(stored?.localPart).toBeUndefined();
  });

  it('stores a parked row with its reason and no address', async () => {
    const input = without(
      contact({ state: 'parked', reason: 'no-address-published' }),
      'address',
      'localPart',
      'source',
      'sourceUrl',
    );
    await recordHotelContacts(connection!, [input]);

    const stored = await getHotelContact(connection!, input.contactVersion, input.candidateId);
    expect(stored).toMatchObject({ state: 'parked', reason: 'no-address-published' });
    expect(stored?.address).toBeUndefined();
  });

  it('summarizes a version by state, reason, local part and MX status', async () => {
    const contactVersion = `cv-${randomUUID()}`;
    await recordHotelContacts(connection!, [
      contact({ contactVersion, localPart: 'direction', address: 'direction@a.fr' }),
      contact({ contactVersion, localPart: 'reception', address: 'reception@b.fr' }),
      without(
        contact({
          contactVersion,
          state: 'rejected',
          reason: 'free-mail-only',
          mxStatus: 'unknown',
        }),
        'address',
        'localPart',
      ),
    ]);

    const summary = await getHotelContactSummary(connection!, contactVersion);
    expect(summary.total).toBe(3);
    expect(summary.byState).toMatchObject({ found: 2, rejected: 1 });
    expect(summary.byLocalPart).toEqual({ direction: 1, reception: 1 });
    expect(summary.byMxStatus).toMatchObject({ 'has-mx': 2, unknown: 1 });
  });

  it('lists a version filtered by state', async () => {
    const contactVersion = `cv-${randomUUID()}`;
    await recordHotelContacts(connection!, [
      contact({ contactVersion }),
      without(contact({ contactVersion, state: 'parked', reason: 'site-unreachable' }), 'address'),
    ]);

    const parked = await listHotelContacts(connection!, {
      contactVersion,
      state: 'parked',
      limit: 10,
    });
    expect(parked).toHaveLength(1);
    expect(parked[0]?.reason).toBe('site-unreachable');
  });
});

describe.skipIf(!mongoAvailable)('listCohortMembersToContact', () => {
  it('returns the selected members of the latest cohort, with their domain', async () => {
    const scoringVersion = `sv-${randomUUID()}`;
    const first = randomUUID();
    await upsertHotelCandidates(connection!, [candidate(first)]);
    const cohortId = await seedCohort(scoringVersion, [{ candidateId: first }]);

    const members = await listCohortMembersToContact(connection!, {
      scoringVersion,
      contactVersion: `cv-${randomUUID()}`,
    });

    expect(members).toEqual([{ candidateId: first, cohortId, domain: `${first}.fr` }]);
  });

  it('never returns a member that was not selected', async () => {
    const scoringVersion = `sv-${randomUUID()}`;
    const calibrated = randomUUID();
    await upsertHotelCandidates(connection!, [candidate(calibrated)]);
    await seedCohort(scoringVersion, [{ candidateId: calibrated, state: 'calibration' }]);

    const members = await listCohortMembersToContact(connection!, {
      scoringVersion,
      contactVersion: `cv-${randomUUID()}`,
    });
    expect(members).toEqual([]);
  });

  it('skips a member already evaluated at this contact version, unless recontacting', async () => {
    const scoringVersion = `sv-${randomUUID()}`;
    const contactVersion = `cv-${randomUUID()}`;
    const done = randomUUID();
    await upsertHotelCandidates(connection!, [candidate(done)]);
    await seedCohort(scoringVersion, [{ candidateId: done }]);
    await recordHotelContacts(connection!, [contact({ candidateId: done, contactVersion })]);

    await expect(
      listCohortMembersToContact(connection!, { scoringVersion, contactVersion }),
    ).resolves.toEqual([]);
    await expect(
      listCohortMembersToContact(connection!, { scoringVersion, contactVersion, recontact: true }),
    ).resolves.toHaveLength(1);
  });

  it('omits a member with no own domain rather than reporting a contact failure for it', async () => {
    const scoringVersion = `sv-${randomUUID()}`;
    const domainless = randomUUID();
    // Built by omission rather than by setting the field to undefined: the
    // catalogue row for a hotel with no resolved domain simply has no such key.
    const { ownRegistrableDomain: _noDomain, ...withoutDomain } = candidate(domainless);
    await upsertHotelCandidates(connection!, [withoutDomain]);
    await seedCohort(scoringVersion, [{ candidateId: domainless }]);

    await expect(
      listCohortMembersToContact(connection!, {
        scoringVersion,
        contactVersion: `cv-${randomUUID()}`,
      }),
    ).resolves.toEqual([]);
  });

  it('reads the most recent cohort when a version has several', async () => {
    const scoringVersion = `sv-${randomUUID()}`;
    const older = randomUUID();
    const newer = randomUUID();
    await upsertHotelCandidates(connection!, [candidate(older), candidate(newer)]);
    await seedCohort(scoringVersion, [{ candidateId: older }]);
    const latest = await seedCohort(scoringVersion, [{ candidateId: newer }]);

    const members = await listCohortMembersToContact(connection!, {
      scoringVersion,
      contactVersion: `cv-${randomUUID()}`,
    });
    expect(members.map((member) => member.candidateId)).toEqual([newer]);
    expect(members[0]?.cohortId).toBe(latest);
  });

  it('bounds the population with limit and narrows it with domain', async () => {
    const scoringVersion = `sv-${randomUUID()}`;
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    await upsertHotelCandidates(
      connection!,
      ids.map((id) => candidate(id)),
    );
    await seedCohort(
      scoringVersion,
      ids.map((candidateId) => ({ candidateId })),
    );

    await expect(
      listCohortMembersToContact(connection!, {
        scoringVersion,
        contactVersion: `cv-${randomUUID()}`,
        limit: 2,
      }),
    ).resolves.toHaveLength(2);

    const one = await listCohortMembersToContact(connection!, {
      scoringVersion,
      contactVersion: `cv-${randomUUID()}`,
      domain: `${ids[1]}.fr`,
    });
    expect(one.map((member) => member.candidateId)).toEqual([ids[1]]);
  });
});

describe.skipIf(!mongoAvailable)(
  'suppression stays hash-only beside the contact collection',
  () => {
    it('records an opt-out without storing the address it suppresses', async () => {
      const domain = `opt-out-${randomUUID()}.fr`;
      await addSuppressionEntry(connection!, {
        domain,
        address: `contact@${domain}`,
        reason: 'unsubscribe',
      });

      const raw = await connection!.collection('suppression').findOne({ reason: 'unsubscribe' });
      expect(JSON.stringify(raw)).not.toContain(domain);
    });
  },
);
