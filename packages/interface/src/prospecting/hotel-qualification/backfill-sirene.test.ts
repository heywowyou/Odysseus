import { describe, expect, it } from 'vitest';
import type {
  HotelCandidateDocument,
  HotelQualificationDocument,
  RecordHotelQualificationInput,
} from '@odysseus/store';
import type { HotelSireneJoin, HotelSiteFacts } from '@odysseus/core';
import type { HotelSireneJoiner } from '../hotel-identity/hotel-sirene-join.js';
import {
  backfillSirene,
  type BackfillSireneOptions,
  type BackfillSireneStorePort,
} from './backfill-sirene.js';

function candidate(id: string, overrides: Partial<HotelCandidateDocument> = {}) {
  return {
    candidateId: id,
    resolutionVersion: 'rv1',
    identityKey: `domain:${id}.fr`,
    identityStatus: 'unmatched',
    sourceRefs: [],
    name: `Hôtel ${id}`,
    normalizedName: `hotel ${id}`,
    starRating: 3,
    capacity: 60,
    campaignEligibility: 'eligible',
    websiteCandidates: [],
    ownRegistrableDomain: `${id}.fr`,
    groupStatus: 'independent',
    conflicts: [],
    review: { state: 'not-required' },
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  } as unknown as HotelCandidateDocument;
}

function row(
  id: string,
  overrides: Partial<HotelQualificationDocument> = {},
): HotelQualificationDocument {
  return {
    qualificationId: `q-${id}`,
    candidateId: id,
    resolutionVersion: 'rv1',
    qualificationVersion: 'v2',
    domain: `${id}.fr`,
    outcome: 'qualified',
    reasons: [],
    notes: [],
    siteFacts: { reachability: 'ok' } as HotelSiteFacts,
    evaluatedAt: new Date('2026-08-28T00:00:00Z'),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  } as unknown as HotelQualificationDocument;
}

/** A row whose site probe recovered an identifier. */
function withSiren(id: string, siren: string, overrides: Partial<HotelQualificationDocument> = {}) {
  return row(id, {
    siteFacts: { reachability: 'ok', siren } as HotelSiteFacts,
    ...overrides,
  });
}

function joiner(
  bySiren: Record<string, HotelSireneJoin>,
  stockVersion: string | null = 'stock-test',
): HotelSireneJoiner {
  return {
    stockVersion,
    join: (siren) =>
      bySiren[siren ?? ''] ?? {
        status: 'siren-not-in-qualifying-sirene-set',
        ...(stockVersion === null ? {} : { stockVersion }),
        checkedAt: new Date('2026-08-29T00:00:00Z'),
      },
  };
}

function matched(effectifBandCode?: string): HotelSireneJoin {
  return {
    status: 'matched',
    stockVersion: 'stock-test',
    denomination: 'HOTEL EXEMPLE',
    naf: '55.10Z',
    ...(effectifBandCode === undefined ? {} : { effectifBandCode }),
    etatAdministratif: 'A',
    checkedAt: new Date('2026-08-29T00:00:00Z'),
  };
}

function stubStore(
  rows: HotelQualificationDocument[],
  candidates: HotelCandidateDocument[],
): { store: BackfillSireneStorePort; written: RecordHotelQualificationInput[] } {
  const written: RecordHotelQualificationInput[] = [];
  const store: BackfillSireneStorePort = {
    listQualifications: async ({ limit, after }) => {
      const start = after === undefined ? 0 : rows.findIndex((r) => r.candidateId === after) + 1;
      return rows.slice(start, start + limit);
    },
    getCandidates: async (ids) => candidates.filter((c) => ids.includes(c.candidateId)),
    record: async (inputs) => {
      written.push(...inputs);
      return { created: inputs.length, updated: 0 };
    },
  };
  return { store, written };
}

const base: Omit<BackfillSireneOptions, 'store' | 'sireneJoiner'> = {
  resolutionVersion: 'rv1',
  fromVersion: 'v2',
  toVersion: 'v3',
  dryRun: false,
};

