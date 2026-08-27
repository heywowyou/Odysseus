import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { HotelCandidate, HotelSiteFacts } from '@odysseus/core';
import {
  recordHotelQualifications,
  getHotelQualification,
  listHotelQualifications,
  getHotelQualificationYield,
  type RecordHotelQualificationInput,
} from './hotel-qualifications.js';
import { upsertHotelCandidates, getHotelCandidate } from './hotel-candidates.js';
import { createHotelQualificationModel } from './schemas/hotel-qualification.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
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
});
