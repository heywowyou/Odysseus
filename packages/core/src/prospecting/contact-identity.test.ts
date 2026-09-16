import { describe, expect, it } from 'vitest';
import { emailDomain, primaryWebsite } from './contact-identity.js';

describe('emailDomain', () => {
  it.each([
    ['contact@hotel.fr', 'hotel.fr'],
    ['  Contact@Hotel.FR ', 'hotel.fr'],
    ['"odd@local"@hotel.fr', 'hotel.fr'],
  ])('reads the domain of %j', (address, domain) => {
    expect(emailDomain(address)).toBe(domain);
  });

  it.each(['hotel.fr', '@hotel.fr', 'contact@', '', 'contact@hotel .fr'])(
    'has no domain for the malformed address %j',
    (address) => {
      expect(emailDomain(address)).toBeUndefined();
    },
  );
});

describe('primaryWebsite', () => {
  it('prefers the website marked primary', () => {
    const websites = [{ url: 'a', primary: false }, { url: 'b', primary: true }, { url: 'c' }];
    expect(primaryWebsite(websites)?.url).toBe('b');
  });

  it('falls back to the first website, and to nothing for none', () => {
    const unmarked: { url: string; primary?: boolean }[] = [{ url: 'a' }, { url: 'b' }];
    expect(primaryWebsite(unmarked)?.url).toBe('a');
    expect(primaryWebsite([])).toBeUndefined();
  });
});
