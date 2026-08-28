import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  selectOutreachCohort,
  type HotelCandidate,
  type HotelOutreachScore,
  type OutreachSelectionRow,
} from '@odysseus/core';
import {
  diffHotelScoreVersions,
  findScoredCandidateIds,
  getHotelScoreSummary,
  getLatestHotelScore,
  getLatestScoreCohort,
  listCandidatesToScore,
  listLatestHotelScores,
  recordHotelScores,
  recordScoreCohort,
  type RecordHotelScoreInput,
} from './scores.js';
import { upsertHotelCandidates } from './hotel-candidates.js';
import { getPrescanVendorAggregate, recordPrescan } from './prescans.js';
import { createHotelScoreModel } from './schemas/score.schema.js';
import { createHotelScoreCohortModel } from './schemas/score-cohort.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

function score(brokenness: number, ability: number, worthy = true): HotelOutreachScore {
  return {
    scoringVersion: 'hotel-outreach-v1',
    brokenness: {
      total: brokenness,
      components: [{ id: 'render-gap', points: brokenness, reason: 'render-gap-severe' }],
    },
    ability: {
      total: ability,
      components: [{ id: 'independence', points: ability, reason: 'independent' }],
    },
    worthy,
  };
}

function scoreInput(overrides: Partial<RecordHotelScoreInput> = {}): RecordHotelScoreInput {
  return {
    candidateId: randomUUID(),
    prescanId: randomUUID(),
    domain: 'hotel-exemple.fr',
    resolutionVersion: 'v1',
    qualificationVersion: 'qv1',
    prescanVersion: 'pv2',
    score: score(60, 70),
    evidenceComplete: true,
    computedAt: new Date('2026-08-28T10:00:00Z'),
    ...overrides,
  };
}

function candidate(overrides: Partial<HotelCandidate> = {}): HotelCandidate {
  const candidateId = overrides.candidateId ?? randomUUID();
  return {
    candidateId,
    resolutionVersion: `rv-${candidateId}`,
    identityKey: `key-${candidateId}`,
    identityStatus: 'resolved',
    sourceRefs: [],
    name: 'Hotel Exemple',
    normalizedName: 'hotel exemple',
    starRating: 4,
    campaignEligibility: 'eligible',
    websiteCandidates: [],
    ownRegistrableDomain: 'hotel-exemple.fr',
    groupStatus: 'independent',
    conflicts: [],
    review: { state: 'not-required' },
    ...overrides,
  };
}

describe.skipIf(!mongoAvailable)('hotel scores', () => {
  const db = connection!;

  it('inserts a score and reads it back as the latest', async () => {
    const candidateId = randomUUID();
    const version = `sv-${randomUUID()}`;
    const result = await recordHotelScores(db, [
      scoreInput({ candidateId, score: { ...score(40, 50), scoringVersion: version } }),
    ]);
    expect(result.inserted).toBe(1);

    const latest = await getLatestHotelScore(db, candidateId, version);
    expect(latest?.scoreId).toBe(result.scoreIds[0]);
    expect(latest?.brokenness.total).toBe(40);
    expect(latest?.ability.total).toBe(50);
    expect(latest?.worthy).toBe(true);
  });

  it('keeps history: a rescore inserts rather than overwriting', async () => {
    const candidateId = randomUUID();
    const version = `sv-${randomUUID()}`;
    await recordHotelScores(db, [
      scoreInput({
        candidateId,
        score: { ...score(10, 10), scoringVersion: version },
        computedAt: new Date('2026-08-01T00:00:00Z'),
      }),
    ]);
    await recordHotelScores(db, [
      scoreInput({
        candidateId,
        score: { ...score(90, 20), scoringVersion: version },
        computedAt: new Date('2026-08-20T00:00:00Z'),
      }),
    ]);

    const all = await createHotelScoreModel(db)
      .find({ candidateId, scoringVersion: version })
      .lean();
    expect(all).toHaveLength(2);
    const latest = await getLatestHotelScore(db, candidateId, version);
    expect(latest?.brokenness.total).toBe(90);

    const latestPerCandidate = await listLatestHotelScores(db, version);
    expect(latestPerCandidate).toHaveLength(1);
    expect(latestPerCandidate[0]?.brokenness.total).toBe(90);
  });

  it('isolates two scoring versions of the same candidate', async () => {
    const candidateId = randomUUID();
    const older = `sv-${randomUUID()}`;
    const newer = `sv-${randomUUID()}`;
    await recordHotelScores(db, [
      scoreInput({ candidateId, score: { ...score(30, 30), scoringVersion: older } }),
      scoreInput({ candidateId, score: { ...score(80, 30), scoringVersion: newer } }),
    ]);

    expect((await getLatestHotelScore(db, candidateId, older))?.brokenness.total).toBe(30);
    expect((await getLatestHotelScore(db, candidateId, newer))?.brokenness.total).toBe(80);
    expect(await listLatestHotelScores(db, older)).toHaveLength(1);
  });

  it('reports which candidates already hold a score at a version', async () => {
    const scored = randomUUID();
    const unscored = randomUUID();
    const version = `sv-${randomUUID()}`;
    await recordHotelScores(db, [
      scoreInput({ candidateId: scored, score: { ...score(20, 20), scoringVersion: version } }),
    ]);
    const found = await findScoredCandidateIds(db, version, [scored, unscored]);
    expect([...found]).toEqual([scored]);
  });

  it('bands a population without averaging it away', async () => {
    const version = `sv-${randomUUID()}`;
    await recordHotelScores(db, [
      scoreInput({
        candidateId: randomUUID(),
        score: { ...score(5, 100), scoringVersion: version },
      }),
      scoreInput({
        candidateId: randomUUID(),
        score: { ...score(95, 12), scoringVersion: version },
      }),
      scoreInput({
        candidateId: randomUUID(),
        score: { ...score(95, 12, false), scoringVersion: version },
      }),
    ]);
    const summary = await getHotelScoreSummary(db, version);
    expect(summary.total).toBe(3);
    expect(summary.worthy).toBe(2);
    expect(summary.brokennessBands).toEqual({ '0-9': 1, '90-99': 2 });
    expect(summary.abilityBands).toEqual({ '100': 1, '10-19': 2 });
  });

  it('diffs two versions over the same hotels', async () => {
    const from = `sv-${randomUUID()}`;
    const to = `sv-${randomUUID()}`;
    const moved = randomUUID();
    const still = randomUUID();
    const dropped = randomUUID();
    const added = randomUUID();
    await recordHotelScores(db, [
      scoreInput({ candidateId: moved, score: { ...score(40, 40), scoringVersion: from } }),
      scoreInput({ candidateId: moved, score: { ...score(70, 40), scoringVersion: to } }),
      scoreInput({ candidateId: still, score: { ...score(50, 50), scoringVersion: from } }),
      scoreInput({ candidateId: still, score: { ...score(50, 50), scoringVersion: to } }),
      scoreInput({ candidateId: dropped, score: { ...score(10, 10), scoringVersion: from } }),
      scoreInput({ candidateId: added, score: { ...score(10, 10), scoringVersion: to } }),
    ]);
    const diff = await diffHotelScoreVersions(db, from, to);
    expect(diff.unchanged).toBe(1);
    expect(diff.onlyInFrom).toBe(1);
    expect(diff.onlyInTo).toBe(1);
    expect(diff.changed).toEqual([
      {
        candidateId: moved,
        domain: 'hotel-exemple.fr',
        fromBrokenness: 40,
        toBrokenness: 70,
        fromAbility: 40,
        toAbility: 40,
      },
    ]);
  });
});

