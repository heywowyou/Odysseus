import { describe, expect, it, vi } from 'vitest';
import { HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION } from '@odysseus/core';
import type { HotelCandidateDocument, RecordPrescanInput } from '@odysseus/store';
import {
  CURRENT_PRESCAN_VERSION,
  prescanHotels,
  type HotelPrescanStorePort,
  type PrescanHotelsOptions,
} from './prescan-hotels.js';

function candidate(id: string, domain = `hotel-${id}.fr`): HotelCandidateDocument {
  return {
    candidateId: id,
    resolutionVersion: 'rv1',
    identityKey: `domain:${domain}`,
    identityStatus: 'unmatched',
    sourceRefs: [],
    name: `Hôtel ${id}`,
    normalizedName: `hotel ${id}`,
    starRating: 3,
    campaignEligibility: 'eligible',
    websiteCandidates: [],
    ownRegistrableDomain: domain,
    groupStatus: 'independent',
    conflicts: [],
    review: { state: 'not-required' },
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
  } as unknown as HotelCandidateDocument;
}

type Measured = Awaited<ReturnType<PrescanHotelsOptions['prescan']>>;

const incompleteEvidence: NonNullable<Measured['evidence']> = {
  schemaVersion: HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
  status: 'incomplete',
  renderComparison: { state: 'omitted', reason: 'no-material-render-gap' },
  specificFailure: { state: 'omitted', reason: 'no-eligible-failure' },
  summaries: [],
};

function measurement(overrides: Partial<Measured> = {}): Measured {
  return {
    domain: 'hotel-1.fr',
    startUrl: 'https://hotel-1.fr/',
    status: 'complete',
    pages: [
      { role: 'homepage', url: 'https://hotel-1.fr/', durationMs: 4000 },
      { role: 'booking', url: 'https://hotel-1.fr/reserver', durationMs: 3000 },
    ],
    absentRoles: [{ role: 'content', reason: 'no-candidate-link' }],
    offsiteBookingLinks: [],
    robotsTxtFound: true,
    effectiveDelayMs: 1000,
    artifactsDir: 'hotel-1.fr/2026-08-27T10-00-00Z',
    browserVersion: '140.0.0.0',
    startedAt: new Date(),
    durationMs: 9000,
    evidence: incompleteEvidence,
    ...overrides,
  };
}

/** A store whose candidate list is a fixed array, paged by the cursor the
 *  real one uses, so paging and the skip rule are exercised rather than
 *  stubbed away. */
function fakeStore(candidates: HotelCandidateDocument[]): {
  port: HotelPrescanStorePort;
  recorded: RecordPrescanInput[];
  prescannedIds: Set<string>;
} {
  const recorded: RecordPrescanInput[] = [];
  const prescannedIds = new Set<string>();
  return {
    recorded,
    prescannedIds,
    port: {
      listCandidatesToPrescan: async ({ limit, after, skipAlreadyPrescanned, domain }) => {
        let rows = [...candidates].sort((a, b) => a.candidateId.localeCompare(b.candidateId));
        if (after !== undefined) rows = rows.filter((row) => row.candidateId > after);
        if (domain !== undefined) rows = rows.filter((row) => row.ownRegistrableDomain === domain);
        if (skipAlreadyPrescanned) rows = rows.filter((row) => !prescannedIds.has(row.candidateId));
        return rows.slice(0, limit);
      },
      record: async (input) => {
        recorded.push(input);
        prescannedIds.add(input.candidateId);
        return { prescanId: `prescan-${recorded.length}`, pointerWritten: true };
      },
    },
  };
}

function options(overrides: Partial<PrescanHotelsOptions> = {}): PrescanHotelsOptions {
  const store = fakeStore([candidate('a'), candidate('b'), candidate('c')]);
  return {
    store: store.port,
    prescan: async () => measurement(),
    scanJobId: 'job-1',
    resolutionVersion: 'rv1',
    qualificationVersion: 'qv1',
    prescanVersion: 'pv1',
    concurrency: 2,
    rescan: false,
    dryRun: false,
    ...overrides,
  };
}

