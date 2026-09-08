import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { HotelCandidate } from '@odysseus/core';
import type { HotelCandidateDocument, HotelSourceRecordDocument } from '@odysseus/store';
import { resolveHotels, type HotelCandidateStorePort } from './resolve-hotels.js';

/**
 * In-memory stand-in for the Mongo-backed store. It reproduces exactly the
 * three behaviours resolveHotels depends on - a replayable stream, a candidate
 * listing per resolution version, and an upsert keyed on
 * (resolutionVersion, identityKey) - so this suite tests the grouping and
 * identity rules without a database. The real collection semantics are covered
 * by store's own integration tests.
 */
class FakeHotelCandidateStore implements HotelCandidateStorePort {
  private readonly records: HotelSourceRecordDocument[] = [];
  readonly candidates = new Map<string, HotelCandidateDocument>();

  seed(rows: HotelSourceRecordDocument[]): void {
    this.records.push(...rows);
  }

  async *streamSourceRecords(ingestRunId: string): AsyncIterable<HotelSourceRecordDocument> {
    for (const record of this.records.filter((r) => r.ingestRunId === ingestRunId)) {
      yield record;
    }
  }

  listCandidates(resolutionVersion: string): Promise<HotelCandidateDocument[]> {
    return Promise.resolve(
      [...this.candidates.values()].filter((c) => c.resolutionVersion === resolutionVersion),
    );
  }

