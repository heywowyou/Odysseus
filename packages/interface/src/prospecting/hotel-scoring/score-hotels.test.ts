import { describe, expect, it, vi } from 'vitest';
import type {
  HotelCandidateDocument,
  PrescanDocument,
  RecordHotelScoreInput,
} from '@odysseus/store';
import { HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION } from '@odysseus/core';
import type { HotelPrescanEvidence, HotelSireneJoin, HotelSiteFacts } from '@odysseus/core';
import {
  CURRENT_SCORING_VERSION,
  scoreHotels,
  type HotelScoringStorePort,
} from './score-hotels.js';

function candidate(
  id: string,
  overrides: Partial<HotelCandidateDocument> = {},
): HotelCandidateDocument {
  return {
    candidateId: id,
    resolutionVersion: 'rv1',
    identityKey: `domain:hotel-${id}.fr`,
    identityStatus: 'unmatched',
    sourceRefs: [],
    name: `Hôtel ${id}`,
    normalizedName: `hotel ${id}`,
    starRating: 4,
    capacity: 60,
    campaignEligibility: 'eligible',
    websiteCandidates: [],
    ownRegistrableDomain: `hotel-${id}.fr`,
    groupStatus: 'independent',
    qualification: { outcome: 'qualified', qualificationVersion: 'qv2', evaluatedAt: new Date() },
    prescan: {
      prescanId: `prescan-${id}`,
      prescanVersion: 'pv2',
      status: 'complete',
      prescannedAt: new Date(),
    },
    conflicts: [],
    review: { state: 'not-required' },
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  } as unknown as HotelCandidateDocument;
}

const completeEvidence: HotelPrescanEvidence = {
  schemaVersion: HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
  status: 'complete',
  renderComparison: {
    state: 'captured',
    ref: `evidence/${'a'.repeat(64)}.png`,
    sha256: 'a'.repeat(64),
    mimeType: 'image/png',
    byteSize: 1000,
    width: 1200,
    height: 800,
    pageRole: 'homepage',
    factRef: `fact_${'b'.repeat(24)}`,
    altText: { fr: 'x', en: 'x' },
    selectionReason: 'material-render-gap',
  },
  specificFailure: {
    state: 'captured',
    ref: `evidence/${'c'.repeat(64)}.png`,
    sha256: 'c'.repeat(64),
    mimeType: 'image/png',
    byteSize: 900,
    width: 240,
    height: 160,
    pageRole: 'booking',
    factRef: `fact_${'d'.repeat(24)}`,
    altText: { fr: 'x', en: 'x' },
    selectionReason: 'booking-call-to-action',
  },
  summaries: [
    {
      observation: { fr: 'a', en: 'a' },
      severity: 'critical',
      wcagCriteria: ['4.1.2'],
      pageRole: 'booking',
    },
    {
      observation: { fr: 'b', en: 'b' },
      severity: 'serious',
      wcagCriteria: ['1.4.3'],
      pageRole: 'homepage',
    },
    {
      observation: { fr: 'c', en: 'c' },
      severity: 'moderate',
      wcagCriteria: ['2.5.8'],
      pageRole: 'homepage',
    },
  ],
};

function prescan(id: string, overrides: Partial<PrescanDocument> = {}): PrescanDocument {
  return {
    prescanId: `prescan-${id}`,
    candidateId: id,
    resolutionVersion: 'rv1',
    qualificationVersion: 'qv2',
    prescanVersion: 'pv2',
    scanJobId: 'job-1',
    domain: `hotel-${id}.fr`,
    startUrl: `https://hotel-${id}.fr/`,
    status: 'complete',
    pages: [
      {
        role: 'homepage',
        url: `https://hotel-${id}.fr/`,
        missingPercent: 63,
        consoleErrorCount: 12,
        axe: {
          violationCount: 9,
          byImpact: { critical: 3, serious: 6, moderate: 0, minor: 0 },
          ruleIds: ['button-name'],
          affectedElementCount: 9,
        },
        durationMs: 3000,
      },
    ],
    absentRoles: [],
    offsiteBookingLinks: [],
    robotsTxtFound: true,
    effectiveDelayMs: 1000,
    artifactsDir: 'x',
    browserVersion: 'Chromium/1',
    startedAt: new Date(),
    durationMs: 3000,
    evidence: completeEvidence,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  } as unknown as PrescanDocument;
}

