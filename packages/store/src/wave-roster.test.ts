import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { HotelCandidate } from '@odysseus/core';
import { upsertHotelCandidates } from './hotel-candidates.js';
import { createHotelScoreCohortModel } from './schemas/score-cohort.schema.js';
import {
  addWaveRosterEntry,
  findActiveWaveRosterEntry,
  listWaveRoster,
  revokeWaveRosterEntry,
} from './wave-roster.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.dropDatabase();
  if (connection) await connection.close();
});

const SCORING_VERSION = 'hotel-outreach-v1';

function baseCandidate(overrides: Partial<HotelCandidate> = {}): HotelCandidate {
  return {
    candidateId: randomUUID(),
    resolutionVersion: 'v1',
    identityKey: `domain:${randomUUID()}`,
    identityStatus: 'resolved',
    sourceRefs: [
      { source: 'atout-france', sourceId: 'a1', sourceVersion: 'size:mtime', ingestRunId: 'run-1' },
    ],
    name: 'Hôtel du Roster',
    normalizedName: 'hotel du roster',
    postcode: '38000',
    commune: 'GRENOBLE',
    starRating: 3,
    campaignEligibility: 'eligible',
    websiteCandidates: [
      {
        raw: 'https://www.example.fr',
        source: 'atout-france',
        sourceId: 'a1',
        kind: 'own-domain',
        hostname: 'www.example.fr',
        registrableDomain: 'example.fr',
      },
    ],
    ownRegistrableDomain: 'example.fr',
    groupStatus: 'independent',
    conflicts: [],
    review: { state: 'not-required' },
    ...overrides,
  };
}

