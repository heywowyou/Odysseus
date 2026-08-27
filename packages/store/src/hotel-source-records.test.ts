import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  insertHotelSourceRecords,
  getHotelSourceYield,
  listHotelSourceRecords,
  type NewHotelSourceRecordInput,
} from './hotel-source-records.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

type OptionalRecordField = 'declaredWebsite' | 'starRating' | 'roomCount' | 'capacity';

/** Drops a field entirely rather than setting it to undefined: under
 *  exactOptionalPropertyTypes an absent field and a field holding undefined
 *  are different types, and absent is what the adapters actually produce. */
function withoutFields(
  record: NewHotelSourceRecordInput,
  fields: OptionalRecordField[],
): NewHotelSourceRecordInput {
  const copy = { ...record };
  for (const field of fields) delete copy[field];
  return copy;
}

function baseRecord(overrides: Partial<NewHotelSourceRecordInput> = {}): NewHotelSourceRecordInput {
  return {
    ingestRunId: 'run-1',
    source: 'atout-france',
    sourceId: 'atout-france:1',
    sourceVersion: 'size:mtime',
    retrievedAt: new Date(),
    licence: 'fr-lo',
    name: 'Hôtel de la Plage',
    address: '2 Rue Gabriel Péri',
    postcode: '38000',
    commune: 'GRENOBLE',
    declaredWebsite: 'https://example.fr/',
    accommodationType: 'HÔTEL DE TOURISME',
    starRating: 3,
    roomCount: 37,
    capacity: 62,
    campaignEligibility: 'eligible',
    warnings: [],
    ...overrides,
  };
}

describe.skipIf(!mongoAvailable)('hotel source records', () => {
  it('inserts records with a 90 day expiresAt', async () => {
    const runId = randomUUID();
    const result = await insertHotelSourceRecords(connection!, [
      baseRecord({ ingestRunId: runId }),
    ]);

    expect(result).toEqual({ inserted: 1, duplicatesSkipped: 0 });

    const [stored] = await listHotelSourceRecords(connection!, { ingestRunId: runId });
    expect(stored?.name).toBe('Hôtel de la Plage');
    const expectedExpiryMs = stored!.createdAt.getTime() + 90 * 24 * 60 * 60 * 1000;
    expect(stored!.expiresAt.getTime()).toBe(expectedExpiryMs);
  });

  it('preserves missing optional fields as absent rather than as a sentinel', async () => {
    const runId = randomUUID();
    await insertHotelSourceRecords(connection!, [
      withoutFields(
        baseRecord({ ingestRunId: runId, campaignEligibility: 'parked-unknown-rating' }),
        ['declaredWebsite', 'starRating', 'roomCount'],
      ),
    ]);

    const [stored] = await listHotelSourceRecords(connection!, { ingestRunId: runId });
    expect(stored?.declaredWebsite).toBeUndefined();
    expect(stored?.starRating).toBeUndefined();
    expect(stored?.roomCount).toBeUndefined();
    expect(stored?.campaignEligibility).toBe('parked-unknown-rating');
  });

  it('makes a resumed run idempotent instead of doubling the catalogue', async () => {
    const runId = randomUUID();
    const rows = [
      baseRecord({ ingestRunId: runId, sourceId: 'a' }),
      baseRecord({ ingestRunId: runId, sourceId: 'b' }),
    ];
    await insertHotelSourceRecords(connection!, rows);

    const replayed = await insertHotelSourceRecords(connection!, [
      ...rows,
      baseRecord({ ingestRunId: runId, sourceId: 'c' }),
    ]);

    expect(replayed).toEqual({ inserted: 1, duplicatesSkipped: 2 });
    const stored = await listHotelSourceRecords(connection!, { ingestRunId: runId });
    expect(stored).toHaveLength(3);
  });

  it('keeps two versions of the same establishment as separate observations', async () => {
    const firstRun = randomUUID();
    const secondRun = randomUUID();
    await insertHotelSourceRecords(connection!, [
      baseRecord({ ingestRunId: firstRun, sourceId: 'same', sourceVersion: 'v1', starRating: 3 }),
    ]);
    await insertHotelSourceRecords(connection!, [
      baseRecord({ ingestRunId: secondRun, sourceId: 'same', sourceVersion: 'v2', starRating: 4 }),
    ]);

    const first = await listHotelSourceRecords(connection!, { ingestRunId: firstRun });
    const second = await listHotelSourceRecords(connection!, { ingestRunId: secondRun });
    expect(first[0]?.starRating).toBe(3);
    expect(second[0]?.starRating).toBe(4);
  });

  it('reports the yield split the Overpass decision depends on', async () => {
    const runId = randomUUID();
    await insertHotelSourceRecords(connection!, [
      baseRecord({ ingestRunId: runId, sourceId: 'e1' }),
      baseRecord({ ingestRunId: runId, sourceId: 'e2' }),
      withoutFields(baseRecord({ ingestRunId: runId, sourceId: 'e3' }), ['declaredWebsite']),
      baseRecord({
        ingestRunId: runId,
        sourceId: 'p1',
        starRating: 2,
        campaignEligibility: 'parked-below-three-stars',
      }),
      withoutFields(
        baseRecord({
          ingestRunId: runId,
          sourceId: 'u1',
          campaignEligibility: 'parked-unknown-rating',
        }),
        ['starRating', 'declaredWebsite'],
      ),
    ]);

    const summary = await getHotelSourceYield(connection!, runId);
    expect(summary.total).toBe(5);
    expect(summary.byEligibility).toEqual({
      eligible: 3,
      'parked-below-three-stars': 1,
      'parked-unknown-rating': 1,
    });
    expect(summary.withDeclaredWebsite).toBe(3);
    expect(summary.eligibleWithDeclaredWebsite).toBe(2);
  });
});
