import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { HotelCandidate, HotelSiteFacts } from '@odysseus/core';
import {
  recordHotelQualifications,
  getHotelQualification,
  getLatestHotelQualificationVersion,
  listHotelQualifications,
  getHotelQualificationYield,
  listQualificationsByCandidate,
  countCandidatesByOwnDomain,
  type RecordHotelQualificationInput,
} from './hotel-qualifications.js';
import {
  upsertHotelCandidates,
  getHotelCandidate,
  getHotelCandidatesByIds,
  applyRedirectReclassifications,
} from './hotel-candidates.js';
import { createHotelQualificationModel } from './schemas/hotel-qualification.schema.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability(
  scopedMongoTestUri('hotel_qualifications'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

function siteFacts(overrides: Partial<HotelSiteFacts> = {}): HotelSiteFacts {
  return {
    finalUrl: 'https://hotel-exemple.fr/',
    reachability: 'ok',
    parkedPage: false,
    reservationUrl: 'https://hotel-exemple.fr/reserver',
    bookingVendors: [],
    accessibilityStatementUrl: null,
    siren: '552100554',
    siret: null,
    mentionsLegalesUrl: 'https://hotel-exemple.fr/mentions-legales',
    redirectedWithinSite: false,
    ...overrides,
  };
}

function qualification(
  overrides: Partial<RecordHotelQualificationInput> = {},
): RecordHotelQualificationInput {
  return {
    candidateId: randomUUID(),
    resolutionVersion: 'v1',
    qualificationVersion: `qv-${randomUUID()}`,
    domain: 'hotel-exemple.fr',
    outcome: 'qualified',
    reasons: [],
    notes: [],
    siteFacts: siteFacts(),
    evaluatedAt: new Date(),
    ...overrides,
  };
}

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
    ownRegistrableDomain: 'hotel-exemple.fr',
    groupStatus: 'independent',
    conflicts: [],
    review: { state: 'not-required' },
    ...overrides,
  };
}

