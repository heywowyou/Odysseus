import { describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  upsertDirectoryEntries: vi.fn(async (_connection: unknown, entries: unknown[]) => ({
    created: entries.length,
    updated: 0,
  })),
}));

import type { HotelSourceRecord } from '@odysseus/core';
import { upsertDirectoryEntries } from '@odysseus/store';
import type { HotelCatalogueSource } from './hotel-catalogue-source.js';
import { importDirectory } from './import-directory.js';

function record(sourceId: string, postcode: string, declaredWebsite?: string): HotelSourceRecord {
  return {
    source: 'atout-france',
    sourceId,
    sourceVersion: 'v1',
    retrievedAt: new Date('2026-09-23T00:00:00Z'),
    licence: 'Licence Ouverte',
    name: `Hotel ${sourceId}`,
    postcode,
    accommodationType: 'Hôtel de tourisme',
    ...(declaredWebsite === undefined ? {} : { declaredWebsite }),
  } as HotelSourceRecord;
}

function sourceOf(records: HotelSourceRecord[]): HotelCatalogueSource {
  return {
    name: 'atout-france',
    licence: 'Licence Ouverte',
    fingerprint: () => 'v1',
    counters: () => ({ rowsRead: records.length, accepted: records.length }),
    async *read() {
      for (const item of records) yield { record: item, filePath: '/x.csv', byteOffset: 0 };
    },
  } as unknown as HotelCatalogueSource;
}

describe('importDirectory', () => {
  /** Operator decision 2026-09-23: France and the EU only. */
  it('leaves hotels in French territories outside the EU out of the directory', async () => {
    const report = await importDirectory(
      {} as never,
      sourceOf([
        record('paris', '75017', 'grandhotelchicago.paris'),
        record('reunion', '97400', 'hotel.re'),
        record('noumea', '98800', 'hotelchateauroyal.nc'),
        record('papeete', '98714'),
      ]),
    );

    const written = vi.mocked(upsertDirectoryEntries).mock.calls[0]?.[1] ?? [];
    expect(written.map((entry) => entry.postcode)).toEqual(['75017', '97400']);
    expect(report).toMatchObject({ rowsRead: 4, written: 2, skipped: 2, outsideEu: 2 });
  });
});
