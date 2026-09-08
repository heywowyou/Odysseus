import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  HOTEL_EVIDENCE_OBSERVATIONS,
  HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
  type HotelCandidate,
} from '@odysseus/core';
import {
  getLatestPrescan,
  getPrescan,
  getPrescanSummary,
  listCandidatesToPrescan,
  recordPrescan,
  type RecordPrescanInput,
} from './prescans.js';
import { getHotelCandidate, upsertHotelCandidates } from './hotel-candidates.js';
import { recordHotelQualifications } from './hotel-qualifications.js';
import { createPrescanModel } from './schemas/prescan.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

function prescan(overrides: Partial<RecordPrescanInput> = {}): RecordPrescanInput {
  return {
    candidateId: randomUUID(),
    resolutionVersion: 'v1',
    qualificationVersion: 'qv1',
    prescanVersion: `pv-${randomUUID()}`,
    scanJobId: randomUUID(),
    domain: 'hotel-exemple.fr',
    startUrl: 'https://hotel-exemple.fr/',
    status: 'complete',
    pages: [
      {
        role: 'homepage',
        url: 'https://hotel-exemple.fr/',
        httpStatus: 200,
        missingPercent: 12,
        rawScreenshotRef: 'root-abc123/raw.png',
        renderedScreenshotRef: 'root-abc123/rendered.png',
        axe: {
          violationCount: 4,
          byImpact: { critical: 1, serious: 2, moderate: 0, minor: 3 },
          ruleIds: ['color-contrast', 'image-alt'],
          affectedElementCount: 6,
        },
        metrics: {
          largestContentfulPaintMs: 2400,
          cumulativeLayoutShift: 0.21,
          longTaskCount: 3,
          mainThreadBlockingMs: 410,
          requestCount: 62,
          transferBytes: 3_400_000,
          thirdPartyRequestCount: 21,
          thirdPartyHosts: ['fonts.googleapis.com'],
          sizeUnavailableCount: 0,
          observationWindowMs: 5200,
          failures: [],
        },
        durationMs: 4800,
      },
    ],
    absentRoles: [{ role: 'content', reason: 'no-candidate-link' }],
    offsiteBookingLinks: ['https://www.booking.com/hotel/fr/exemple.html'],
    robotsTxtFound: true,
    effectiveDelayMs: 1000,
    artifactsDir: 'hotel-exemple.fr/2026-08-27T10-00-00Z',
    browserVersion: '140.0.0.0',
    startedAt: new Date(),
    durationMs: 14_000,
    ...overrides,
  };
}

