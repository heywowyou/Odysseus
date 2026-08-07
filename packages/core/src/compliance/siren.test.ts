import { describe, expect, it } from 'vitest';
import { isValidSiren } from './siren.js';

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
