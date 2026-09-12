import { describe, expect, it } from 'vitest';
import type {
  HotelCandidateDocument,
  PrescanDocument,
  RecordHotelScoreInput,
} from '@odysseus/store';
import { CURRENT_SCORING_VERSION, type HotelScoringStorePort } from './score-hotels.js';
import { scoreHotelOnDemand } from './score-on-demand.js';

// Issue #199: the wave add actions score the hotel they added through this
// helper, so its whole job is mapping one bounded scoring run onto the
// three outcomes those actions can state.

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
    name: `Hotel ${id}`,
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

function prescan(id: string): PrescanDocument {
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
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
  } as unknown as PrescanDocument;
}

interface StubOptions {
  candidates: HotelCandidateDocument[];
  prescans?: Record<string, PrescanDocument | null>;
  alreadyScored?: string[];
  failOnList?: boolean;
}

function stubStore(options: StubOptions): {
  store: HotelScoringStorePort;
  recorded: RecordHotelScoreInput[];
  listCalls: unknown[];
} {
  const recorded: RecordHotelScoreInput[] = [];
  const listCalls: unknown[] = [];
  const store: HotelScoringStorePort = {
    listCandidatesToScore: async (query) => {
      listCalls.push(query);
      if (options.failOnList === true) throw new Error('store unavailable');
      return options.candidates.filter((row) => row.ownRegistrableDomain === query.domain);
    },
    getPrescan: async (prescanId) => {
      if (options.prescans !== undefined && prescanId in options.prescans) {
        return options.prescans[prescanId] ?? null;
      }
      return prescan(prescanId.replace('prescan-', ''));
    },
    getQualificationFacts: async () => null,
    findScoredCandidateIds: async () => new Set(options.alreadyScored ?? []),
    recordScores: async (inputs) => {
      recorded.push(...inputs);
      return { inserted: inputs.length };
    },
  };
  return { store, recorded, listCalls };
}

const versions = {
  resolutionVersion: 'rv1',
  qualificationVersion: 'qv2',
  prescanVersion: 'pv2',
  scoringVersion: CURRENT_SCORING_VERSION,
};

describe('scoreHotelOnDemand (issue #199)', () => {
  it('scores the named hotel and records one immutable row', async () => {
    const { store, recorded, listCalls } = stubStore({ candidates: [candidate('cand-1')] });
    const outcome = await scoreHotelOnDemand(store, 'hotel-cand-1.fr', versions);
    expect(outcome).toEqual({ outcome: 'scored' });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.candidateId).toBe('cand-1');
    expect(listCalls[0]).toMatchObject({ domain: 'hotel-cand-1.fr', limit: 1 });
  });

  it('reports already-scored without writing a second row', async () => {
    const { store, recorded } = stubStore({
      candidates: [candidate('cand-1')],
      alreadyScored: ['cand-1'],
    });
    const outcome = await scoreHotelOnDemand(store, 'hotel-cand-1.fr', versions);
    expect(outcome).toEqual({ outcome: 'already-scored' });
    expect(recorded).toHaveLength(0);
  });

  it('skips with prescan-missing when the pointer names an expired prescan', async () => {
    const { store, recorded } = stubStore({
      candidates: [candidate('cand-1')],
      prescans: { 'prescan-cand-1': null },
    });
    const outcome = await scoreHotelOnDemand(store, 'hotel-cand-1.fr', versions);
    expect(outcome).toEqual({ outcome: 'skipped', reason: 'prescan-missing' });
    expect(recorded).toHaveLength(0);
  });

  // Issue #202: 1924 HOTEL's own case - a real prescan pointer, but the
  // prescan itself never reached real site content. This must not read as
  // "already scored" or "not in the scoring population"; it is its own
  // distinct, correctly-named outcome.
  it('skips with prescan-incomplete when the pointer names an unresolved interstitial', async () => {
    const { store, recorded } = stubStore({
      candidates: [
        candidate('cand-1', {
          prescan: {
            prescanId: 'prescan-cand-1',
            prescanVersion: 'pv2',
            status: 'homepage-interstitial-unresolved',
            prescannedAt: new Date(),
          },
        }),
      ],
    });
    const outcome = await scoreHotelOnDemand(store, 'hotel-cand-1.fr', versions);
    expect(outcome).toEqual({ outcome: 'skipped', reason: 'prescan-incomplete' });
    expect(recorded).toHaveLength(0);
  });

  it('skips with not-in-scoring-population when no candidate matches the domain', async () => {
    const { store } = stubStore({ candidates: [] });
    const outcome = await scoreHotelOnDemand(store, 'hotel-cand-1.fr', versions);
    expect(outcome).toEqual({ outcome: 'skipped', reason: 'not-in-scoring-population' });
  });

  it('skips with error, carrying the message, when the store faults', async () => {
    const { store } = stubStore({ candidates: [], failOnList: true });
    const outcome = await scoreHotelOnDemand(store, 'hotel-cand-1.fr', versions);
    expect(outcome).toEqual({
      outcome: 'skipped',
      reason: 'error',
      errorMessage: 'store unavailable',
    });
  });
});
