import { describe, it, expect, vi } from 'vitest';
import type { HotelSireneJoin, HotelSiteFacts } from '@odysseus/core';
import type { HotelCandidateDocument, RecordHotelQualificationInput } from '@odysseus/store';
import type { HotelSireneJoiner } from '../hotel-identity/hotel-sirene-join.js';
import {
  qualifyHotels,
  QUALIFY_BATCH_SIZE,
  type HotelQualificationStorePort,
} from './qualify-hotels.js';

function candidate(overrides: Partial<HotelCandidateDocument> = {}): HotelCandidateDocument {
  const candidateId = overrides.candidateId ?? `c-${Math.random().toString(36).slice(2, 10)}`;
  return {
    candidateId,
    resolutionVersion: 'v1',
    identityKey: `domain:${candidateId}.fr`,
    identityStatus: 'unmatched',
    sourceRefs: [],
    name: 'Hôtel Exemple',
    normalizedName: 'hotel exemple',
    starRating: 3,
    campaignEligibility: 'eligible',
    websiteCandidates: [],
    ownRegistrableDomain: `${candidateId}.fr`,
    groupStatus: 'independent',
    conflicts: [],
    review: { state: 'not-required' },
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 1_000),
    ...overrides,
  } as HotelCandidateDocument;
}

function healthy(overrides: Partial<HotelSiteFacts> = {}): HotelSiteFacts {
  return {
    finalUrl: 'https://example.fr/',
    reachability: 'ok',
    parkedPage: false,
    reservationUrl: 'https://example.fr/reserver',
    bookingVendors: [],
    accessibilityStatementUrl: null,
    siren: '552100554',
    siret: null,
    mentionsLegalesUrl: 'https://example.fr/mentions-legales',
    redirectedWithinSite: false,
    ...overrides,
  };
}

/** Records what it was asked about, so a test can assert the pass only spends
 *  an INSEE lookup when the site probe actually came back with an identifier. */
function fakeJoiner(join: (siren: string | undefined) => HotelSireneJoin): HotelSireneJoiner & {
  readonly asked: Array<string | undefined>;
} {
  const asked: Array<string | undefined> = [];
  return {
    asked,
    stockVersion: 'stock-test',
    join: (siren) => {
      asked.push(siren);
      return join(siren);
    },
  };
}

/** An in-memory port, the same choice resolve-hotels.test.ts makes: the risk in
 *  this file is batching, concurrency, and the loss arithmetic, none of which
 *  is database access. */
class FakeStore implements HotelQualificationStorePort {
  readonly recorded: RecordHotelQualificationInput[] = [];
  readonly pageRequests: Array<{ after?: string; limit: number; skip: boolean }> = [];

  constructor(private readonly candidates: HotelCandidateDocument[]) {}

  async listCandidatesToQualify(options: {
    resolutionVersion: string;
    limit: number;
    after?: string;
    skipAlreadyQualified: boolean;
    qualificationVersion: string;
  }): Promise<HotelCandidateDocument[]> {
    this.pageRequests.push({
      limit: options.limit,
      skip: options.skipAlreadyQualified,
      ...(options.after === undefined ? {} : { after: options.after }),
    });
    const sorted = [...this.candidates].sort((a, b) => a.candidateId.localeCompare(b.candidateId));
    const eligible = sorted.filter((row) => {
      if (options.after !== undefined && row.candidateId <= options.after) return false;
      if (
        options.skipAlreadyQualified &&
        row.qualification?.qualificationVersion === options.qualificationVersion
      ) {
        return false;
      }
      return true;
    });
    return eligible.slice(0, options.limit);
  }

  async record(
    inputs: RecordHotelQualificationInput[],
  ): Promise<{ created: number; updated: number }> {
    this.recorded.push(...inputs);
    return { created: inputs.length, updated: 0 };
  }
}

function run(
  store: HotelQualificationStorePort,
  checkSite: (domain: string) => Promise<HotelSiteFacts>,
  overrides: Partial<Parameters<typeof qualifyHotels>[0]> = {},
) {
  return qualifyHotels({
    store,
    checkSite,
    resolutionVersion: 'v1',
    qualificationVersion: 'qv1',
    concurrency: 3,
    resume: false,
    dryRun: false,
    ...overrides,
  });
}