describe('backfillSirene', () => {
  it('writes one row out for every row in, so the new generation is complete', async () => {
    const rows = [row('1'), withSiren('2', '111'), row('3')];
    const { store, written } = stubStore(
      rows,
      rows.map((r) => candidate(r.candidateId)),
    );
    const report = await backfillSirene({
      ...base,
      store,
      sireneJoiner: joiner({ '111': matched('21') }),
    });

    expect(report.rowsRead).toBe(3);
    expect(report.rowsWritten).toBe(3);
    expect(written).toHaveLength(3);
    expect(written.every((input) => input.qualificationVersion === 'v3')).toBe(true);
  });

  it('copies a row with no identifier forward verbatim and records no join', async () => {
    const source = row('1', { outcome: 'parked', reasons: ['below-three-stars'] });
    const { store, written } = stubStore([source], [candidate('1')]);
    const report = await backfillSirene({ ...base, store, sireneJoiner: joiner({}) });

    expect(report.rowsWithIdentifier).toBe(0);
    expect(report.copiedForward).toBe(1);
    expect(written[0]?.sireneJoin).toBeUndefined();
    expect(written[0]?.outcome).toBe('parked');
    expect(written[0]?.reasons).toEqual(['below-three-stars']);
    // Carried, not restamped: the verdict was not re-taken today.
    expect(written[0]?.evaluatedAt).toEqual(source.evaluatedAt);
  });

  it('stores a join that changes nothing, because a miss is still a fact', async () => {
    const { store, written } = stubStore([withSiren('1', '999')], [candidate('1')]);
    const report = await backfillSirene({ ...base, store, sireneJoiner: joiner({}) });

    expect(report.byJoinStatus['siren-not-in-qualifying-sirene-set']).toBe(1);
    expect(report.rowsRedecided).toBe(0);
    expect(written[0]?.sireneJoin?.status).toBe('siren-not-in-qualifying-sirene-set');
    expect(written[0]?.outcome).toBe('qualified');
  });

  it('parks a small hotel once INSEE supplies the band that was missing', async () => {
    // A small band plus a small capacity is the pair the effectif rule needs,
    // and neither half alone is evidence of size.
    const { store, written } = stubStore(
      [withSiren('1', '111')],
      [candidate('1', { capacity: 6 })],
    );
    const report = await backfillSirene({
      ...base,
      store,
      sireneJoiner: joiner({ '111': matched('02') }),
    });

    expect(report.rowsRedecided).toBe(1);
    expect(report.outcomeChanges).toEqual({ 'qualified->parked': 1 });
    expect(written[0]?.outcome).toBe('parked');
    expect(written[0]?.reasons).toContain('microenterprise-scope-unresolved');
  });

  it('leaves a hotel qualified when the band clears the threshold', async () => {
    const { store, written } = stubStore(
      [withSiren('1', '111')],
      [candidate('1', { capacity: 6 })],
    );
    const report = await backfillSirene({
      ...base,
      store,
      sireneJoiner: joiner({ '111': matched('21') }),
    });

    expect(report.rowsRedecided).toBe(1);
    expect(report.outcomeChanges).toEqual({});
    expect(written[0]?.outcome).toBe('qualified');
  });

  it('keeps the adopted-domain note on a row it re-decides', async () => {
    // The reconciliation pass passes domainAdoptedAfterRedirect in and it is
    // never stored as a field, so re-deciding without recovering it from the
    // stored notes would erase the record that the campaign is about to reach
    // this hotel at an address its catalogue never published.
    const source = withSiren('1', '111', { notes: ['domain-adopted-after-redirect'] });
    const { store, written } = stubStore([source], [candidate('1')]);
    await backfillSirene({ ...base, store, sireneJoiner: joiner({ '111': matched('21') }) });

    expect(written[0]?.notes).toContain('domain-adopted-after-redirect');
  });

  it('refuses to run without the stock file rather than writing empty answers', async () => {
    const { store, written } = stubStore([withSiren('1', '111')], [candidate('1')]);
    await expect(
      backfillSirene({ ...base, store, sireneJoiner: joiner({}, null) }),
    ).rejects.toThrow(/needs the INSEE stock file/);
    expect(written).toHaveLength(0);
  });

  it('refuses to rewrite a generation in place', async () => {
    const { store } = stubStore([row('1')], [candidate('1')]);
    await expect(
      backfillSirene({ ...base, store, toVersion: 'v2', sireneJoiner: joiner({}) }),
    ).rejects.toThrow(/not rewrite/);
  });

  it('writes nothing on a dry run but reports the outcomes it would write', async () => {
    // Legitimate here, unlike in qualifyHotels: nothing is observed, so a
    // projected outcome is the real one rather than a guess from synthetic
    // probe facts.
    const { store, written } = stubStore(
      [withSiren('1', '111'), row('2')],
      [candidate('1', { capacity: 6 }), candidate('2')],
    );
    const report = await backfillSirene({
      ...base,
      store,
      dryRun: true,
      sireneJoiner: joiner({ '111': matched('02') }),
    });

    expect(written).toHaveLength(0);
    expect(report.rowsWritten).toBe(0);
    expect(report.rowsRead).toBe(2);
    expect(report.outcomeChanges).toEqual({ 'qualified->parked': 1 });
    expect(report.byOutcome).toMatchObject({ qualified: 1, parked: 1 });
  });

  it('pages through a generation larger than one batch', async () => {
    const rows = Array.from({ length: 250 }, (_unused, index) =>
      row(String(index).padStart(3, '0')),
    );
    const { store, written } = stubStore(
      rows,
      rows.map((r) => candidate(r.candidateId)),
    );
    const report = await backfillSirene({ ...base, store, sireneJoiner: joiner({}) });

    expect(report.rowsRead).toBe(250);
    expect(written).toHaveLength(250);
  });
});