describe.skipIf(!mongoAvailable)('hotel_qualifications', () => {
  it('writes one document per evaluation and reads it back whole', async () => {
    const input = qualification();
    const result = await recordHotelQualifications(connection!, [input]);
    expect(result.created).toBe(1);

    const stored = await getHotelQualification(
      connection!,
      input.qualificationVersion,
      input.candidateId,
    );
    expect(stored?.outcome).toBe('qualified');
    expect(stored?.domain).toBe('hotel-exemple.fr');
    // The evidence, not just the verdict: a reason alone cannot be audited.
    expect(stored?.siteFacts.finalUrl).toBe('https://hotel-exemple.fr/');
    expect(stored?.qualificationId).toBeTruthy();
    expect(stored?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('re-running the same version updates in place rather than duplicating', async () => {
    const input = qualification();
    await recordHotelQualifications(connection!, [input]);
    const second = await recordHotelQualifications(connection!, [
      { ...input, outcome: 'rejected', reasons: ['dns-unresolved'] },
    ]);

    expect(second.created).toBe(0);
    const Model = createHotelQualificationModel(connection!);
    const count = await Model.countDocuments({
      qualificationVersion: input.qualificationVersion,
      candidateId: input.candidateId,
    });
    expect(count).toBe(1);

    const stored = await getHotelQualification(
      connection!,
      input.qualificationVersion,
      input.candidateId,
    );
    expect(stored?.outcome).toBe('rejected');
  });

  it('keeps a re-run at a new version beside the old one', async () => {
    const candidateId = randomUUID();
    const v1 = qualification({ candidateId, outcome: 'rejected', reasons: ['dns-unresolved'] });
    const v2 = {
      ...v1,
      qualificationVersion: `${v1.qualificationVersion}-next`,
      outcome: 'qualified' as const,
      reasons: [],
    };
    await recordHotelQualifications(connection!, [v1]);
    await recordHotelQualifications(connection!, [v2]);

    const Model = createHotelQualificationModel(connection!);
    expect(await Model.countDocuments({ candidateId })).toBe(2);
    expect(
      (await getHotelQualification(connection!, v1.qualificationVersion, candidateId))?.outcome,
    ).toBe('rejected');
  });

  it('is a no-op on an empty batch', async () => {
    expect(await recordHotelQualifications(connection!, [])).toEqual({
      created: 0,
      updated: 0,
      pointersWritten: 0,
    });
  });

  it('stores every reason and note, including a full accumulation', async () => {
    const input = qualification({
      outcome: 'rejected',
      reasons: ['group-member', 'http-error', 'below-three-stars', 'awaiting-review'],
      notes: ['no-booking-path-detected', 'no-identification-published'],
    });
    await recordHotelQualifications(connection!, [input]);
    const stored = await getHotelQualification(
      connection!,
      input.qualificationVersion,
      input.candidateId,
    );
    expect(stored?.reasons).toEqual([
      'group-member',
      'http-error',
      'below-three-stars',
      'awaiting-review',
    ]);
    expect(stored?.notes).toHaveLength(2);
  });

  describe('the candidate pointer', () => {
    it('updates the candidate without touching review or provenance', async () => {
      const candidateId = randomUUID();
      await upsertHotelCandidates(connection!, [candidate(candidateId)]);
      const before = await getHotelCandidate(connection!, candidateId);

      const input = qualification({ candidateId, outcome: 'parked', reasons: ['awaiting-review'] });
      const result = await recordHotelQualifications(connection!, [input]);
      expect(result.pointersWritten).toBe(1);

      const after = await getHotelCandidate(connection!, candidateId);
      expect(after?.qualification?.outcome).toBe('parked');
      expect(after?.qualification?.qualificationVersion).toBe(input.qualificationVersion);
      expect(after?.review).toEqual(before?.review);
      expect(after?.sourceRefs).toEqual(before?.sourceRefs);
    });

    it('overwrites the pointer on a re-run, since a dead domain may have come back', async () => {
      const candidateId = randomUUID();
      await upsertHotelCandidates(connection!, [candidate(candidateId)]);
      const version = `qv-${randomUUID()}`;
      await recordHotelQualifications(connection!, [
        qualification({
          candidateId,
          qualificationVersion: version,
          outcome: 'rejected',
          reasons: ['dns-unresolved'],
        }),
      ]);
      await recordHotelQualifications(connection!, [
        qualification({ candidateId, qualificationVersion: version, outcome: 'qualified' }),
      ]);

      const after = await getHotelCandidate(connection!, candidateId);
      expect(after?.qualification?.outcome).toBe('qualified');
    });

    it('reports a qualification naming a candidate that no longer exists', async () => {
      // A catalogue re-resolved underneath a running batch. Worth surfacing
      // rather than swallowing, so the evidence is still stored.
      const input = qualification({ candidateId: randomUUID() });
      const result = await recordHotelQualifications(connection!, [input]);
      expect(result.created).toBe(1);
      expect(result.pointersWritten).toBe(0);
      expect(
        await getHotelQualification(connection!, input.qualificationVersion, input.candidateId),
      ).not.toBeNull();
    });
  });

  describe('yield', () => {
    it('counts outcomes, and counts reasons independently of them', async () => {
      const version = `qv-${randomUUID()}`;
      await recordHotelQualifications(connection!, [
        qualification({
          qualificationVersion: version,
          outcome: 'qualified',
          notes: ['no-booking-path-detected'],
        }),
        qualification({ qualificationVersion: version, outcome: 'qualified' }),
        qualification({
          qualificationVersion: version,
          outcome: 'rejected',
          reasons: ['dns-unresolved', 'below-three-stars'],
        }),
        qualification({
          qualificationVersion: version,
          outcome: 'parked',
          reasons: ['below-three-stars'],
        }),
      ]);

      const summary = await getHotelQualificationYield(connection!, version);
      expect(summary.total).toBe(4);
      expect(summary.byOutcome.qualified).toBe(2);
      expect(summary.byOutcome.rejected).toBe(1);
      expect(summary.byOutcome.parked).toBe(1);
      expect(summary.byOutcome['already-engaged']).toBe(0);
      // Two candidates hit below-three-stars, though only one was parked for
      // it: the loss table answers "how many hit this condition".
      expect(summary.byReason['below-three-stars']).toBe(2);
      expect(summary.byReason['dns-unresolved']).toBe(1);
      expect(summary.byNote['no-booking-path-detected']).toBe(1);
    });

    it('returns zeroed counts for a version with nothing in it', async () => {
      const summary = await getHotelQualificationYield(connection!, `qv-${randomUUID()}`);
      expect(summary.total).toBe(0);
      expect(summary.byOutcome.qualified).toBe(0);
      expect(summary.byReason).toEqual({});
    });
  });

  it('lists by outcome within a version', async () => {
    const version = `qv-${randomUUID()}`;
    await recordHotelQualifications(connection!, [
      qualification({ qualificationVersion: version, outcome: 'qualified' }),
      qualification({
        qualificationVersion: version,
        outcome: 'rejected',
        reasons: ['http-error'],
      }),
    ]);

    const rejected = await listHotelQualifications(connection!, {
      qualificationVersion: version,
      outcome: 'rejected',
    });
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reasons).toEqual(['http-error']);
  });

  it('finds the generation with the most recently persisted evaluation', async () => {
    const olderVersion = `qv-${randomUUID()}`;
    const newerVersion = `qv-${randomUUID()}`;
    await recordHotelQualifications(connection!, [
      qualification({
        qualificationVersion: olderVersion,
        evaluatedAt: new Date('9998-01-01T00:00:00.000Z'),
      }),
      qualification({
        qualificationVersion: newerVersion,
        evaluatedAt: new Date('9999-01-01T00:00:00.000Z'),
      }),
    ]);

    expect(await getLatestHotelQualificationVersion(connection!)).toBe(newerVersion);
  });

  describe('the redirect reconciliation helpers', () => {
    it('pages a whole generation by candidateId', async () => {
      const version = `qv-${randomUUID()}`;
      const ids = ['aaa', 'bbb', 'ccc'].map((prefix) => `${prefix}-${randomUUID()}`).sort();
      await recordHotelQualifications(
        connection!,
        ids.map((candidateId) => qualification({ candidateId, qualificationVersion: version })),
      );

      const first = await listQualificationsByCandidate(connection!, {
        qualificationVersion: version,
        limit: 2,
      });
      expect(first.map((row) => row.candidateId)).toEqual(ids.slice(0, 2));

      const second = await listQualificationsByCandidate(connection!, {
        qualificationVersion: version,
        limit: 2,
        after: first[1]!.candidateId,
      });
      expect(second.map((row) => row.candidateId)).toEqual(ids.slice(2));
    });

    it('counts the establishments already declaring each domain', async () => {
      // The half of the redirect-target count that catches an acquisition:
      // without it, a hotel redirecting to a domain another hotel already
      // holds reads as a rename.
      const resolutionVersion = `rv-${randomUUID()}`;
      await upsertHotelCandidates(connection!, [
        candidate(randomUUID(), { resolutionVersion, ownRegistrableDomain: 'partagé.fr' }),
        candidate(randomUUID(), { resolutionVersion, ownRegistrableDomain: 'partagé.fr' }),
        candidate(randomUUID(), { resolutionVersion, ownRegistrableDomain: 'seul.fr' }),
      ]);

      const counts = await countCandidatesByOwnDomain(connection!, {
        resolutionVersion,
        domains: ['partagé.fr', 'seul.fr', 'jamais-vu.fr'],
      });
      expect(counts.get('partagé.fr')).toBe(2);
      expect(counts.get('seul.fr')).toBe(1);
      // Absent, not zero: nothing was measured about a domain nobody declares.
      expect(counts.has('jamais-vu.fr')).toBe(false);
    });

    it('adopts a domain while keeping the one the catalogue declared', async () => {
      const resolutionVersion = `rv-${randomUUID()}`;
      const candidateId = randomUUID();
      await upsertHotelCandidates(connection!, [
        candidate(candidateId, {
          resolutionVersion,
          ownRegistrableDomain: 'lacoorniche-pyla.com',
        }),
      ]);

      const { applied } = await applyRedirectReclassifications(connection!, [
        {
          kind: 'adopt',
          candidateId,
          adoptedDomain: 'lacoorniche.com',
          declaredDomain: 'lacoorniche-pyla.com',
        },
      ]);
      expect(applied).toBe(1);

      const stored = await getHotelCandidate(connection!, candidateId);
      expect(stored?.ownRegistrableDomain).toBe('lacoorniche.com');
      expect(stored?.domainProvenance).toBe('redirect-adopted');
      expect(stored?.declaredRegistrableDomain).toBe('lacoorniche-pyla.com');
      // Never rewritten: everything already addressed against it would break.
      expect(stored?.identityKey).toBe(`domain:${candidateId}.fr`);
    });

    it('routes a shared target to the group queue with its size as evidence', async () => {
      const candidateId = randomUUID();
      await upsertHotelCandidates(connection!, [candidate(candidateId)]);

      await applyRedirectReclassifications(connection!, [
        {
          kind: 'route',
          candidateId,
          groupStatus: 'group-member',
          groupDomain: 'esprit-de-france.com',
          groupSize: 8,
        },
      ]);

      const stored = await getHotelCandidate(connection!, candidateId);
      expect(stored?.groupStatus).toBe('group-member');
      expect(stored?.groupDomain).toBe('esprit-de-france.com');
      expect(stored?.groupSize).toBe(8);
      // Routing says nothing about which domain is the hotel's own, so the
      // declared one is left exactly as it was.
      expect(stored?.ownRegistrableDomain).toBe('hotel-exemple.fr');
      expect(stored?.domainProvenance).toBeUndefined();
    });

    it('re-reads a named set of candidates', async () => {
      const wanted = [randomUUID(), randomUUID()];
      await upsertHotelCandidates(
        connection!,
        [...wanted, randomUUID()].map((id) => candidate(id)),
      );

      const read = await getHotelCandidatesByIds(connection!, wanted);
      expect(read.map((row) => row.candidateId).sort()).toEqual([...wanted].sort());
      expect(await getHotelCandidatesByIds(connection!, [])).toEqual([]);
    });
  });
});