describe('qualifyHotels', () => {
  it('evaluates every candidate and records one input each', async () => {
    const store = new FakeStore([candidate(), candidate(), candidate()]);
    const report = await run(store, async () => healthy());

    expect(report.candidatesEvaluated).toBe(3);
    expect(report.byOutcome.qualified).toBe(3);
    expect(store.recorded).toHaveLength(3);
    expect(report.reconciles).toBe(true);
  });

  it('mixes outcomes and counts every reason independently of them', async () => {
    const store = new FakeStore([
      candidate({ candidateId: 'a', starRating: 2 }),
      candidate({ candidateId: 'b', groupStatus: 'group-member' }),
      candidate({ candidateId: 'c' }),
      candidate({ candidateId: 'd' }),
    ]);
    const report = await run(store, async (domain) =>
      domain === 'd.fr' ? healthy({ reachability: 'dns-unresolved' }) : healthy(),
    );

    expect(report.byOutcome).toEqual({
      qualified: 1,
      parked: 1,
      rejected: 1,
      'already-engaged': 0,
      'group-routed': 1,
    });
    expect(report.byReason).toEqual({
      'below-three-stars': 1,
      'group-member': 1,
      'dns-unresolved': 1,
    });
    expect(report.qualifiedUsableOwnDomains).toBe(1);
    expect(report.reconciles).toBe(true);
  });

  it('counts the deferred booking note separately from the outcome', async () => {
    const store = new FakeStore([candidate(), candidate()]);
    const report = await run(store, async () => healthy({ reservationUrl: null }));

    expect(report.byOutcome.qualified).toBe(2);
    expect(report.byNote['no-booking-path-detected']).toBe(2);
  });

  it('never requests a site for a candidate with no own domain', async () => {
    const checkSite = vi.fn(async () => healthy());
    const withoutDomain = candidate();
    delete (withoutDomain as { ownRegistrableDomain?: string }).ownRegistrableDomain;
    const store = new FakeStore([withoutDomain]);
    const report = await run(store, checkSite);

    expect(checkSite).not.toHaveBeenCalled();
    expect(report.byOutcome.rejected).toBe(1);
    expect(report.byReason['no-own-domain']).toBe(1);
  });

  describe('dry run', () => {
    it('contacts nobody, writes nothing, and reports the request budget', async () => {
      const checkSite = vi.fn(async () => healthy());
      const noDomain = candidate();
      delete (noDomain as { ownRegistrableDomain?: string }).ownRegistrableDomain;
      const store = new FakeStore([candidate(), candidate(), noDomain]);
      const report = await run(store, checkSite, { dryRun: true });

      expect(checkSite).not.toHaveBeenCalled();
      expect(store.recorded).toEqual([]);
      expect(report.dryRun).toBe(true);
      expect(report.plan?.candidatesConsidered).toBe(3);
      expect(report.plan?.wouldFetch).toBe(2);
      expect(report.plan?.decidedWithoutRequest).toBe(1);
    });

    it('claims no outcome it did not observe', async () => {
      // The defect this replaced: running the real decision against a synthetic
      // "not attempted" site fact reported every hotel with a good domain as
      // having none, and did it with full confidence.
      const store = new FakeStore([candidate(), candidate()]);
      const report = await run(store, async () => healthy(), { dryRun: true });

      expect(report.byOutcome).toEqual({
        qualified: 0,
        parked: 0,
        rejected: 0,
        'already-engaged': 0,
        'group-routed': 0,
      });
      expect(report.byReason).toEqual({});
    });

    it('decides no Overpass question from a run that measured nothing', async () => {
      const store = new FakeStore([candidate()]);
      const report = await run(store, async () => healthy(), { dryRun: true });
      expect(report.overpass).toBeNull();
    });

    it('counts the population a real run will be read against', async () => {
      const store = new FakeStore([
        candidate({ groupStatus: 'group-member' }),
        candidate({ groupStatus: 'vendor-hosted' }),
        candidate({ campaignEligibility: 'parked-below-three-stars', starRating: 2 }),
        candidate({ review: { state: 'pending', queuedReason: 'identity-needs-review' } }),
      ]);
      const report = await run(store, async () => healthy(), { dryRun: true });

      expect(report.plan?.population).toEqual({
        groupMember: 1,
        vendorHosted: 1,
        belowThreeStars: 1,
        unknownStarRating: 0,
        awaitingReview: 1,
      });
    });
  });

  describe('bounds and paging', () => {
    it('stops at the limit rather than at the page boundary', async () => {
      const store = new FakeStore(
        Array.from({ length: 10 }, (_, index) => candidate({ candidateId: `c${index}` })),
      );
      const report = await run(store, async () => healthy(), { limit: 4 });

      expect(report.candidatesEvaluated).toBe(4);
      expect(store.recorded).toHaveLength(4);
      expect(store.pageRequests[0]?.limit).toBe(4);
    });

    it('pages with a cursor rather than re-reading from the start', async () => {
      const store = new FakeStore(
        Array.from({ length: QUALIFY_BATCH_SIZE + 5 }, (_, index) =>
          candidate({ candidateId: `c${String(index).padStart(4, '0')}` }),
        ),
      );
      const report = await run(store, async () => healthy());

      expect(report.candidatesEvaluated).toBe(QUALIFY_BATCH_SIZE + 5);
      expect(store.pageRequests).toHaveLength(2);
      expect(store.pageRequests[0]?.after).toBeUndefined();
      expect(store.pageRequests[1]?.after).toBeDefined();
    });

    it('asks the store to skip already-qualified candidates when resuming', async () => {
      const store = new FakeStore([
        candidate({
          candidateId: 'a',
          qualification: {
            outcome: 'qualified',
            qualificationVersion: 'qv1',
            evaluatedAt: new Date(),
          },
        }),
        candidate({ candidateId: 'b' }),
      ]);
      const report = await run(store, async () => healthy(), { resume: true });

      expect(store.pageRequests[0]?.skip).toBe(true);
      expect(report.candidatesEvaluated).toBe(1);
      expect(store.recorded[0]?.candidateId).toBe('b');
    });

    it('terminates on an empty catalogue', async () => {
      const report = await run(new FakeStore([]), async () => healthy());
      expect(report.candidatesEvaluated).toBe(0);
      expect(report.reconciles).toBe(true);
    });
  });

  describe('the Overpass decision', () => {
    it('proposes when qualified own-domain yield falls short', async () => {
      const store = new FakeStore([candidate()]);
      const report = await run(store, async () => healthy());
      expect(report.qualifiedUsableOwnDomains).toBe(1);
      expect(report.overpass).toBe('propose');
    });
  });

  it('reports progress as it goes rather than only at the end', async () => {
    const onProgress = vi.fn();
    const store = new FakeStore([candidate(), candidate()]);
    await run(store, async () => healthy(), { onProgress });
    expect(onProgress).toHaveBeenCalledWith(2);
  });

  describe('the Sirene join', () => {
    it('asks INSEE with the identifier this probe read off the page', async () => {
      const joiner = fakeJoiner(() => ({
        status: 'matched',
        stockVersion: 'stock-test',
        denomination: 'HOTEL EXEMPLE',
        naf: '55.10Z',
        effectifBandCode: '21',
        etatAdministratif: 'A',
        checkedAt: new Date(),
      }));
      const store = new FakeStore([candidate({ candidateId: 'a' })]);
      await run(store, async () => healthy({ siren: '552100554' }), { sireneJoiner: joiner });

      expect(joiner.asked).toEqual(['552100554']);
      expect(store.recorded[0]?.sireneJoin?.status).toBe('matched');
    });

    it('does not ask when the probe recovered no identifier', async () => {
      const joiner = fakeJoiner(() => ({
        status: 'no-identifier',
        stockVersion: 'stock-test',
        checkedAt: new Date(),
      }));
      const store = new FakeStore([candidate({ candidateId: 'a' })]);
      await run(store, async () => healthy({ siren: null }), { sireneJoiner: joiner });

      // Not "asked and told there is none": nobody was asked at all, and the
      // record says so by carrying no join rather than an absent-looking one.
      expect(joiner.asked).toEqual([]);
      expect(store.recorded[0]?.sireneJoin).toBeUndefined();
    });

    it('records no join at all when the run has no joiner', async () => {
      const store = new FakeStore([candidate({ candidateId: 'a' })]);
      await run(store, async () => healthy());
      expect(store.recorded[0]?.sireneJoin).toBeUndefined();
    });

    it('feeds the matched size band into the verdict', async () => {
      // The effectif rule needs both halves, and before the join reached this
      // pass the band was always absent, so it could never fire.
      const joiner = fakeJoiner(() => ({
        status: 'matched',
        stockVersion: 'stock-test',
        denomination: 'HOTEL EXEMPLE',
        naf: '55.10Z',
        effectifBandCode: '02',
        etatAdministratif: 'A',
        checkedAt: new Date(),
      }));
      const store = new FakeStore([candidate({ candidateId: 'a', capacity: 6 })]);
      const report = await run(store, async () => healthy(), { sireneJoiner: joiner });

      expect(store.recorded[0]?.reasons).toContain('microenterprise-scope-unresolved');
      expect(report.byOutcome.parked).toBe(1);
    });

    it('leaves the verdict unchanged when the company is not in the qualifying set', async () => {
      const joiner = fakeJoiner(() => ({
        status: 'siren-not-in-qualifying-sirene-set',
        stockVersion: 'stock-test',
        checkedAt: new Date(),
      }));
      const store = new FakeStore([candidate({ candidateId: 'a', capacity: 6 })]);
      const report = await run(store, async () => healthy(), { sireneJoiner: joiner });

      // A join that found nothing is not evidence of size, so the effectif rule
      // stays silent rather than reading the miss as "small".
      expect(store.recorded[0]?.reasons).not.toContain('microenterprise-scope-unresolved');
      expect(report.byOutcome.qualified).toBe(1);
      expect(store.recorded[0]?.sireneJoin?.status).toBe('siren-not-in-qualifying-sirene-set');
    });
  });

  it('stores the site evidence alongside the verdict', async () => {
    const store = new FakeStore([candidate({ candidateId: 'a' })]);
    await run(store, async () => healthy({ finalUrl: 'https://a.fr/accueil' }));
    expect(store.recorded[0]?.siteFacts.finalUrl).toBe('https://a.fr/accueil');
    expect(store.recorded[0]?.qualificationVersion).toBe('qv1');
  });
});