async function seedCohort(): Promise<string> {
  const cohortId = `cohort-${randomUUID()}`;
  await createHotelScoreCohortModel(connection!).create({
    cohortId,
    scoringVersion: SCORING_VERSION,
    selectionRuleVersion: 'half-ability-decile-brokenness-v1',
    approved: true,
    populationSize: 1,
    abilityCutoff: null,
    brokennessCutoff: null,
    selectedCount: 0,
    members: [],
    notSelectedByReason: {},
    computedAt: new Date(),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  return cohortId;
}

describe.skipIf(!mongoAvailable)('wave roster', () => {
  it('adds an entry by candidate id and finds it as active', async () => {
    await seedCohort();
    const candidate = baseCandidate({ ownRegistrableDomain: 'rank7.fr' });
    await upsertHotelCandidates(connection!, [candidate]);

    const result = await addWaveRosterEntry(connection!, {
      wave: 'wave-1',
      candidateId: candidate.candidateId,
      rank: 7,
      scoringVersion: SCORING_VERSION,
      actor: 'operator',
    });
    expect(result).toMatchObject({
      added: true,
      candidateId: candidate.candidateId,
      domain: 'rank7.fr',
    });

    const active = await findActiveWaveRosterEntry(connection!, candidate.candidateId);
    expect(active).toMatchObject({
      wave: 'wave-1',
      candidateId: candidate.candidateId,
      rank: 7,
      state: 'active',
    });
  });

  it('adds an entry by domain, resolving the current candidate', async () => {
    await seedCohort();
    const candidate = baseCandidate({ ownRegistrableDomain: 'rank8.fr' });
    await upsertHotelCandidates(connection!, [candidate]);

    const result = await addWaveRosterEntry(connection!, {
      wave: 'wave-1',
      domain: 'rank8.fr',
      scoringVersion: SCORING_VERSION,
      actor: 'operator',
    });
    expect(result).toMatchObject({ added: true, candidateId: candidate.candidateId });
  });

  it('refuses an unknown candidate id', async () => {
    await seedCohort();
    const result = await addWaveRosterEntry(connection!, {
      wave: 'wave-1',
      candidateId: 'does-not-exist',
      scoringVersion: SCORING_VERSION,
      actor: 'operator',
    });
    expect(result).toEqual({ added: false, refused: 'candidate-unknown' });
  });

  it('refuses an unknown domain', async () => {
    await seedCohort();
    const result = await addWaveRosterEntry(connection!, {
      wave: 'wave-1',
      domain: 'nobody-owns-this.fr',
      scoringVersion: SCORING_VERSION,
      actor: 'operator',
    });
    expect(result).toEqual({ added: false, refused: 'domain-unknown' });
  });

  it('refuses when no cohort exists at the given scoring version', async () => {
    const candidate = baseCandidate({ ownRegistrableDomain: 'no-cohort.fr' });
    await upsertHotelCandidates(connection!, [candidate]);
    const result = await addWaveRosterEntry(connection!, {
      wave: 'wave-1',
      candidateId: candidate.candidateId,
      scoringVersion: `no-such-version-${randomUUID()}`,
      actor: 'operator',
    });
    expect(result).toEqual({ added: false, refused: 'no-cohort' });
  });

  it('refuses a duplicate active entry for the same hotel in the same wave', async () => {
    await seedCohort();
    const candidate = baseCandidate({ ownRegistrableDomain: 'dup.fr' });
    await upsertHotelCandidates(connection!, [candidate]);
    const wave = `wave-dup-${randomUUID()}`;
    await addWaveRosterEntry(connection!, {
      wave,
      candidateId: candidate.candidateId,
      scoringVersion: SCORING_VERSION,
      actor: 'operator',
    });
    const second = await addWaveRosterEntry(connection!, {
      wave,
      candidateId: candidate.candidateId,
      scoringVersion: SCORING_VERSION,
      actor: 'operator',
    });
    expect(second).toEqual({ added: false, refused: 'already-on-roster' });
  });

  it('revokes an entry, after which it is no longer active', async () => {
    await seedCohort();
    const candidate = baseCandidate({ ownRegistrableDomain: 'revoke-me.fr' });
    await upsertHotelCandidates(connection!, [candidate]);
    const wave = `wave-revoke-${randomUUID()}`;
    await addWaveRosterEntry(connection!, {
      wave,
      candidateId: candidate.candidateId,
      scoringVersion: SCORING_VERSION,
      actor: 'operator',
    });

    const revoked = await revokeWaveRosterEntry(connection!, {
      wave,
      candidateId: candidate.candidateId,
      actor: 'operator',
    });
    expect(revoked).toMatchObject({ revoked: true, candidateId: candidate.candidateId });

    expect(await findActiveWaveRosterEntry(connection!, candidate.candidateId)).toBeNull();
  });

  it('refuses to revoke a hotel not on the roster', async () => {
    const result = await revokeWaveRosterEntry(connection!, {
      wave: 'wave-1',
      candidateId: 'does-not-exist',
      actor: 'operator',
    });
    expect(result).toEqual({ revoked: false, refused: 'not-on-roster' });
  });

  it('allows re-adding a hotel after its earlier entry was revoked', async () => {
    await seedCohort();
    const candidate = baseCandidate({ ownRegistrableDomain: 're-add.fr' });
    await upsertHotelCandidates(connection!, [candidate]);
    const wave = `wave-readd-${randomUUID()}`;
    await addWaveRosterEntry(connection!, {
      wave,
      candidateId: candidate.candidateId,
      scoringVersion: SCORING_VERSION,
      actor: 'operator',
    });
    await revokeWaveRosterEntry(connection!, {
      wave,
      candidateId: candidate.candidateId,
      actor: 'operator',
    });

    const result = await addWaveRosterEntry(connection!, {
      wave,
      candidateId: candidate.candidateId,
      scoringVersion: SCORING_VERSION,
      actor: 'operator',
    });
    expect(result).toMatchObject({ added: true });
  });

  it('lists only active entries by default, ordered by rank', async () => {
    await seedCohort();
    const wave = `wave-list-${randomUUID()}`;
    const c1 = baseCandidate({ ownRegistrableDomain: 'list-a.fr' });
    const c2 = baseCandidate({ ownRegistrableDomain: 'list-b.fr' });
    await upsertHotelCandidates(connection!, [c1, c2]);
    await addWaveRosterEntry(connection!, {
      wave,
      candidateId: c2.candidateId,
      rank: 9,
      scoringVersion: SCORING_VERSION,
      actor: 'operator',
    });
    await addWaveRosterEntry(connection!, {
      wave,
      candidateId: c1.candidateId,
      rank: 7,
      scoringVersion: SCORING_VERSION,
      actor: 'operator',
    });
    await revokeWaveRosterEntry(connection!, {
      wave,
      candidateId: c2.candidateId,
      actor: 'operator',
    });

    const rows = await listWaveRoster(connection!, { wave });
    expect(rows.map((row) => row.candidateId)).toEqual([c1.candidateId]);
  });
});
