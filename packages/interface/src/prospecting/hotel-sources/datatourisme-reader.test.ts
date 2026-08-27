import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HotelSourceRecord } from '@odysseus/core';
import {
  createDatatourismeSource,
  extractDeclaredWebsite,
  splitPostcodeAndCommune,
} from './datatourisme-reader.js';

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'datatourisme-sample.csv',
);

async function readAll(): Promise<{
  records: HotelSourceRecord[];
  source: ReturnType<typeof createDatatourismeSource>;
}> {
  const source = createDatatourismeSource({ filePaths: [fixturePath] });
  const records: HotelSourceRecord[] = [];
  for await (const emission of source.read()) records.push(emission.record);
  return { records, source };
}

describe('splitPostcodeAndCommune', () => {
  it('splits the composite the source writes', () => {
    expect(splitPostcodeAndCommune('20220#Algajola')).toEqual({
      postcode: '20220',
      commune: 'Algajola',
    });
  });

  it('yields only the half present rather than a mangled composite', () => {
    expect(splitPostcodeAndCommune('31000')).toEqual({ postcode: '31000' });
    expect(splitPostcodeAndCommune('#Toulouse')).toEqual({ commune: 'Toulouse' });
    expect(splitPostcodeAndCommune(undefined)).toEqual({});
    expect(splitPostcodeAndCommune('')).toEqual({});
  });
});

describe('extractDeclaredWebsite', () => {
  it('reads a website out of the mixed contact column', () => {
    expect(extractDeclaredWebsite('#http://www.exemple-corse.com/')).toBe(
      'http://www.exemple-corse.com/',
    );
    expect(extractDeclaredWebsite('04 67 00 00 00|https://exemple.fr/')).toBe(
      'https://exemple.fr/',
    );
  });

  it('never returns an email or a phone number', () => {
    expect(extractDeclaredWebsite('contact@exemple.fr|04 67 00 00 00')).toBeUndefined();
    expect(extractDeclaredWebsite('mailto:contact@exemple.fr')).toBeUndefined();
    expect(extractDeclaredWebsite('')).toBeUndefined();
  });
});

describe('createDatatourismeSource', () => {
  it('keeps only rows carrying the hotel ontology URI', async () => {
    const { records, source } = await readAll();
    expect(records.map((record) => record.name)).toEqual([
      'Santa Vittoria - Hôtel de la Plage',
      'Hôtel Sans Site',
      'Hôtel Sans Commune',
    ]);
    // The holiday resort shares the Accommodation ancestor and must not match.
    expect(source.counters().skipped['not-a-hotel-typology']).toBe(1);
  });

  it('never carries a star rating, however the source labels the POI', async () => {
    const { records } = await readAll();
    for (const record of records) {
      expect(record.starRating).toBeUndefined();
      expect('starRating' in record).toBe(false);
    }
  });

  it('uses the source own POI URI as the id', async () => {
    const { records } = await readAll();
    expect(records[0]?.sourceId).toBe('https://data.datatourisme.fr/13/abc-1');
  });

  it('reads address, postcode, commune and website', async () => {
    const { records } = await readAll();
    expect(records[0]).toMatchObject({
      source: 'datatourisme',
      address: 'Hôtel de la Plage',
      postcode: '20220',
      commune: 'Algajola',
      declaredWebsite: 'http://www.hotelplage-vittoria-corse.com/',
      licence: 'etalab-2.0',
    });
  });

  it('discards an email in the contact column rather than storing it', async () => {
    const { records } = await readAll();
    const withoutSite = records.find((record) => record.name === 'Hôtel Sans Site');
    expect(withoutSite?.declaredWebsite).toBeUndefined();
    expect(JSON.stringify(withoutSite)).not.toContain('@');
  });

  it('keeps a postcode with no commune', async () => {
    const { records } = await readAll();
    const partial = records.find((record) => record.name === 'Hôtel Sans Commune');
    expect(partial?.postcode).toBe('31000');
    expect(partial?.commune).toBeUndefined();
  });

  it('skips files already completed in an earlier pass', async () => {
    const source = createDatatourismeSource({
      filePaths: [fixturePath],
      completedFilePaths: [fixturePath],
    });
    const records: HotelSourceRecord[] = [];
    for await (const emission of source.read()) records.push(emission.record);
    expect(records).toHaveLength(0);
    expect(source.counters().rowsRead).toBe(0);
  });

  it('fingerprints its inputs so a changed file invalidates a checkpoint', async () => {
    const source = createDatatourismeSource({ filePaths: [fixturePath] });
    expect(source.fingerprint()).toContain(fixturePath);
    const { records } = await readAll();
    expect(records[0]?.sourceVersion).toBe(source.fingerprint());
  });
});
