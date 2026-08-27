import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HotelSourceRecord } from '@odysseus/core';
import { createAtoutFranceSource } from './atout-france-reader.js';

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'atout-france-sample.csv',
);

async function readAll(): Promise<{
  records: HotelSourceRecord[];
  source: ReturnType<typeof createAtoutFranceSource>;
}> {
  const source = createAtoutFranceSource({ filePath: fixturePath });
  const records: HotelSourceRecord[] = [];
  for await (const emission of source.read()) records.push(emission.record);
  return { records, source };
}

describe('createAtoutFranceSource', () => {
  it('keeps only the hotel typology', async () => {
    const { records, source } = await readAll();
    expect(records.map((record) => record.name)).toEqual([
      '1924 HÔTEL',
      '5 TERRES HÔTEL & SPA',
      'HÔTEL DU PORT',
      'HÔTEL SANS CLASSEMENT LISIBLE',
      'HOTEL AVEC GUILLEMETS',
      'HÔTEL SANS SCHÉMA',
    ]);
    expect(source.counters().skipped['not-a-hotel-typology']).toBe(1);
  });

  it('decodes accents, so an encoding regression fails here not in production', async () => {
    const { records } = await readAll();
    expect(records[0]?.address).toBe('2 Rue Gabriel Péri');
    expect(records[2]?.commune).toBe('CONCARNEAU');
    expect(records[1]?.address).toBe("11 Place de l'Hôtel de ville");
  });

  it('reads the authoritative rating, website and counts', async () => {
    const { records } = await readAll();
    expect(records[0]).toMatchObject({
      source: 'atout-france',
      starRating: 3,
      declaredWebsite: 'https://www.1924hotel.com/',
      postcode: '38000',
      roomCount: 37,
      capacity: 62,
      licence: 'fr-lo',
      warnings: [],
    });
    expect(records[1]?.starRating).toBe(5);
  });

  it('normalizes the missing-value sentinel to an absent field', async () => {
    const { records } = await readAll();
    const withoutWebsite = records[2];
    expect(withoutWebsite?.name).toBe('HÔTEL DU PORT');
    expect(withoutWebsite?.declaredWebsite).toBeUndefined();
    expect('declaredWebsite' in withoutWebsite!).toBe(false);
    expect(withoutWebsite?.starRating).toBe(1);
  });

  it('warns rather than guesses when a classification is unreadable', async () => {
    const { records } = await readAll();
    const unreadable = records[3];
    expect(unreadable?.starRating).toBeUndefined();
    expect(unreadable?.warnings).toEqual(['unreadable-classement']);
  });

  it('skips a row with no establishment name and counts it by reason', async () => {
    const { source } = await readAll();
    expect(source.counters().skipped['missing-establishment-name']).toBe(1);
    expect(source.counters().accepted).toBe(6);
    expect(source.counters().rowsRead).toBe(8);
  });

  it('derives a stable id from the identifying fields', async () => {
    const first = await readAll();
    const second = await readAll();
    expect(first.records.map((r) => r.sourceId)).toEqual(second.records.map((r) => r.sourceId));
    expect(new Set(first.records.map((r) => r.sourceId)).size).toBe(first.records.length);
  });

  it('reports a byte offset that advances with each record', async () => {
    const source = createAtoutFranceSource({ filePath: fixturePath });
    const offsets: number[] = [];
    for await (const emission of source.read()) offsets.push(emission.byteOffset);
    expect(offsets).toHaveLength(6);
    expect(offsets[0]).toBeGreaterThan(0);
    for (let index = 1; index < offsets.length; index += 1) {
      expect(offsets[index]!).toBeGreaterThan(offsets[index - 1]!);
    }
  });

  it('stops reading when the consumer stops, so a limit stays bounded', async () => {
    const source = createAtoutFranceSource({ filePath: fixturePath });
    for await (const _emission of source.read()) break;
    expect(source.counters().accepted).toBe(1);
  });

  it('reads a field containing literal quote characters', async () => {
    // The real export does not quote fields but does contain quote characters
    // inside them. At csv-parse's default this row aborts the whole file, and
    // it took a run against the real 21,428 row export to surface it.
    const { records } = await readAll();
    const quoted = records.find((record) => record.name === 'HOTEL AVEC GUILLEMETS');
    expect(quoted?.address).toBe('RN 6 - Lieu dit "Le Chaumois"');
    expect(quoted?.postcode).toBe('89380');
  });

  it('preserves a scheme-less website verbatim rather than repairing it', async () => {
    // The source publishes both 'https://...' and bare 'www...' values.
    // Deciding what a declared string resolves to is the qualification stage's
    // job; inventing a scheme here would fabricate provenance.
    const { records } = await readAll();
    const schemeless = records.find((record) => record.name === 'HÔTEL SANS SCHÉMA');
    expect(schemeless?.declaredWebsite).toBe('www.exemple-sans-schema.fr');
  });

  it('refuses to resume without the header discovered on the first pass', () => {
    expect(() => createAtoutFranceSource({ filePath: fixturePath, startByteOffset: 500 })).toThrow(
      /headerColumns/u,
    );
  });
});