/** A v1 prescan: recorded before the evidence contract existed, so the field
 *  is absent rather than present and incomplete. */
function withoutEvidence(row: PrescanDocument): PrescanDocument {
  const { evidence: _evidence, ...rest } = row;
  return rest as PrescanDocument;
}

interface StubOptions {
  candidates: HotelCandidateDocument[];
  prescans?: Record<string, PrescanDocument | null>;
  siteFacts?: HotelSiteFacts | null;
  sireneJoin?: HotelSireneJoin;
  alreadyScored?: string[];
}

function stubStore(options: StubOptions): {
  store: HotelScoringStorePort;
  recorded: RecordHotelScoreInput[];
} {
  const recorded: RecordHotelScoreInput[] = [];
  const store: HotelScoringStorePort = {
    listCandidatesToScore: async ({ limit, after }) => {
      const start =
        after === undefined
          ? 0
          : options.candidates.findIndex((row) => row.candidateId === after) + 1;
      return options.candidates.slice(start, start + limit);
    },
    getPrescan: async (prescanId) => {
      // An explicit null means expired, so it must not fall through to the
      // default measurement the way `??` would.
      if (options.prescans !== undefined && prescanId in options.prescans) {
        return options.prescans[prescanId] ?? null;
      }
      return prescan(prescanId.replace('prescan-', ''));
    },
    getQualificationFacts: async () =>
      options.siteFacts === undefined || options.siteFacts === null
        ? null
        : {
            site: options.siteFacts,
            ...(options.sireneJoin !== undefined ? { sireneJoin: options.sireneJoin } : {}),
          },
    findScoredCandidateIds: async () => new Set(options.alreadyScored ?? []),
    recordScores: async (inputs) => {
      recorded.push(...inputs);
      return { inserted: inputs.length };
    },
  };
  return { store, recorded };
}

const baseOptions = {
  resolutionVersion: 'rv1',
  qualificationVersion: 'qv2',
  prescanVersion: 'pv2',
  scoringVersion: CURRENT_SCORING_VERSION,
  rescoreAll: false,
  dryRun: false,
};