describe('prescanHotels', () => {
  // Pinned on purpose, so a bump is a decision rather than a diff nobody
  // reads. v4 (2026-09-08) adds unresolved booking controls and bounded
  // delegated-booking checks; older records did not measure them.
  it('uses the booking-evidence-bearing prescan v4 contract', () => {
    expect(CURRENT_PRESCAN_VERSION).toBe('v4');
  });

  it('prescans every selected candidate and records one document each', async () => {
    const store = fakeStore([candidate('a'), candidate('b'), candidate('c')]);
    const report = await prescanHotels(options({ store: store.port }));

    expect(report.candidatesPrescanned).toBe(3);
    expect(report.byStatus.complete).toBe(3);
    expect(report.byEvidenceStatus).toEqual({ complete: 0, incomplete: 3, missing: 0 });
    expect(store.recorded).toHaveLength(3);
    expect(report.reconciles).toBe(true);
  });

  it('stamps every record with the run identity the caller supplied', async () => {
    const store = fakeStore([candidate('a')]);
    await prescanHotels(options({ store: store.port }));

    expect(store.recorded[0]).toMatchObject({
      candidateId: 'a',
      resolutionVersion: 'rv1',
      qualificationVersion: 'qv1',
      prescanVersion: 'pv1',
      scanJobId: 'job-1',
    });
  });

  it('reports pages actually loaded, not sites visited', async () => {
    const store = fakeStore([candidate('a'), candidate('b')]);
    const report = await prescanHotels(options({ store: store.port }));
    // Two pages per site in the fixture measurement.
    expect(report.pagesLoaded).toBe(4);
  });

  it('stops at the limit rather than prescanning the whole population', async () => {
    const many = Array.from({ length: 20 }, (_, i) => candidate(`c${String(i).padStart(2, '0')}`));
    const store = fakeStore(many);
    const prescan = vi.fn(async () => measurement());

    const report = await prescanHotels(options({ store: store.port, prescan, limit: 5 }));
    expect(report.candidatesPrescanned).toBe(5);
    expect(prescan).toHaveBeenCalledTimes(5);
  });

  it('a dry run visits nothing and writes nothing', async () => {
    const store = fakeStore([candidate('a'), candidate('b')]);
    const prescan = vi.fn(async () => measurement());

    const report = await prescanHotels(options({ store: store.port, prescan, dryRun: true }));

    expect(prescan).not.toHaveBeenCalled();
    expect(store.recorded).toEqual([]);
    // Outcomes stay at zero: a run nobody performed has no outcomes, and
    // reporting some would be a confident wrong number.
    expect(report.byStatus).toEqual({
      complete: 0,
      'blocked-by-robots': 0,
      'homepage-unreachable': 0,
    });
    expect(report.byEvidenceStatus).toEqual({ complete: 0, incomplete: 0, missing: 0 });
    expect(report.plan).toEqual({
      candidatesConsidered: 2,
      wouldPrescan: 2,
      maxPagesLoaded: 6,
    });
  });

  it('skips candidates already prescanned at this version, and rescan overrides it', async () => {
    const store = fakeStore([candidate('a'), candidate('b')]);
    await prescanHotels(options({ store: store.port }));
    expect(store.recorded).toHaveLength(2);

    const second = await prescanHotels(options({ store: store.port }));
    expect(second.candidatesPrescanned).toBe(0);

    const forced = await prescanHotels(options({ store: store.port, rescan: true }));
    expect(forced.candidatesPrescanned).toBe(2);
    expect(store.recorded).toHaveLength(4);
  });

  it('counts a failed prescan without persisting an empty measurement', async () => {
    const store = fakeStore([candidate('a'), candidate('b')]);
    const prescan = vi.fn(async (subject: HotelCandidateDocument) => {
      if (subject.candidateId === 'a') throw new Error('browser crashed');
      return measurement();
    });

    const report = await prescanHotels(options({ store: store.port, prescan }));

    expect(report.failures).toBe(1);
    expect(report.candidatesPrescanned).toBe(2);
    expect(store.recorded.map((row) => row.candidateId)).toEqual(['b']);
    // Failures are part of the arithmetic, so a batch that loses hotels to
    // crashes still adds up.
    expect(report.reconciles).toBe(true);
  });

  it('one hotel failing does not end the batch', async () => {
    const many = Array.from({ length: 6 }, (_, i) => candidate(`c${i}`));
    const store = fakeStore(many);
    const prescan = vi.fn(async (subject: HotelCandidateDocument) => {
      if (subject.candidateId === 'c0') throw new Error('nope');
      return measurement();
    });

    const report = await prescanHotels(options({ store: store.port, prescan }));
    expect(report.candidatesPrescanned).toBe(6);
    expect(report.failures).toBe(1);
    expect(report.byStatus.complete).toBe(5);
  });

  it('counts every prescan status separately', async () => {
    const store = fakeStore([candidate('a'), candidate('b'), candidate('c')]);
    const statuses = ['complete', 'blocked-by-robots', 'homepage-unreachable'] as const;
    let index = 0;
    const prescan = vi.fn(async () => measurement({ status: statuses[index++]! }));

    const report = await prescanHotels(options({ store: store.port, prescan }));
    expect(report.byStatus).toEqual({
      complete: 1,
      'blocked-by-robots': 1,
      'homepage-unreachable': 1,
    });
  });

  it('surfaces a pointer that could not be written', async () => {
    const store = fakeStore([candidate('a')]);
    const port: HotelPrescanStorePort = {
      ...store.port,
      record: async (input) => {
        store.recorded.push(input);
        store.prescannedIds.add(input.candidateId);
        return { prescanId: 'p1', pointerWritten: false };
      },
    };

    const report = await prescanHotels(options({ store: port }));
    expect(report.pointersMissed).toBe(1);
  });

  it('runs lanes concurrently without exceeding the configured concurrency', async () => {
    const many = Array.from({ length: 9 }, (_, i) => candidate(`c${i}`));
    const store = fakeStore(many);
    let inFlight = 0;
    let peak = 0;
    const prescan = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return measurement();
    });

    await prescanHotels(options({ store: store.port, prescan, concurrency: 3 }));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(3);
  });

  // Issue #5: each candidate used to be measured, buffered into a
  // whole-batch array, and only written once every lane in the batch had
  // finished - peak memory tracked PRESCAN_BATCH_SIZE (100), not
  // `concurrency`. record() is now called from inside each lane as soon as
  // its own candidate resolves, so at most `concurrency` results are ever
  // measured-but-unwritten at once, regardless of batch size.
  it('persists each candidate as its own lane finishes it, never buffering a whole batch unwritten', async () => {
    const many = Array.from({ length: 9 }, (_, i) => candidate(`c${i}`));
    const store = fakeStore(many);
    let unwritten = 0;
    let peakUnwritten = 0;
    const prescan = vi.fn(async () => {
      unwritten += 1;
      peakUnwritten = Math.max(peakUnwritten, unwritten);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return measurement();
    });
    const port: HotelPrescanStorePort = {
      ...store.port,
      record: async (input) => {
        unwritten -= 1;
        store.recorded.push(input);
        store.prescannedIds.add(input.candidateId);
        return { prescanId: `prescan-${store.recorded.length}`, pointerWritten: true };
      },
    };

    await prescanHotels(options({ store: port, prescan, concurrency: 3 }));

    expect(peakUnwritten).toBeLessThanOrEqual(3);
    expect(store.recorded).toHaveLength(9);
  });

  it('reports progress as it goes', async () => {
    const store = fakeStore(Array.from({ length: 4 }, (_, i) => candidate(`c${i}`)));
    const seen: number[] = [];
    await prescanHotels(options({ store: store.port, onProgress: (n) => seen.push(n) }));
    expect(seen.at(-1)).toBe(4);
  });

  it('visits only the named domain, not whichever candidate sorts first', async () => {
    // The reason this option exists: the listing is ordered by candidateId, so
    // a one-hotel batch expressed as a limit alone lands on 'a'. An
    // authorization is for a named site, and this is what makes the command
    // honour that rather than merely stay small.
    const store = fakeStore([candidate('a'), candidate('b'), candidate('c')]);
    const visited: string[] = [];
    const report = await prescanHotels(
      options({
        store: store.port,
        domain: 'hotel-c.fr',
        prescan: async (row) => {
          visited.push(row.ownRegistrableDomain as string);
          return measurement();
        },
      }),
    );

    expect(visited).toEqual(['hotel-c.fr']);
    expect(report.candidatesPrescanned).toBe(1);
  });

  it('contacts nobody when the named domain matches no qualified candidate', async () => {
    const store = fakeStore([candidate('a'), candidate('b')]);
    const visited: string[] = [];
    const report = await prescanHotels(
      options({
        store: store.port,
        domain: 'not-in-the-catalogue.fr',
        prescan: async (row) => {
          visited.push(row.ownRegistrableDomain as string);
          return measurement();
        },
      }),
    );

    expect(visited).toEqual([]);
    expect(report.candidatesPrescanned).toBe(0);
    expect(store.recorded).toEqual([]);
  });
});
