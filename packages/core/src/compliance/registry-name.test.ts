import { describe, expect, it } from 'vitest';
import { normalizeRegistryDisplayName } from './registry-name.js';

/**
 * Both headline cases are verbatim from real 2026-08-22 client reports.
 */
describe('normalizeRegistryDisplayName', () => {
  it('drops an unmatched opening parenthesis (real La Corniche value)', () => {
    expect(normalizeRegistryDisplayName('(O! DE LA DUNE')).toBe('O! DE LA DUNE');
  });

  it('collapses a parenthetical that repeats the name (real Palais Gallien value)', () => {
    expect(normalizeRegistryDisplayName('LE PALAIS GALLIEN (LE PALAIS GALLIEN)')).toBe(
      'LE PALAIS GALLIEN',
    );
  });

  it('treats the repeat check as accent- and case-insensitive', () => {
    expect(normalizeRegistryDisplayName('Hôtel Béarn (HOTEL BEARN)')).toBe('Hôtel Béarn');
  });

  it('keeps a genuinely different trading name in parentheses', () => {
    expect(normalizeRegistryDisplayName('SAS HAITZA (HAAITZA)')).toBe('SAS HAITZA (HAAITZA)');
  });

  it('keeps a balanced parenthesis pair inside the name', () => {
    expect(normalizeRegistryDisplayName('LA CO(O)RNICHE')).toBe('LA CO(O)RNICHE');
  });

  it('drops an unmatched closing parenthesis too', () => {
    expect(normalizeRegistryDisplayName('O DE LA DUNE)')).toBe('O DE LA DUNE');
  });

  it('collapses runs of whitespace', () => {
    expect(normalizeRegistryDisplayName('  SAS   HAITZA  ')).toBe('SAS HAITZA');
  });

  it('returns undefined rather than an empty string', () => {
    expect(normalizeRegistryDisplayName('   ')).toBeUndefined();
    expect(normalizeRegistryDisplayName('()')).toBeUndefined();
  });

  it('never substitutes or reorders characters in an already-clean name', () => {
    expect(normalizeRegistryDisplayName('LE PALAIS GALLIEN')).toBe('LE PALAIS GALLIEN');
  });
});
