import { describe, expect, it } from 'vitest';
import { isValidSiren, isValidSiret, sirenFromSiret } from './siren.js';

describe('isValidSiren', () => {
  it('accepts a checksum-valid SIREN', () => {
    // 732829320 is a well known publicly documented valid SIREN (INSEE).
    expect(isValidSiren('732829320')).toBe(true);
  });

  it('accepts a valid SIREN with spaces', () => {
    expect(isValidSiren('732 829 320')).toBe(true);
  });

  it('rejects a structurally valid but checksum-failing SIREN', () => {
    expect(isValidSiren('732829321')).toBe(false);
  });

  it('rejects a value that is not 9 digits', () => {
    expect(isValidSiren('12345')).toBe(false);
    expect(isValidSiren('1234567890')).toBe(false);
  });

  it('rejects non-numeric input', () => {
    expect(isValidSiren('73282932A')).toBe(false);
  });
});

describe('isValidSiret', () => {
  it('accepts a real SIRET passing the checksum over all 14 digits', () => {
    // INSEE's own documented example.
    expect(isValidSiret('73282932000074')).toBe(true);
  });

  it('tolerates spacing, as SIRETs are commonly printed grouped', () => {
    expect(isValidSiret('732 829 320 00074')).toBe(true);
  });

  it('rejects a failing checksum', () => {
    expect(isValidSiret('73282932000075')).toBe(false);
  });

  it('rejects the wrong length, including a bare valid SIREN', () => {
    expect(isValidSiret('732829320')).toBe(false);
    expect(isValidSiret('732829320000745')).toBe(false);
  });

  it('rejects non-digits', () => {
    expect(isValidSiret('7328293200007A')).toBe(false);
  });
});

describe('sirenFromSiret', () => {
  it('returns the company half of a valid SIRET', () => {
    expect(sirenFromSiret('73282932000074')).toBe('732829320');
  });

  it('refuses to derive a SIREN from an invalid SIRET', () => {
    // Otherwise a typo becomes a merge key.
    expect(sirenFromSiret('73282932000075')).toBeNull();
    expect(sirenFromSiret('732829320')).toBeNull();
  });
});
