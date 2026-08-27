import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHotelSireneJoiner } from './hotel-sirene-join.js';

let workDir = '';
const stockPath = (): string => path.join(workDir, 'stock.csv');
const cachePath = (): string => path.join(workDir, 'cache.jsonl');

/** Only the five columns the shipped stock index actually reads. */
function writeStock(rows: string[][]): void {
  const header = [
    'siren',
    'denominationUniteLegale',
    'activitePrincipaleUniteLegale',
    'trancheEffectifsUniteLegale',
    'etatAdministratifUniteLegale',
  ].join(',');
  writeFileSync(stockPath(), [header, ...rows.map((r) => r.join(','))].join('\n'), 'utf-8');
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'odysseus-hotel-sirene-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('createHotelSireneJoiner without a stock file', () => {
  it('reports every candidate as stock-file-unavailable rather than throwing', async () => {
    // The operator has not downloaded the 30M row stock file. A missing
    // optional input must not fail a resolve run whose primary output does not
    // depend on it.
    const joiner = await createHotelSireneJoiner(stockPath(), cachePath());
    expect(joiner.stockVersion).toBeNull();
    expect(joiner.join('732829320').status).toBe('stock-file-unavailable');
    expect(joiner.join(undefined).status).toBe('stock-file-unavailable');
  });
});

describe('createHotelSireneJoiner with a stock file', () => {
  it('separates having no identifier from having looked and missed', async () => {
    // The distinction plan 003 depends on. "We never had an identifier to look
    // with" is fixable by reading the hotel's own mentions legales; "this
    // company is not in the qualifying set" is a real disqualification.
    // Collapsing them would hide the reason the population is small.
    writeStock([['732829320', 'HOTEL DES ALPES', '55.10Z', '12', 'A']]);
    const joiner = await createHotelSireneJoiner(stockPath(), cachePath());

    expect(joiner.join(undefined).status).toBe('no-identifier');
    expect(joiner.join('').status).toBe('no-identifier');
    expect(joiner.join('552081317').status).toBe('siren-not-in-qualifying-sirene-set');
  });

  it('returns the company facts for a hotel in the qualifying set', async () => {
    writeStock([['732829320', 'HOTEL DES ALPES', '55.10Z', '12', 'A']]);
    const joiner = await createHotelSireneJoiner(stockPath(), cachePath());

    const result = joiner.join('732829320');
    expect(result.status).toBe('matched');
    expect(result.denomination).toBe('HOTEL DES ALPES');
    expect(result.naf).toBe('55.10Z');
    expect(result.effectifBandCode).toBe('12');
    expect(result.stockVersion).not.toBeUndefined();
  });

  it('inherits the shipped index filters rather than reimplementing them', async () => {
    // A closed establishment and one outside the NAF allowlist are both absent
    // from the index by construction. Restating those rules here would let the
    // two implementations drift.
    writeStock([
      ['111111111', 'HOTEL FERME', '55.10Z', '12', 'C'],
      ['222222222', 'BOULANGERIE', '10.71C', '12', 'A'],
    ]);
    const joiner = await createHotelSireneJoiner(stockPath(), cachePath());
    expect(joiner.join('111111111').status).toBe('siren-not-in-qualifying-sirene-set');
    expect(joiner.join('222222222').status).toBe('siren-not-in-qualifying-sirene-set');
  });

  it('stamps every result with the stock version it was answered from', async () => {
    writeStock([['732829320', 'HOTEL DES ALPES', '55.10Z', '12', 'A']]);
    const joiner = await createHotelSireneJoiner(stockPath(), cachePath());
    expect(joiner.join('732829320').stockVersion).toBe(joiner.stockVersion);
    expect(joiner.join(undefined).stockVersion).toBe(joiner.stockVersion);
  });
});
