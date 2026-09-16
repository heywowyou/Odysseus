import { describe, expect, it } from 'vitest';
import {
  confirmedIdentityFromManualFields,
  missingProspectIdentityFill,
  normalizeSirenInput,
  withNormalizedSiren,
} from './prospect-identity.js';

// Luhn-valid values lifted from core's own siren.test.ts and the
// scanner's mentions-legales.test.ts fixtures.
const VALID_SIREN = '732829320';
const VALID_SIRET = '95126636000019';
const OTHER_VALID_SIREN = '951266360';

describe('normalizeSirenInput', () => {
  it('accepts bare, spaced, dotted, and dashed printed forms', () => {
    expect(normalizeSirenInput(VALID_SIREN)).toBe(VALID_SIREN);
    expect(normalizeSirenInput('732 829 320')).toBe(VALID_SIREN);
    expect(normalizeSirenInput('732.829.320')).toBe(VALID_SIREN);
    expect(normalizeSirenInput('732-82-9320')).toBe(VALID_SIREN);
  });

  it('takes the company half of a checksum-valid SIRET', () => {
    expect(normalizeSirenInput(VALID_SIRET)).toBe(OTHER_VALID_SIREN);
    expect(normalizeSirenInput('951 266 360 00019')).toBe(OTHER_VALID_SIREN);
  });

  it('rejects empty, non-digit, wrong-length, and checksum failures', () => {
    expect(normalizeSirenInput('')).toBeNull();
    expect(normalizeSirenInput('   ')).toBeNull();
    expect(normalizeSirenInput('732 829 32')).toBeNull();
    expect(normalizeSirenInput('7328293209')).toBeNull();
    // Same shape, one digit off: fails the Luhn check.
    expect(normalizeSirenInput('732829321')).toBeNull();
    expect(normalizeSirenInput('siren')).toBeNull();
  });
});

describe('withNormalizedSiren', () => {
  it('normalizes a present siren and passes absent and other keys through', () => {
    expect(withNormalizedSiren({ siren: '732 829 320', notes: 'x' })).toEqual({
      siren: VALID_SIREN,
      notes: 'x',
    });
    expect(withNormalizedSiren({ notes: 'x' })).toEqual({ notes: 'x' });
    expect(withNormalizedSiren({ siren: undefined })).toEqual({ siren: undefined });
  });

  it('throws on an invalid siren so the caller can refuse the save', () => {
    expect(() => withNormalizedSiren({ siren: '732829321' })).toThrow(
      'siren must be a valid 9-digit SIREN',
    );
  });
});

describe('missingProspectIdentityFill', () => {
  it('fills only the fields the prospect is missing', () => {
    expect(
      missingProspectIdentityFill(
        { siren: VALID_SIREN },
        { siren: OTHER_VALID_SIREN, tradingName: 'Le Cadouin', legalName: 'SARL Le Cadouin' },
      ),
    ).toEqual({ tradingName: 'Le Cadouin', legalName: 'SARL Le Cadouin' });
  });

  it('treats blank stored values as missing', () => {
    expect(
      missingProspectIdentityFill({ tradingName: '   ' }, { tradingName: 'Le Cadouin' }),
    ).toEqual({ tradingName: 'Le Cadouin' });
  });

  it('returns an empty fill when everything is already set or detected', () => {
    expect(
      missingProspectIdentityFill(
        { siren: VALID_SIREN, tradingName: 'Le Cadouin', legalName: 'SARL' },
        { siren: OTHER_VALID_SIREN, tradingName: 'Autre', legalName: 'Autre' },
      ),
    ).toEqual({});
    expect(missingProspectIdentityFill({}, {})).toEqual({});
  });

  it('drops a detected SIREN that fails validation instead of storing it', () => {
    expect(missingProspectIdentityFill({}, { siren: '732829321' })).toEqual({});
  });
});

describe('confirmedIdentityFromManualFields', () => {
  const at = new Date('2026-01-01T00:00:00Z');

  it('keeps only operator-confirmed audit identity fields', () => {
    expect(
      confirmedIdentityFromManualFields({
        updatedAt: at,
        nomCommercial: { value: 'Le Cadouin', provenance: 'operator' },
        raisonSociale: { value: 'GAEC du as-detected', provenance: 'detected' },
      }),
    ).toEqual({ tradingName: 'Le Cadouin', legalName: undefined });
  });

  it('ignores blank confirmed values and absent fields', () => {
    expect(
      confirmedIdentityFromManualFields({
        updatedAt: at,
        nomCommercial: { value: '   ', provenance: 'operator' },
      }),
    ).toEqual({ tradingName: undefined, legalName: undefined });
    expect(confirmedIdentityFromManualFields(undefined)).toEqual({
      tradingName: undefined,
      legalName: undefined,
    });
  });
});