  upsert(inputs: HotelCandidate[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    for (const input of inputs) {
      const key = `${input.resolutionVersion}\u0000${input.identityKey}`;
      const existing = this.candidates.get(key);
      if (existing === undefined) {
        created += 1;
        this.candidates.set(key, {
          ...input,
          createdAt: new Date(),
          updatedAt: new Date(),
          expiresAt: new Date(),
        });
        continue;
      }
      updated += 1;
      // Mirrors the real helper: refreshable facts win, identity and review are
      // kept, and sourceRefs and conflicts append rather than replace.
      this.candidates.set(key, {
        ...existing,
        ...input,
        candidateId: existing.candidateId,
        review: existing.review,
        sourceRefs: [...existing.sourceRefs, ...input.sourceRefs],
        conflicts: [...existing.conflicts, ...input.conflicts],
        updatedAt: new Date(),
      });
    }
    return Promise.resolve({ created, updated });
  }

  list(resolutionVersion: string): HotelCandidateDocument[] {
    return [...this.candidates.values()].filter((c) => c.resolutionVersion === resolutionVersion);
  }
}

let runId = '';
let resolutionVersion = '';
let store: FakeHotelCandidateStore;

beforeEach(() => {
  runId = randomUUID();
  resolutionVersion = randomUUID();
  store = new FakeHotelCandidateStore();
});

function sourceRow(
  overrides: Partial<HotelSourceRecordDocument> & { sourceId: string },
): HotelSourceRecordDocument {
  return {
    ingestRunId: runId,
    source: 'atout-france',
    sourceVersion: 'size:mtime',
    retrievedAt: new Date(),
    licence: 'fr-lo',
    name: `Hôtel ${overrides.sourceId}`,
    postcode: '38000',
    commune: 'GRENOBLE',
    accommodationType: 'HÔTEL DE TOURISME',
    starRating: 3,
    campaignEligibility: 'eligible',
    warnings: [],
    createdAt: new Date(),
    expiresAt: new Date(),
    ...overrides,
  };
}

function seed(rows: HotelSourceRecordDocument[]): void {
  store.seed(rows);
}

describe('resolveHotels', () => {
  it('treats a domain held by one establishment as an independent hotel', async () => {
    seed([sourceRow({ sourceId: 'a', declaredWebsite: 'https://www.hotel-a.fr/' })]);
    const report = await resolveHotels({ store, ingestRunId: runId, resolutionVersion });

    expect(report.groups.byStatus.independent).toBe(1);
    expect(report.campaignReady).toBe(1);
    const [stored] = store.list(resolutionVersion);
    expect(stored?.ownRegistrableDomain).toBe('hotel-a.fr');
    expect(stored?.identityKey).toBe('domain:hotel-a.fr');
    expect(stored?.accommodationType).toBe('HÔTEL DE TOURISME');
    expect(stored?.review.state).toBe('not-required');
  });

  it('labels twelve establishments on one corporate domain as a chain, and keeps all twelve', async () => {
    // The defect this whole two-pass design exists to prevent: a single
    // streaming pass would write the first of these as an independent hotel
    // holding the chain's domain, then discover the truth eleven rows later.
    seed(
      Array.from({ length: 12 }, (_, i) =>
        sourceRow({
          sourceId: `chain-${i}`,
          name: `Campanile ${i}`,
          declaredWebsite: 'https://www.campanile.com/fr/hotels/campanile-grenoble',
        }),
      ),
    );
    const report = await resolveHotels({ store, ingestRunId: runId, resolutionVersion });

    expect(report.groups.byStatus['group-member']).toBe(12);
    expect(report.groups.largestGroup).toEqual({ domain: 'campanile.com', size: 12 });
    expect(report.campaignReady).toBe(0);

    const stored = store.list(resolutionVersion);
    expect(stored).toHaveLength(12);
    for (const candidate of stored) {
      expect(candidate.groupStatus).toBe('group-member');
      expect(candidate.groupDomain).toBe('campanile.com');
      expect(candidate.ownRegistrableDomain).toBeUndefined();
      // Keyed by its own source row, never by the shared domain: keying on the
      // domain would merge twelve establishments into one.
      expect(candidate.identityKey).toBe(
        `source:atout-france:${candidate.sourceRefs[0]?.sourceId}`,
      );
    }
  });

  it('sends independents sharing a vendor platform to review rather than calling them a chain', async () => {
    // Three independent hotels on one marketing federation's site look exactly
    // like a chain to a counter. Only the curated vendor list tells them apart.
    seed(
      Array.from({ length: 3 }, (_, i) =>
        sourceRow({
          sourceId: `logis-${i}`,
          declaredWebsite: `https://www.logishotels.com/fr/hotel/le-relais-${i}`,
        }),
      ),
    );
    const report = await resolveHotels({ store, ingestRunId: runId, resolutionVersion });

    expect(report.groups.byStatus['vendor-hosted']).toBe(3);
    expect(report.groups.byStatus['group-member']).toBe(0);
    expect(report.review.queued).toBe(3);
    expect(report.review.byReason['vendor-hosted-on-logishotels.com']).toBe(3);

    const stored = store.list(resolutionVersion);
    expect(stored.every((c) => c.review.state === 'pending')).toBe(true);
    expect(stored.every((c) => c.groupStatus === 'vendor-hosted')).toBe(true);
  });

  it('keeps builder subdomains apart instead of fusing them into one platform group', async () => {
    seed([
      sourceRow({ sourceId: 'w1', declaredWebsite: 'https://hotelhavane.wixsite.com/monsite' }),
      sourceRow({ sourceId: 'w2', declaredWebsite: 'https://hotel-lebaudiere.wixsite.com/site' }),
    ]);
    const report = await resolveHotels({ store, ingestRunId: runId, resolutionVersion });

    expect(report.groups.byStatus['vendor-hosted']).toBe(2);
    const stored = store.list(resolutionVersion);
    expect(new Set(stored.map((c) => c.groupDomain)).size).toBe(2);
  });

  it('queues a hotel with no declared website, and one whose website is unusable', async () => {
    seed([
      sourceRow({ sourceId: 'none' }),
      sourceRow({ sourceId: 'prose', declaredWebsite: 'pas encore en ligne' }),
      sourceRow({ sourceId: 'typo', declaredWebsite: 'https:/villa-port-antibes.com' }),
    ]);
    const report = await resolveHotels({ store, ingestRunId: runId, resolutionVersion });

    expect(report.websites.noneDeclared).toBe(1);
    expect(report.websites.unusable).toBe(2);
    expect(report.websites.unusableByReason).toEqual({ 'not-a-url': 1, 'malformed-url': 1 });
    expect(report.review.byReason['no-website-declared']).toBe(1);
    // The two unusable rows are queued under distinct reasons, so review can
    // tell a fixable typo from a hotel that has no site at all.
    expect(report.review.byReason['declared-website-malformed-url']).toBe(1);
    expect(report.review.byReason['declared-website-not-a-url']).toBe(1);
    expect(report.campaignReady).toBe(0);
  });

  it('excludes a two-star independent from the campaign-ready count but still stores it', async () => {
    seed([
      sourceRow({
        sourceId: 'two-star',
        starRating: 2,
        campaignEligibility: 'parked-below-three-stars',
        declaredWebsite: 'https://www.petit-hotel.fr',
      }),
    ]);
    const report = await resolveHotels({ store, ingestRunId: runId, resolutionVersion });
    expect(report.groups.byStatus.independent).toBe(1);
    expect(report.campaignReady).toBe(0);
    expect(store.list(resolutionVersion)).toHaveLength(1);
  });

  it('merges a later ingest run into the existing candidate rather than duplicating it', async () => {
    seed([sourceRow({ sourceId: 'a', declaredWebsite: 'https://www.hotel-a.fr/' })]);
    const first = await resolveHotels({ store, ingestRunId: runId, resolutionVersion });
    expect(first.created).toBe(1);

    const secondRun = randomUUID();
    seed([
      {
        ...sourceRow({ sourceId: 'a', declaredWebsite: 'https://www.hotel-a.fr/nouvelle-page' }),
        ingestRunId: secondRun,
        sourceVersion: 'size2:mtime2',
        starRating: 4,
      },
    ]);
    const second = await resolveHotels({
      store,
      ingestRunId: secondRun,
      resolutionVersion,
    });

    expect(second.created).toBe(0);
    expect(second.identity.resolved).toBe(1);
    const stored = store.list(resolutionVersion);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.starRating).toBe(4);
    expect(stored[0]?.sourceRefs).toHaveLength(2);
  });

  it('writes nothing on a dry run but still reports the full classification', async () => {
    seed([
      sourceRow({ sourceId: 'a', declaredWebsite: 'https://www.hotel-a.fr/' }),
      sourceRow({ sourceId: 'b', declaredWebsite: 'https://www.campanile.com/x' }),
      sourceRow({ sourceId: 'c', declaredWebsite: 'https://www.campanile.com/y' }),
    ]);
    const report = await resolveHotels({
      store,
      ingestRunId: runId,
      resolutionVersion,
      dryRun: true,
    });

    expect(report.sourceRecordsRead).toBe(3);
    expect(report.groups.byStatus['group-member']).toBe(2);
    expect(report.created).toBe(0);
    expect(store.list(resolutionVersion)).toHaveLength(0);
  });

  it('honours a limit and reports only what it read', async () => {
    seed(
      Array.from({ length: 5 }, (_, i) =>
        sourceRow({ sourceId: `l${i}`, declaredWebsite: `https://www.hotel-${i}.fr` }),
      ),
    );
    const report = await resolveHotels({
      store,
      ingestRunId: runId,
      resolutionVersion,
      limit: 2,
    });
    expect(report.sourceRecordsRead).toBe(2);
    expect(store.list(resolutionVersion)).toHaveLength(2);
  });

  it('does not let a row match the candidate built from that same row', async () => {
    // Measured against the real national export: a second resolve reported
    // 3,820 needs-review links, every one of them a source row matching itself
    // on name and postcode through the candidate the first resolve created.
    seed([
      sourceRow({ sourceId: 'a', declaredWebsite: 'https://www.hotel-a.fr/' }),
      sourceRow({ sourceId: 'b' }),
    ]);
    await resolveHotels({ store, ingestRunId: runId, resolutionVersion });
    const again = await resolveHotels({ store, ingestRunId: runId, resolutionVersion });

    expect(again.identity['needs-review']).toBe(0);
    expect(again.identity.resolved).toBe(2);
    for (const stored of store.list(resolutionVersion)) {
      expect(stored.conflicts).toEqual([]);
    }
  });

  it('still queues a genuine name and postcode collision between two hotels', async () => {
    seed([
      sourceRow({ sourceId: 'a', name: 'Hôtel des Voyageurs', declaredWebsite: 'https://a.fr/' }),
      sourceRow({ sourceId: 'b', name: 'Hotel des Voyageurs', declaredWebsite: 'https://b.fr/' }),
    ]);
    const report = await resolveHotels({ store, ingestRunId: runId, resolutionVersion });

    expect(report.identity['needs-review']).toBe(1);
    expect(report.review.byReason['identity-needs-review']).toBe(1);
  });

  it('is idempotent: resolving the same run twice does not double the catalogue', async () => {
    seed([
      sourceRow({ sourceId: 'a', declaredWebsite: 'https://www.hotel-a.fr/' }),
      sourceRow({ sourceId: 'b', declaredWebsite: 'https://www.hotel-b.fr/' }),
    ]);
    await resolveHotels({ store, ingestRunId: runId, resolutionVersion });
    const again = await resolveHotels({ store, ingestRunId: runId, resolutionVersion });
    expect(again.created).toBe(0);
    expect(store.list(resolutionVersion)).toHaveLength(2);
  });
});
