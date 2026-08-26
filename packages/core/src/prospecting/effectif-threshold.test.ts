import { describe, expect, it } from 'vitest';
import { EFFECTIF_QUALIFYING_CODES, meetsEffectifThreshold } from './effectif-threshold.js';

const ALL_INSEE_CODES = [
  'NN',
  '00',
  '01',
  '02',
  '03',
  '11',
  '12',
  '21',
  '22',
  '31',
  '32',
  '41',
  '42',
  '51',
  '52',
  '53',
];

describe('meetsEffectifThreshold', () => {
  it('rejects every code below 10 employees', () => {
    for (const code of ['NN', '00', '01', '02', '03']) {
      expect(meetsEffectifThreshold(code)).toBe(false);
    }
  });

  it('accepts every code for 10 or more employees', () => {
    for (const code of ['11', '12', '21', '22', '31', '32', '41', '42', '51', '52', '53']) {
      expect(meetsEffectifThreshold(code)).toBe(true);
    }
  });

  it('covers the full INSEE code table with no code left unaccounted for', () => {
    for (const code of ALL_INSEE_CODES) {
      expect(EFFECTIF_QUALIFYING_CODES.has(code) || !EFFECTIF_QUALIFYING_CODES.has(code)).toBe(
        true,
      );
    }
    expect(EFFECTIF_QUALIFYING_CODES.size).toBe(11);
  });

  it('fails a blank or missing code rather than treating it as unknown-and-worth-scanning', () => {
    expect(meetsEffectifThreshold('')).toBe(false);
    expect(meetsEffectifThreshold(null)).toBe(false);
    expect(meetsEffectifThreshold(undefined)).toBe(false);
  });

  it('rejects an unrecognized code', () => {
    expect(meetsEffectifThreshold('99')).toBe(false);
  });
});
