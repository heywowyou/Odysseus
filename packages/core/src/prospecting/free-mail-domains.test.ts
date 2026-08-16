import { describe, expect, it } from 'vitest';
import { getFreeMailDomains, isFreeMailDomain } from './free-mail-domains.js';

describe('isFreeMailDomain', () => {
  it('recognizes common free-mail domains', () => {
    expect(isFreeMailDomain('gmail.com')).toBe(true);
    expect(isFreeMailDomain('orange.fr')).toBe(true);
    expect(isFreeMailDomain('free.fr')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isFreeMailDomain('Gmail.COM')).toBe(true);
  });

  it('rejects a company domain', () => {
    expect(isFreeMailDomain('example-company.fr')).toBe(false);
  });

  it('loads a non-empty set', () => {
    expect(getFreeMailDomains().size).toBeGreaterThan(0);
  });
});