function completeEvidence(): NonNullable<RecordPrescanInput['evidence']> {
  const hash = 'a'.repeat(64);
  const asset = {
    state: 'captured' as const,
    ref: `evidence/${hash}.png`,
    sha256: hash,
    mimeType: 'image/png' as const,
    byteSize: 1024,
    width: 640,
    height: 400,
    pageRole: 'booking' as const,
    factRef: `fact_${'b'.repeat(24)}`,
    altText: { fr: 'Preuve mesurée', en: 'Measured evidence' },
    selectionReason: 'booking-form-error' as const,
  };
  return {
    schemaVersion: HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
    status: 'complete',
    renderComparison: { ...asset, selectionReason: 'material-render-gap' },
    specificFailure: asset,
    summaries: [
      {
        observation: HOTEL_EVIDENCE_OBSERVATIONS['keyboard-trap']!,
        severity: 'critical',
        wcagCriteria: ['2.1.2'],
        pageRole: 'booking',
      },
      {
        observation: HOTEL_EVIDENCE_OBSERVATIONS['form-error-not-associated']!,
        severity: 'serious',
        wcagCriteria: ['3.3.1'],
        pageRole: 'booking',
      },
      {
        observation: HOTEL_EVIDENCE_OBSERVATIONS['text-missing-from-raw-html']!,
        severity: 'moderate',
        wcagCriteria: [],
        pageRole: 'homepage',
      },
    ],
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

/** A candidate the plan-003 pass has already qualified, which is the only
 *  kind listCandidatesToPrescan will return. */
async function qualifiedCandidate(
  resolutionVersion: string,
  qualificationVersion: string,
  overrides: Partial<HotelCandidate> = {},
): Promise<string> {
  const candidateId = randomUUID();
  await upsertHotelCandidates(connection!, [
    candidate(candidateId, { resolutionVersion, ...overrides }),
  ]);
  await recordHotelQualifications(connection!, [
    {
      candidateId,
      resolutionVersion,
      qualificationVersion,
      domain: 'hotel-exemple.fr',
      outcome: 'qualified',
      reasons: [],
      notes: [],
      siteFacts: {
        finalUrl: 'https://hotel-exemple.fr/',
        reachability: 'ok',
        parkedPage: false,
        reservationUrl: null,
        bookingVendors: [],
        accessibilityStatementUrl: null,
        siren: null,
        siret: null,
        mentionsLegalesUrl: null,
        redirectedWithinSite: false,
      },
      evaluatedAt: new Date(),
    },
  ]);
  return candidateId;
}

describe.skipIf(!mongoAvailable)('prescans', () => {
  it('stores one prescan whole and reads back every measurement', async () => {
    const input = prescan();
    const { prescanId } = await recordPrescan(connection!, input);

    const stored = await getPrescan(connection!, prescanId);
    expect(stored?.status).toBe('complete');
    expect(stored?.pages[0]?.metrics?.mainThreadBlockingMs).toBe(410);
    expect(stored?.pages[0]?.axe?.ruleIds).toEqual(['color-contrast', 'image-alt']);
    expect(stored?.absentRoles).toEqual([{ role: 'content', reason: 'no-candidate-link' }]);
    expect(stored?.offsiteBookingLinks).toHaveLength(1);
    // Screenshot refs stay relative, so a stored prescan survives the
    // artifacts root moving.
    expect(stored?.pages[0]?.rawScreenshotRef).toBe('root-abc123/raw.png');
    expect(stored?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('round-trips strict v2 evidence while keeping a v1 document without it readable', async () => {
    const v1 = await recordPrescan(connection!, prescan({ prescanVersion: 'v1' }));
    const v2 = await recordPrescan(
      connection!,
      prescan({ prescanVersion: 'v2', evidence: completeEvidence(), pages: [] }),
    );
    expect((await getPrescan(connection!, v1.prescanId))?.evidence).toBeUndefined();
    const storedV2 = await getPrescan(connection!, v2.prescanId);
    expect(storedV2?.evidence).toEqual(completeEvidence());
    expect(storedV2?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 89 * 24 * 60 * 60 * 1000);
  });

  it('rejects a v2 record without evidence', async () => {
    await expect(recordPrescan(connection!, prescan({ prescanVersion: 'v2' }))).rejects.toThrow(
      'requires an evidence object',
    );
  });

  it('inserts rather than replacing when the same candidate is prescanned again', async () => {
    const input = prescan();
    const first = await recordPrescan(connection!, input);
    const second = await recordPrescan(connection!, {
      ...input,
      startedAt: new Date(Date.now() + 60_000),
      status: 'homepage-unreachable',
    });

    expect(second.prescanId).not.toBe(first.prescanId);
    const Model = createPrescanModel(connection!);
    const count = await Model.countDocuments({
      prescanVersion: input.prescanVersion,
      candidateId: input.candidateId,
    });
    // Both observations survive: the earlier measurements are the only thing
    // a later "did this get worse" question can be answered against.
    expect(count).toBe(2);

    const latest = await getLatestPrescan(connection!, input.candidateId, input.prescanVersion);
    expect(latest?.prescanId).toBe(second.prescanId);
  });

  // Two inserts plus two pointer writes can contend with the shared Docker
  // Mongo container's single WiredTiger checkpoint when the store suite
  // runs in parallel; the default 5000ms budget is otherwise too tight
  // under that load (issue #17).
  it('moves the candidate pointer to the newest prescan', async () => {
    const candidateId = randomUUID();
    await upsertHotelCandidates(connection!, [candidate(candidateId)]);

    const input = prescan({ candidateId });
    const first = await recordPrescan(connection!, input);
    expect(first.pointerWritten).toBe(true);

    let stored = await getHotelCandidate(connection!, candidateId);
    expect(stored?.prescan?.prescanId).toBe(first.prescanId);
    expect(stored?.prescan?.status).toBe('complete');

    const second = await recordPrescan(connection!, {
      ...input,
      status: 'blocked-by-robots',
      startedAt: new Date(Date.now() + 60_000),
    });
    stored = await getHotelCandidate(connection!, candidateId);
    expect(stored?.prescan?.prescanId).toBe(second.prescanId);
    expect(stored?.prescan?.status).toBe('blocked-by-robots');
  }, 15_000);

  it('reports a pointer it could not write rather than swallowing it', async () => {
    const result = await recordPrescan(connection!, prescan({ candidateId: randomUUID() }));
    expect(result.pointerWritten).toBe(false);
    // The evidence is still stored: writing it first is what makes the
    // missing pointer recoverable.
    expect(await getPrescan(connection!, result.prescanId)).not.toBeNull();
  });

  it('selects only qualified, eligible, own-domain candidates', async () => {
    const resolutionVersion = `rv-${randomUUID()}`;
    const qualificationVersion = `qv-${randomUUID()}`;
    const prescanVersion = `pv-${randomUUID()}`;

    const wanted = await qualifiedCandidate(resolutionVersion, qualificationVersion);

    // Qualified but below the star gate.
    await qualifiedCandidate(resolutionVersion, qualificationVersion, {
      campaignEligibility: 'parked-below-three-stars',
    });
    // Eligible but never qualified.
    const unqualified = randomUUID();
    await upsertHotelCandidates(connection!, [candidate(unqualified, { resolutionVersion })]);
    // Qualified but holds no domain of its own. Built without the field
    // rather than by overwriting it: an upsert's $set cannot express
    // "remove this", so overwriting would have left the old domain in place
    // and quietly tested nothing.
    const noDomain = randomUUID();
    const { ownRegistrableDomain: _omitted, ...withoutDomain } = candidate(noDomain, {
      resolutionVersion,
    });
    await upsertHotelCandidates(connection!, [withoutDomain]);
    await recordHotelQualifications(connection!, [
      {
        candidateId: noDomain,
        resolutionVersion,
        qualificationVersion,
        domain: null,
        outcome: 'qualified',
        reasons: [],
        notes: [],
        siteFacts: {
          finalUrl: 'https://hotel-exemple.fr/',
          reachability: 'ok',
          parkedPage: false,
          reservationUrl: null,
          bookingVendors: [],
          accessibilityStatementUrl: null,
          siren: null,
          siret: null,
          mentionsLegalesUrl: null,
          redirectedWithinSite: false,
        },
        evaluatedAt: new Date(),
      },
    ]);

    const selected = await listCandidatesToPrescan(connection!, {
      resolutionVersion,
      qualificationVersion,
      prescanVersion,
      limit: 50,
      skipAlreadyPrescanned: true,
    });
    expect(selected.map((row) => row.candidateId)).toEqual([wanted]);
  });

  it('restricts the listing to one named domain', async () => {
    const resolutionVersion = `rv-${randomUUID()}`;
    const qualificationVersion = `qv-${randomUUID()}`;
    const prescanVersion = `pv-${randomUUID()}`;

    // Two qualified candidates. Without the domain filter the listing is
    // ordered by candidateId, so which one a one-hotel batch reaches is
    // decided by a random UUID rather than by whoever authorized the scan.
    await qualifiedCandidate(resolutionVersion, qualificationVersion);
    const named = await qualifiedCandidate(resolutionVersion, qualificationVersion, {
      ownRegistrableDomain: 'hotel-nomme.fr',
    });

    const selected = await listCandidatesToPrescan(connection!, {
      resolutionVersion,
      qualificationVersion,
      prescanVersion,
      limit: 50,
      domain: 'hotel-nomme.fr',
      skipAlreadyPrescanned: true,
    });
    expect(selected.map((row) => row.candidateId)).toEqual([named]);

    const absent = await listCandidatesToPrescan(connection!, {
      resolutionVersion,
      qualificationVersion,
      prescanVersion,
      limit: 50,
      domain: 'pas-au-catalogue.fr',
      skipAlreadyPrescanned: true,
    });
    expect(absent).toEqual([]);
  });

  it('restricts a recovered batch to its persisted candidate IDs', async () => {
    const resolutionVersion = `rv-${randomUUID()}`;
    const qualificationVersion = `qv-${randomUUID()}`;
    const prescanVersion = `pv-${randomUUID()}`;
    const first = await qualifiedCandidate(resolutionVersion, qualificationVersion);
    const second = await qualifiedCandidate(resolutionVersion, qualificationVersion);
    await qualifiedCandidate(resolutionVersion, qualificationVersion);

    await recordPrescan(
      connection!,
      prescan({ candidateId: first, resolutionVersion, qualificationVersion, prescanVersion }),
    );

    const remaining = await listCandidatesToPrescan(connection!, {
      resolutionVersion,
      qualificationVersion,
      prescanVersion,
      limit: 50,
      candidateIds: [first, second],
      skipAlreadyPrescanned: true,
    });

    expect(remaining.map((row) => row.candidateId)).toEqual([second]);
  });

  it('skips a candidate already prescanned at this version, unless rescanning', async () => {
    const resolutionVersion = `rv-${randomUUID()}`;
    const qualificationVersion = `qv-${randomUUID()}`;
    const prescanVersion = `pv-${randomUUID()}`;
    const candidateId = await qualifiedCandidate(resolutionVersion, qualificationVersion);

    await recordPrescan(
      connection!,
      prescan({ candidateId, resolutionVersion, qualificationVersion, prescanVersion }),
    );

    const skipped = await listCandidatesToPrescan(connection!, {
      resolutionVersion,
      qualificationVersion,
      prescanVersion,
      limit: 50,
      skipAlreadyPrescanned: true,
    });
    expect(skipped).toHaveLength(0);

    const rescan = await listCandidatesToPrescan(connection!, {
      resolutionVersion,
      qualificationVersion,
      prescanVersion,
      limit: 50,
      skipAlreadyPrescanned: false,
    });
    expect(rescan.map((row) => row.candidateId)).toEqual([candidateId]);

    // A different prescan version is new work, not a repeat.
    const newVersion = await listCandidatesToPrescan(connection!, {
      resolutionVersion,
      qualificationVersion,
      prescanVersion: `pv-${randomUUID()}`,
      limit: 50,
      skipAlreadyPrescanned: true,
    });
    expect(newVersion.map((row) => row.candidateId)).toEqual([candidateId]);
  });

  it('pages through candidates with a resumable cursor', async () => {
    const resolutionVersion = `rv-${randomUUID()}`;
    const qualificationVersion = `qv-${randomUUID()}`;
    const prescanVersion = `pv-${randomUUID()}`;
    for (let i = 0; i < 3; i++) {
      await qualifiedCandidate(resolutionVersion, qualificationVersion);
    }

    const options = {
      resolutionVersion,
      qualificationVersion,
      prescanVersion,
      skipAlreadyPrescanned: true,
    };
    const firstPage = await listCandidatesToPrescan(connection!, { ...options, limit: 2 });
    expect(firstPage).toHaveLength(2);
    const secondPage = await listCandidatesToPrescan(connection!, {
      ...options,
      limit: 2,
      after: firstPage[1]!.candidateId,
    });
    expect(secondPage).toHaveLength(1);
    expect(secondPage[0]!.candidateId).not.toBe(firstPage[0]!.candidateId);
  });

  it('summarizes a run by outcome', async () => {
    const prescanVersion = `pv-${randomUUID()}`;
    await recordPrescan(connection!, prescan({ prescanVersion }));
    await recordPrescan(connection!, prescan({ prescanVersion, status: 'blocked-by-robots' }));
    await recordPrescan(connection!, prescan({ prescanVersion, status: 'homepage-unreachable' }));

    const summary = await getPrescanSummary(connection!, prescanVersion);
    expect(summary.total).toBe(3);
    expect(summary.byStatus).toEqual({
      complete: 1,
      'blocked-by-robots': 1,
      'homepage-unreachable': 1,
    });
    expect(summary.byEvidenceStatus).toEqual({ complete: 0, incomplete: 0, missing: 3 });
  });

  it('summarizes evidence-complete and evidence-incomplete records', async () => {
    const prescanVersion = `pv-${randomUUID()}`;
    await recordPrescan(connection!, prescan({ prescanVersion, evidence: completeEvidence() }));
    await recordPrescan(
      connection!,
      prescan({
        prescanVersion,
        evidence: {
          schemaVersion: HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
          status: 'incomplete',
          renderComparison: { state: 'omitted', reason: 'no-material-render-gap' },
          specificFailure: { state: 'omitted', reason: 'no-eligible-failure' },
          summaries: [],
        },
      }),
    );
    expect((await getPrescanSummary(connection!, prescanVersion)).byEvidenceStatus).toEqual({
      complete: 1,
      incomplete: 1,
      missing: 0,
    });
  });
});
