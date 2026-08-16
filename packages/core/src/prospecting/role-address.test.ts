import { describe, expect, it } from 'vitest';
import { isRoleAddress } from './role-address.js';

describe('isRoleAddress', () => {
  it('accepts known role local parts', () => {
    expect(isRoleAddress('contact')).toBe(true);
    expect(isRoleAddress('info')).toBe(true);
    expect(isRoleAddress('commercial')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isRoleAddress('Contact')).toBe(true);
  });

  it('rejects a named-individual local part', () => {
    expect(isRoleAddress('jean.dupont')).toBe(false);
    expect(isRoleAddress('jdupont')).toBe(false);
  });
});