describe.skipIf(!mongoAvailable)('listCandidatesToScore', () => {
  const db = connection!;

  it('returns only qualified, eligible candidates carrying a prescan at the version', async () => {
    const resolutionVersion = `rv-${randomUUID()}`;
    const qualificationVersion = `qv-${randomUUID()}`;
    const prescanVersion = `pv-${randomUUID()}`;
    const ready = candidate({
      resolutionVersion,
      qualification: { outcome: 'qualified', qualificationVersion, evaluatedAt: new Date() },
    });
    const neverPrescanned = candidate({
      resolutionVersion,
      qualification: { outcome: 'qualified', qualificationVersion, evaluatedAt: new Date() },
    });
    const parked = candidate({
      resolutionVersion,
      campaignEligibility: 'parked-below-three-stars',
      qualification: { outcome: 'parked', qualificationVersion, evaluatedAt: new Date() },
    });
    await upsertHotelCandidates(db, [ready, neverPrescanned, parked]);

    // Through recordPrescan rather than a raw update, so the pointer under test
    // is the one the real pipeline writes.
    for (const row of [ready, parked]) {
      await recordPrescan(db, {
        candidateId: row.candidateId,
        resolutionVersion,
        qualificationVersion,
        prescanVersion,
        scanJobId: randomUUID(),
        domain: 'hotel-exemple.fr',
        startUrl: 'https://hotel-exemple.fr/',
        status: 'complete',
        pages: [],
        absentRoles: [],
        offsiteBookingLinks: [],
        robotsTxtFound: true,
        effectiveDelayMs: 1000,
        artifactsDir: 'hotel-exemple.fr/2026-08-28T10-00-00Z',
        browserVersion: 'Chromium/1.0',
        startedAt: new Date(),
        durationMs: 1234,
      });
    }

    const rows = await listCandidatesToScore(db, {
      resolutionVersion,
      qualificationVersion,
      prescanVersion,
      limit: 50,
    });
    expect(rows.map((row) => row.candidateId)).toEqual([ready.candidateId]);
  });
});

