import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { HotelCandidate } from '@odysseus/core';
import {
  upsertHotelCandidates,
  listHotelCandidates,
  getHotelCandidate,
  getHotelCandidateYield,
  getLatestHotelCandidateByOwnRegistrableDomain,
  recordHotelCandidateReview,
  recordHotelCandidateQualificationOverride,
  clearHotelCandidateQualificationOverride,
} from './hotel-candidates.js';
import { createHotelCandidateModel } from './schemas/hotel-candidate.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

/** Drops a key rather than setting it to undefined, the same reason
 *  hotel-source-records.test.ts's withoutFields gives. */
function without<T extends object>(value: T, key: keyof T): T {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function baseCandidate(overrides: Partial<HotelCandidate> = {}): HotelCandidate {
  return {
    candidateId: randomUUID(),
    resolutionVersion: 'v1',
    identityKey: 'domain:example.fr',
    identityStatus: 'unmatched',
    sourceRefs: [
      { source: 'atout-france', sourceId: 'a1', sourceVersion: 'size:mtime', ingestRunId: 'run-1' },
    ],
    name: 'Hôtel de la Plage',
    normalizedName: 'hotel de la plage',
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

describe.skipIf(!mongoAvailable)('hotel_candidates', () => {
  it('creates a candidate with a 90 day expiry and both timestamps', async () => {
    const version = randomUUID();
    const input = baseCandidate({ resolutionVersion: version });
    const result = await upsertHotelCandidates(connection!, [input]);
    expect(result).toEqual({ created: 1, updated: 0 });

    const stored = await getHotelCandidate(connection!, input.candidateId);
    expect(stored?.ownRegistrableDomain).toBe('example.fr');
    expect(stored?.createdAt).toBeInstanceOf(Date);
    const days = (stored!.expiresAt.getTime() - stored!.createdAt.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(90);
  });

  it('reads the current candidate projection for an exact own domain', async () => {
    const domain = `hotel-${randomUUID()}.fr`;
    const input = baseCandidate({
      identityKey: `domain:${domain}`,
      ownRegistrableDomain: domain,
      accommodationType: 'HÔTEL DE TOURISME',
    });
    await upsertHotelCandidates(connection!, [input]);

    const stored = await getLatestHotelCandidateByOwnRegistrableDomain(connection!, domain);

    expect(stored).toMatchObject({
      candidateId: input.candidateId,
      accommodationType: 'HÔTEL DE TOURISME',
    });
  });

  it('converges on one candidate per identity rather than accumulating', async () => {
    const version = randomUUID();
    const first = baseCandidate({ resolutionVersion: version, identityKey: 'domain:same.fr' });
    const second = baseCandidate({
      resolutionVersion: version,
      identityKey: 'domain:same.fr',
      name: 'Renamed Hôtel',
      normalizedName: 'renamed hotel',
      starRating: 4,
    });

    await upsertHotelCandidates(connection!, [first]);
    const again = await upsertHotelCandidates(connection!, [second]);
    expect(again.created).toBe(0);

    const all = await listHotelCandidates(connection!, { resolutionVersion: version });
    expect(all).toHaveLength(1);
    // The refresh wins on refreshable facts, but the identity stays the first
    // candidate's: a re-resolution must not hand out a new candidateId for a
    // hotel that later stages have already referenced.
    expect(all[0]?.name).toBe('Renamed Hôtel');
    expect(all[0]?.starRating).toBe(4);
    expect(all[0]?.candidateId).toBe(first.candidateId);
  });

  it('appends source references instead of replacing them', async () => {
    const version = randomUUID();
    const key = 'domain:multi.fr';
    await upsertHotelCandidates(connection!, [
      baseCandidate({ resolutionVersion: version, identityKey: key }),
    ]);
    await upsertHotelCandidates(connection!, [
      baseCandidate({
        resolutionVersion: version,
        identityKey: key,
        sourceRefs: [
          {
            source: 'atout-france',
            sourceId: 'a2',
            sourceVersion: 'size2:mtime2',
            ingestRunId: 'run-2',
          },
        ],
      }),
    ]);

    const [stored] = await listHotelCandidates(connection!, { resolutionVersion: version });
    expect(stored?.sourceRefs.map((ref) => ref.sourceId).sort()).toEqual(['a1', 'a2']);
  });

  it('preserves a recorded conflict across a later clean refresh', async () => {
    // A conflict is evidence that was set aside. A refresh that happened not to
    // see it must not erase the reason a human was asked to look.
    const version = randomUUID();
    const key = 'domain:conflicted.fr';
    await upsertHotelCandidates(connection!, [
      baseCandidate({
        resolutionVersion: version,
        identityKey: key,
        conflicts: [
          { kind: 'siret-disagreement', detail: 'two SIRETs on one domain', candidateIds: ['cx'] },
        ],
      }),
    ]);
    await upsertHotelCandidates(connection!, [
      baseCandidate({ resolutionVersion: version, identityKey: key, conflicts: [] }),
    ]);

    const [stored] = await listHotelCandidates(connection!, { resolutionVersion: version });
    expect(stored?.conflicts).toHaveLength(1);
    expect(stored?.conflicts[0]?.kind).toBe('siret-disagreement');
  });

  it('keeps two resolution versions of the same hotel side by side', async () => {
    // The whole reason resolutionVersion exists: a changed rule produces a
    // parallel generation, never an edit of the previous one.
    const key = `domain:${randomUUID()}.fr`;
    const v1 = randomUUID();
    const v2 = randomUUID();
    await upsertHotelCandidates(connection!, [
      baseCandidate({ resolutionVersion: v1, identityKey: key, groupStatus: 'independent' }),
      baseCandidate({ resolutionVersion: v2, identityKey: key, groupStatus: 'group-member' }),
    ]);
    expect(await listHotelCandidates(connection!, { resolutionVersion: v1 })).toHaveLength(1);
    const [second] = await listHotelCandidates(connection!, { resolutionVersion: v2 });
    expect(second?.groupStatus).toBe('group-member');
  });

  it('does not reset a human decision on refresh', async () => {
    const version = randomUUID();
    const key = 'domain:reviewed.fr';
    const input = baseCandidate({
      resolutionVersion: version,
      identityKey: key,
      identityStatus: 'needs-review',
      review: { state: 'pending', queuedReason: 'name and postcode only' },
    });
    await upsertHotelCandidates(connection!, [input]);
    await recordHotelCandidateReview(connection!, {
      candidateId: input.candidateId,
      decision: 'accepted',
      actor: 'operator',
      reason: 'confirmed by hand against the register',
    });
    await upsertHotelCandidates(connection!, [input]);

    const stored = await getHotelCandidate(connection!, input.candidateId);
    expect(stored?.review.state).toBe('accepted');
    expect(stored?.review.actor).toBe('operator');
  });

  it('queues a candidate that only becomes reviewable on a later run', async () => {
    const version = randomUUID();
    const key = 'domain:later-conflict.fr';
    await upsertHotelCandidates(connection!, [
      baseCandidate({ resolutionVersion: version, identityKey: key }),
    ]);

    const reviewable = baseCandidate({
      resolutionVersion: version,
      identityKey: key,
      identityStatus: 'ambiguous',
      review: { state: 'pending', queuedReason: 'identity-ambiguous' },
    });
    await upsertHotelCandidates(connection!, [reviewable]);

    const [stored] = await listHotelCandidates(connection!, {
      resolutionVersion: version,
      reviewState: 'pending',
    });
    expect(stored?.identityKey).toBe(key);
    expect(stored?.review.queuedReason).toBe('identity-ambiguous');
  });

  it('leaves an already pending review reason alone rather than restating it', async () => {
    const version = randomUUID();
    const key = 'domain:already-pending.fr';
    await upsertHotelCandidates(connection!, [
      baseCandidate({
        resolutionVersion: version,
        identityKey: key,
        review: { state: 'pending', queuedReason: 'no-website-declared' },
      }),
    ]);
    await upsertHotelCandidates(connection!, [
      baseCandidate({
        resolutionVersion: version,
        identityKey: key,
        review: { state: 'pending', queuedReason: 'identity-ambiguous' },
      }),
    ]);

    const [stored] = await listHotelCandidates(connection!, { resolutionVersion: version });
    expect(stored?.review.queuedReason).toBe('no-website-declared');
  });

  it('reports a repeated review decision as unchanged rather than failing', async () => {
    const version = randomUUID();
    const input = baseCandidate({ resolutionVersion: version, identityKey: 'domain:idem.fr' });
    await upsertHotelCandidates(connection!, [input]);
    const decision = {
      candidateId: input.candidateId,
      decision: 'rejected' as const,
      actor: 'operator',
      reason: 'chain property',
    };
    expect(await recordHotelCandidateReview(connection!, decision)).toEqual({
      changed: true,
      found: true,
    });
    expect(await recordHotelCandidateReview(connection!, decision)).toEqual({
      changed: false,
      found: true,
    });
  });

  it('reports a missing candidate rather than silently doing nothing', async () => {
    expect(
      await recordHotelCandidateReview(connection!, {
        candidateId: randomUUID(),
        decision: 'accepted',
        actor: 'operator',
        reason: 'x',
      }),
    ).toEqual({ changed: false, found: false });
  });

  it('records a qualification override without touching the automatic qualification pointer', async () => {
    const version = randomUUID();
    const input = baseCandidate({
      resolutionVersion: version,
      identityKey: 'domain:override.fr',
      qualification: { outcome: 'rejected', qualificationVersion: 'qv1', evaluatedAt: new Date() },
    });
    await upsertHotelCandidates(connection!, [input]);

    expect(
      await recordHotelCandidateQualificationOverride(connection!, {
        candidateId: input.candidateId,
        actor: 'dashboard',
        reason: 'confirmed live by hand',
      }),
    ).toEqual({ changed: true, found: true });

    const stored = await getHotelCandidate(connection!, input.candidateId);
    expect(stored?.qualificationOverride).toMatchObject({
      outcome: 'qualified',
      actor: 'dashboard',
      reason: 'confirmed live by hand',
    });
    // The automatic verdict is untouched - the override lives beside it,
    // not instead of it.
    expect(stored?.qualification?.outcome).toBe('rejected');
  });

  it('does not erase a qualification override on a later resolution upsert', async () => {
    const version = randomUUID();
    const key = 'domain:override-survives.fr';
    const input = baseCandidate({
      resolutionVersion: version,
      identityKey: key,
      qualification: { outcome: 'rejected', qualificationVersion: 'qv1', evaluatedAt: new Date() },
    });
    await upsertHotelCandidates(connection!, [input]);
    await recordHotelCandidateQualificationOverride(connection!, {
      candidateId: input.candidateId,
      actor: 'dashboard',
    });

    // Same input replayed, as a re-run of resolution would.
    await upsertHotelCandidates(connection!, [input]);

    const stored = await getHotelCandidate(connection!, input.candidateId);
    expect(stored?.qualificationOverride?.outcome).toBe('qualified');
  });

  it('does not erase a qualification override when the automatic qualification is rerun', async () => {
    const version = randomUUID();
    const input = baseCandidate({
      resolutionVersion: version,
      identityKey: 'domain:override-vs-requalify.fr',
      qualification: { outcome: 'rejected', qualificationVersion: 'qv1', evaluatedAt: new Date() },
    });
    await upsertHotelCandidates(connection!, [input]);
    await recordHotelCandidateQualificationOverride(connection!, {
      candidateId: input.candidateId,
      actor: 'dashboard',
    });

    // A later automatic re-qualification overwrites `qualification`
    // outright, exactly as it does today (it is the field a rerun is
    // meant to change) - it must never also touch `qualificationOverride`.
    const Model = createHotelCandidateModel(connection!);
    await Model.updateOne(
      { candidateId: input.candidateId },
      {
        $set: {
          qualification: {
            outcome: 'rejected',
            qualificationVersion: 'qv2',
            evaluatedAt: new Date(),
          },
        },
      },
    );

    const stored = await getHotelCandidate(connection!, input.candidateId);
    expect(stored?.qualification?.qualificationVersion).toBe('qv2');
    expect(stored?.qualificationOverride?.outcome).toBe('qualified');
  });

  it('reports a repeated qualification override as unchanged rather than failing', async () => {
    const version = randomUUID();
    const input = baseCandidate({
      resolutionVersion: version,
      identityKey: 'domain:override-idem.fr',
    });
    await upsertHotelCandidates(connection!, [input]);
    const override = { candidateId: input.candidateId, actor: 'dashboard', reason: 'x' };
    expect(await recordHotelCandidateQualificationOverride(connection!, override)).toEqual({
      changed: true,
      found: true,
    });
    expect(await recordHotelCandidateQualificationOverride(connection!, override)).toEqual({
      changed: false,
      found: true,
    });
  });

  it('reports a missing candidate rather than silently doing nothing for an override', async () => {
    expect(
      await recordHotelCandidateQualificationOverride(connection!, {
        candidateId: randomUUID(),
        actor: 'dashboard',
      }),
    ).toEqual({ changed: false, found: false });
  });

  it('clears a qualification override and returns to the automatic verdict', async () => {
    const version = randomUUID();
    const input = baseCandidate({
      resolutionVersion: version,
      identityKey: 'domain:override-clear.fr',
      qualification: { outcome: 'rejected', qualificationVersion: 'qv1', evaluatedAt: new Date() },
    });
    await upsertHotelCandidates(connection!, [input]);
    await recordHotelCandidateQualificationOverride(connection!, {
      candidateId: input.candidateId,
      actor: 'dashboard',
    });

    expect(await clearHotelCandidateQualificationOverride(connection!, input.candidateId)).toEqual({
      changed: true,
      found: true,
    });

    const stored = await getHotelCandidate(connection!, input.candidateId);
    expect(stored?.qualificationOverride).toBeUndefined();
    expect(stored?.qualification?.outcome).toBe('rejected');
  });

  it('reports clearing an absent override as unchanged rather than failing', async () => {
    const version = randomUUID();
    const input = baseCandidate({
      resolutionVersion: version,
      identityKey: 'domain:no-override.fr',
    });
    await upsertHotelCandidates(connection!, [input]);
    expect(await clearHotelCandidateQualificationOverride(connection!, input.candidateId)).toEqual({
      changed: false,
      found: true,
    });
  });

  it('reports a missing candidate rather than silently doing nothing when clearing', async () => {
    expect(await clearHotelCandidateQualificationOverride(connection!, randomUUID())).toEqual({
      changed: false,
      found: false,
    });
  });

  it('counts the campaign-ready population and every status breakdown', async () => {
    const version = randomUUID();
    await upsertHotelCandidates(connection!, [
      baseCandidate({ resolutionVersion: version, identityKey: 'k1' }),
      baseCandidate({ resolutionVersion: version, identityKey: 'k2' }),
      // Eligible but part of a chain: not campaign-ready.
      baseCandidate({
        resolutionVersion: version,
        identityKey: 'k3',
        groupStatus: 'group-member',
        groupDomain: 'accor.com',
        groupSize: 872,
      }),
      // Independent but two stars: not campaign-ready.
      baseCandidate({
        resolutionVersion: version,
        identityKey: 'k4',
        campaignEligibility: 'parked-below-three-stars',
        starRating: 2,
      }),
      // Independent and eligible but with no usable domain: not campaign-ready.
      without(
        baseCandidate({
          resolutionVersion: version,
          identityKey: 'k5',
          groupStatus: 'unknown',
          review: { state: 'pending', queuedReason: 'no usable website' },
        }),
        'ownRegistrableDomain',
      ),
    ]);

    const summary = await getHotelCandidateYield(connection!, version);
    expect(summary.total).toBe(5);
    expect(summary.campaignReady).toBe(2);
    expect(summary.byGroupStatus['group-member']).toBe(1);
    expect(summary.byGroupStatus.independent).toBe(3);
    expect(summary.byReviewState.pending).toBe(1);
  });

  it('filters a review queue without loading the whole catalogue', async () => {
    const version = randomUUID();
    await upsertHotelCandidates(connection!, [
      baseCandidate({ resolutionVersion: version, identityKey: 'q1' }),
      baseCandidate({
        resolutionVersion: version,
        identityKey: 'q2',
        identityStatus: 'needs-review',
        review: { state: 'pending', queuedReason: 'vendor host' },
      }),
    ]);
    const queue = await listHotelCandidates(connection!, {
      resolutionVersion: version,
      reviewState: 'pending',
    });
    expect(queue).toHaveLength(1);
    expect(queue[0]?.review.queuedReason).toBe('vendor host');
  });

  it('builds its unique index, which is what makes a resumed run idempotent', async () => {
    const Model = createHotelCandidateModel(connection!);
    await Model.init();
    const indexes = await Model.collection.indexes();
    const unique = indexes.find(
      (index) => index.key['resolutionVersion'] === 1 && index.key['identityKey'] === 1,
    );
    expect(unique?.unique).toBe(true);
  });
});
