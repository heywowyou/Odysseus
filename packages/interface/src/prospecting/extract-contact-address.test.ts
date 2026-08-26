import { describe, expect, it } from 'vitest';
import { extractContactAddress } from './extract-contact-address.js';

describe('extractContactAddress', () => {
  it("extracts a role address on the site's own domain", () => {
    const result = extractContactAddress(['Nous contacter: contact@example.fr'], 'example.fr');
    expect(result).toEqual({
      value: 'contact@example.fr',
      localPart: 'contact',
      domain: 'example.fr',
    });
  });

  it('rejects a named-individual address', () => {
    const result = extractContactAddress(['jean.dupont@example.fr'], 'example.fr');
    expect(result).toBeNull();
  });

  it('rejects an address on a different domain', () => {
    const result = extractContactAddress(['contact@other-site.fr'], 'example.fr');
    expect(result).toBeNull();
  });

  it('rejects a free-mail address even with a role local part, defense in depth', () => {
    // Own-domain requirement already excludes gmail.com etc for a real
    // company site, but the free-mail check is kept explicit and testable.
    const result = extractContactAddress(['contact@gmail.com'], 'gmail.com');
    expect(result).toBeNull();
  });

  it('scans multiple texts and returns the first qualifying match', () => {
    const result = extractContactAddress(
      ['no email here', 'reach us at info@example.fr'],
      'example.fr',
    );
    expect(result?.value).toBe('info@example.fr');
  });

  it('returns null when no address is found', () => {
    expect(extractContactAddress(['nothing to see here'], 'example.fr')).toBeNull();
  });
});