describe.skipIf(!mongoAvailable)('score cohorts', () => {
  const db = connection!;

  function row(overrides: Partial<OutreachSelectionRow>): OutreachSelectionRow {
    return {
      candidateId: randomUUID(),
      scoreId: randomUUID(),
      scoringVersion: 'hotel-outreach-v1',
      brokennessTotal: 50,
      abilityTotal: 50,
      worthy: true,
      evidenceComplete: true,
      qualified: true,
      campaignEligible: true,
      suppressed: false,
      ...overrides,
    };
  }

  it('stores members with reasons and rejections as counts', async () => {
    const version = `sv-${randomUUID()}`;
    const selection = selectOutreachCohort(
      [
        row({ candidateId: 'a', brokennessTotal: 90, abilityTotal: 90, scoringVersion: version }),
        row({ candidateId: 'b', brokennessTotal: 80, abilityTotal: 80, scoringVersion: version }),
        row({ candidateId: 'c', suppressed: true, scoringVersion: version }),
        row({ candidateId: 'd', worthy: false, scoringVersion: version }),
      ],
      { scoringVersion: version, approved: true },
    );
    const { cohortId } = await recordScoreCohort(db, selection);
    const stored = await getLatestScoreCohort(db, version);
    expect(stored?.cohortId).toBe(cohortId);
    expect(stored?.selectedCount).toBe(1);
    expect(stored?.members.map((member) => [member.candidateId, member.state])).toEqual([
      ['a', 'selected'],
    ]);
    expect(stored?.notSelectedByReason).toEqual({
      suppressed: 1,
      'not-worthy': 1,
      'below-ability-cutoff': 1,
    });
  });

  it('records a second selection run as a new cohort rather than a correction', async () => {
    const version = `sv-${randomUUID()}`;
    const selection = selectOutreachCohort([row({ candidateId: 'a', scoringVersion: version })], {
      scoringVersion: version,
      approved: true,
    });
    const first = await recordScoreCohort(db, selection, new Date('2026-08-01T00:00:00Z'));
    const second = await recordScoreCohort(db, selection, new Date('2026-08-02T00:00:00Z'));
    expect(second.cohortId).not.toBe(first.cohortId);
    const all = await createHotelScoreCohortModel(db).find({ scoringVersion: version }).lean();
    expect(all).toHaveLength(2);
    expect((await getLatestScoreCohort(db, version))?.cohortId).toBe(second.cohortId);
  });

  it('stores an unapproved run as calibration with nothing selected', async () => {
    const version = `sv-${randomUUID()}`;
    const selection = selectOutreachCohort([row({ candidateId: 'a', scoringVersion: version })], {
      scoringVersion: version,
      approved: false,
    });
    await recordScoreCohort(db, selection);
    const stored = await getLatestScoreCohort(db, version);
    expect(stored?.approved).toBe(false);
    expect(stored?.selectedCount).toBe(0);
    expect(stored?.members[0]?.state).toBe('calibration');
  });
});

describe.skipIf(!mongoAvailable)('score retention', () => {
  const db = connection!;

  it('carries a TTL index on both collections', async () => {
    await createHotelScoreModel(db).init();
    await createHotelScoreCohortModel(db).init();
    for (const model of [createHotelScoreModel(db), createHotelScoreCohortModel(db)]) {
      const indexes = await model.collection.indexes();
      const ttl = indexes.find((index) => index['expireAfterSeconds'] !== undefined);
      expect(ttl?.key).toEqual({ expiresAt: 1 });
    }
  });
});

describe.skipIf(!mongoAvailable)('getPrescanVendorAggregate', () => {
  const db = connection!;

  it('counts recurring hosts, mechanisms and rules per hotel and hides small groups', async () => {
    const prescanVersion = `pv-${randomUUID()}`;
    for (let index = 0; index < 3; index += 1) {
      await recordPrescan(db, {
        candidateId: randomUUID(),
        resolutionVersion: 'v1',
        qualificationVersion: 'qv1',
        prescanVersion,
        scanJobId: randomUUID(),
        domain: `hotel-${index}.fr`,
        startUrl: `https://hotel-${index}.fr/`,
        status: 'complete',
        pages: [
          {
            role: 'homepage',
            url: `https://hotel-${index}.fr/`,
            // The same rule twice on one hotel counts once.
            axe: {
              violationCount: 2,
              byImpact: { critical: 0, serious: 2, moderate: 0, minor: 0 },
              ruleIds: ['color-contrast', 'color-contrast'],
              affectedElementCount: 2,
            },
            bookingEvidenceKinds: ['embedded-widget'],
            durationMs: 100,
          },
        ],
        absentRoles: [],
        offsiteBookingLinks:
          index === 0
            ? ['https://booking.example.com/x', 'https://rare-vendor.example/y']
            : ['https://booking.example.com/x'],
        robotsTxtFound: true,
        effectiveDelayMs: 1000,
        artifactsDir: 'x',
        browserVersion: 'Chromium/1',
        startedAt: new Date(),
        durationMs: 100,
      });
    }

    const aggregate = await getPrescanVendorAggregate(db, prescanVersion, 3);
    expect(aggregate.prescansRead).toBe(3);
    expect(aggregate.bookingHosts).toEqual([{ value: 'booking.example.com', hotels: 3 }]);
    expect(aggregate.bookingMechanisms).toEqual([{ value: 'embedded-widget', hotels: 3 }]);
    expect(aggregate.failureRules).toEqual([{ value: 'color-contrast', hotels: 3 }]);
  });
});
