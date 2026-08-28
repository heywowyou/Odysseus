import { describe, expect, it } from 'vitest';
import {
  ROLE_ADDRESS_LOCAL_PARTS,
  ROLE_ADDRESS_PREFERENCE,
  isRoleAddress,
  roleAddressRank,
} from './role-address.js';

describe('isRoleAddress', () => {
  it('accepts known role local parts', () => {
    expect(isRoleAddress('contact')).toBe(true);
    expect(isRoleAddress('info')).toBe(true);
    expect(isRoleAddress('commercial')).toBe(true);
  });

  it('accepts the hotel-campaign local parts added for plan 007', () => {
    expect(isRoleAddress('direction')).toBe(true);
    expect(isRoleAddress('reception')).toBe(true);
    expect(isRoleAddress('accueil')).toBe(true);
    expect(isRoleAddress('reservation')).toBe(true);
    expect(isRoleAddress('reservations')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isRoleAddress('Contact')).toBe(true);
  });

  it('rejects a named-individual local part', () => {
    expect(isRoleAddress('jean.dupont')).toBe(false);
    expect(isRoleAddress('jdupont')).toBe(false);
  });
});

describe('roleAddressRank', () => {
  it('ranks a decision-maker inbox above a front desk or a booking engine', () => {
    const direction = roleAddressRank('direction') ?? Number.POSITIVE_INFINITY;
    expect(direction).toBeLessThan(roleAddressRank('reception') ?? Number.POSITIVE_INFINITY);
    expect(direction).toBeLessThan(roleAddressRank('reservation') ?? Number.POSITIVE_INFINITY);
    expect(roleAddressRank('contact') ?? Number.POSITIVE_INFINITY).toBeLessThan(
      roleAddressRank('accueil') ?? Number.POSITIVE_INFINITY,
    );
  });

  it('is null for a local part that is not a role address', () => {
    expect(roleAddressRank('jean.dupont')).toBeNull();
  });
});

describe('the ordered list and the set', () => {
  it('hold exactly the same local parts, so neither can drift', () => {
    expect(ROLE_ADDRESS_LOCAL_PARTS.size).toBe(ROLE_ADDRESS_PREFERENCE.length);
    for (const localPart of ROLE_ADDRESS_PREFERENCE) {
      expect(ROLE_ADDRESS_LOCAL_PARTS.has(localPart)).toBe(true);
    }
  });
});