describe('scoreHotels', () => {
  it('scores a prescanned hotel and records one immutable score', async () => {
    const { store, recorded } = stubStore({ candidates: [candidate('1')] });
    const report = await scoreHotels({ ...baseOptions, store });

    expect(report.scored).toBe(1);
    expect(report.worthy).toBe(1);
    expect(report.approved).toBe(true);
    expect(report.reconciles).toBe(true);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.evidenceComplete).toBe(true);
    expect(recorded[0]?.score.brokenness.total).toBe(30 + 25 + 20 + 12 + 8);
    // Four stars, capacity, independence; no reservation path and no effectif.
    expect(recorded[0]?.score.ability.total).toBe(20 + 15 + 15);
  });

  it('reads the reservation path from the stored qualification', async () => {
    const { store, recorded } = stubStore({
      candidates: [candidate('1')],
      siteFacts: { reachability: 'ok', reservationUrl: 'https://hotel-1.fr/reserver' },
    });
    await scoreHotels({ ...baseOptions, store });
    expect(recorded[0]?.score.ability.total).toBe(30 + 20 + 15 + 15);
  });

  it('feeds v4 prescan booking kinds into the operator-approved v2 configuration', async () => {
    // v2 was approved on 2026-09-08 for plan 034, so the run reports approved:
    // approval gates cohort selection, never the scoring run itself.
    const { store, recorded } = stubStore({
      candidates: [candidate('1')],
      prescans: {
        'prescan-1': prescan('1', {
          prescanVersion: 'v4',
          pages: [
            {
              role: 'homepage',
              url: 'https://hotel-1.fr/',
              bookingEvidenceKinds: ['delegated-booking-single-property'],
              durationMs: 3000,
            },
          ],
        }),
      },
    });

    const report = await scoreHotels({
      ...baseOptions,
      scoringVersion: 'hotel-outreach-v2',
      prescanVersion: 'v4',
      store,
    });

    expect(report.approved).toBe(true);
    expect(
      recorded[0]?.score.ability.components.find((part) => part.id === 'direct-booking'),
    ).toEqual({
      id: 'direct-booking',
      points: 30,
      reason: 'direct-booking-detected-by-prescan',
    });
  });

  it('reads the company size band from the stored qualification, not the candidate', async () => {
    // The identifier only exists once the qualification pass has fetched the
    // hotel's own page, so this is the only document that can carry it.
    const { store, recorded } = stubStore({
      candidates: [candidate('1')],
      siteFacts: { reachability: 'ok' },
      sireneJoin: {
        status: 'matched',
        stockVersion: 'stock-test',
        denomination: 'HOTEL EXEMPLE',
        naf: '55.10Z',
        effectifBandCode: '21',
        etatAdministratif: 'A',
        checkedAt: new Date(),
      },
    });
    await scoreHotels({ ...baseOptions, store });
    expect(recorded[0]?.score.ability.total).toBe(20 + 15 + 20 + 15);
  });

  it('writes nothing on a dry run and reports the population it would score', async () => {
    const { store, recorded } = stubStore({
      candidates: [candidate('1'), candidate('2'), candidate('3')],
      alreadyScored: ['2'],
    });
    const report = await scoreHotels({ ...baseOptions, store, dryRun: true });

    expect(recorded).toHaveLength(0);
    expect(report.scored).toBe(0);
    expect(report.brokennessBands).toEqual({});
    expect(report.plan).toEqual({
      candidatesConsidered: 3,
      wouldScore: 2,
      alreadyScored: 1,
      prescanMissing: 0,
    });
    expect(report.reconciles).toBe(true);
  });

  it('skips candidates already scored at this version unless rescoring', async () => {
    const skipping = stubStore({ candidates: [candidate('1')], alreadyScored: ['1'] });
    const skipped = await scoreHotels({ ...baseOptions, store: skipping.store });
    expect(skipped.scored).toBe(0);
    expect(skipped.skipped['already-scored']).toBe(1);
    expect(skipping.recorded).toHaveLength(0);

    const rescoring = stubStore({ candidates: [candidate('1')], alreadyScored: ['1'] });
    const rescored = await scoreHotels({
      ...baseOptions,
      store: rescoring.store,
      rescoreAll: true,
    });
    expect(rescored.scored).toBe(1);
    expect(rescoring.recorded).toHaveLength(1);
  });

  it('counts an expired prescan as a skip rather than failing the run', async () => {
    const { store, recorded } = stubStore({
      candidates: [candidate('1'), candidate('2')],
      prescans: { 'prescan-1': null },
    });
    const report = await scoreHotels({ ...baseOptions, store });
    expect(report.skipped['prescan-missing']).toBe(1);
    expect(report.scored).toBe(1);
    expect(report.reconciles).toBe(true);
    expect(recorded).toHaveLength(1);
  });

  it('stops at the limit', async () => {
    const candidates = Array.from({ length: 5 }, (_unused, index) => candidate(String(index)));
    const { store, recorded } = stubStore({ candidates });
    const report = await scoreHotels({ ...baseOptions, store, limit: 2 });
    expect(report.candidatesConsidered).toBe(2);
    expect(recorded).toHaveLength(2);
  });

  it('refuses an unknown scoring version rather than scoring with a default', async () => {
    const { store } = stubStore({ candidates: [candidate('1')] });
    await expect(
      scoreHotels({ ...baseOptions, store, scoringVersion: 'hotel-outreach-v9' }),
    ).rejects.toThrow(/Unknown hotel outreach/);
  });

  it('treats a v1 prescan with no evidence as unworthy rather than throwing', async () => {
    const { store, recorded } = stubStore({
      candidates: [candidate('1')],
      prescans: { 'prescan-1': withoutEvidence(prescan('1')) },
    });
    const report = await scoreHotels({ ...baseOptions, store });
    expect(report.worthy).toBe(0);
    expect(recorded[0]?.evidenceComplete).toBe(false);
  });

  it('reports progress as it goes', async () => {
    const onProgress = vi.fn();
    const { store } = stubStore({ candidates: [candidate('1')] });
    await scoreHotels({ ...baseOptions, store, onProgress });
    expect(onProgress).toHaveBeenCalledWith(1);
  });
});
