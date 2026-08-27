import { describe, expect, it } from 'vitest';
import { normalizeDeclaredWebsite } from './hotel-domain.js';

/** Every value in this file that is marked "real" was taken verbatim from the
 *  Atout France national export measured 2026-08-27. The export's defects are
 *  fixtures here so they stay caught without the 3.6 MB file. */

describe('normalizeDeclaredWebsite, ordinary own domains', () => {
  it('accepts an absolute https URL', () => {
    expect(normalizeDeclaredWebsite('https://www.1924hotel.com/')).toEqual({
      kind: 'own-domain',
      hostname: 'www.1924hotel.com',
      registrableDomain: '1924hotel.com',
      subdomain: 'www',
      isPrivateSuffix: false,
    });
  });

  it('accepts a scheme-less value, which 873 real rows use', () => {
    const result = normalizeDeclaredWebsite('www.lamaisontrebeurden.fr');
    expect(result).toMatchObject({
      kind: 'own-domain',
      registrableDomain: 'lamaisontrebeurden.fr',
    });
  });

  it('ignores a path, query, and fragment', () => {
    // Real: 3,660 declared values carry a path beyond '/'.
    const result = normalizeDeclaredWebsite('https://garrigae.fr/etablissements/abbaye/?x=1#a');
    expect(result).toMatchObject({ kind: 'own-domain', registrableDomain: 'garrigae.fr' });
  });

  it('lowercases and strips a trailing dot', () => {
    expect(normalizeDeclaredWebsite('HTTPS://WWW.Example.FR.')).toMatchObject({
      hostname: 'www.example.fr',
      registrableDomain: 'example.fr',
    });
  });

  it('resolves a multi-label ICANN suffix rather than taking the last two labels', () => {
    // Real: the one host in the export where naive last-two-labels is wrong.
    expect(normalizeDeclaredWebsite('https://www.inghams.co.uk')).toMatchObject({
      registrableDomain: 'inghams.co.uk',
    });
  });
});

describe('normalizeDeclaredWebsite, subdomains that must collapse to the parent', () => {
  it.each([
    ['https://all.accor.com/hotel/1234/index.fr.shtml', 'accor.com', 'all'],
    ['https://chinon.brithotel.fr', 'brithotel.fr', 'chinon'],
    ['https://fr.mamashelter.com/', 'mamashelter.com', 'fr'],
  ])('%s resolves to %s', (raw, registrableDomain, subdomain) => {
    expect(normalizeDeclaredWebsite(raw)).toMatchObject({
      kind: 'own-domain',
      registrableDomain,
      subdomain,
    });
  });
});

describe('normalizeDeclaredWebsite, vendor hosts', () => {
  it('keeps a PSL-private builder subdomain as its own key rather than merging it', () => {
    // Real. Without the private suffix section this would be `wixsite.com`,
    // and the three hotels on it would become a fabricated chain.
    const result = normalizeDeclaredWebsite('https://hotelhavane.wixsite.com/monsite');
    expect(result).toMatchObject({
      kind: 'vendor-hosted',
      registrableDomain: 'hotelhavane.wixsite.com',
    });
  });

  it('catches a builder host the public suffix list does not cover', () => {
    // Real. tldts parses this to `business.site`, so only the curated list
    // stops the six hotels on it from merging.
    const result = normalizeDeclaredWebsite('https://welcomotel-hotel.business.site/');
    expect(result).toMatchObject({ kind: 'vendor-hosted', registrableDomain: 'business.site' });
    expect(result).toHaveProperty('vendor.kind', 'site-builder');
  });

  it.each([
    ['https://aubergesaintviance.eatbu.com/', 'eatbu.com'],
    ['https://lespetitsoreillers.jimdofree.com/', 'jimdofree.com'],
    ['https://arkhotel.octosite.net/', 'octosite.net'],
    ['https://www.logishotels.com/fr/hotel/le-relais-12345', 'logishotels.com'],
  ])('%s is vendor-hosted on %s', (raw, registrableDomain) => {
    expect(normalizeDeclaredWebsite(raw)).toMatchObject({
      kind: 'vendor-hosted',
      registrableDomain,
    });
  });

  it('leaves a corporate chain domain as an own domain, for the group pass to label', () => {
    // accor.com is a chain, not a vendor. Telling the two apart is the whole
    // point: a chain is excluded, a vendor host goes to review.
    expect(normalizeDeclaredWebsite('https://all.accor.com/')).toMatchObject({
      kind: 'own-domain',
    });
  });
});

describe('normalizeDeclaredWebsite, unusable values', () => {
  it.each([
    ['pas encore en ligne', 'not-a-url'],
    ['en cours de construction', 'not-a-url'],
    ['https:\\\\www.hoteldeverdun1882.com', 'malformed-url'],
    ['https:/villa-port-antibes.com', 'malformed-url'],
    ['http:/https://www.domaine-du-limonay.com/fr/', 'malformed-url'],
  ])('rejects the real malformed value %j as %s', (raw, reason) => {
    expect(normalizeDeclaredWebsite(raw)).toEqual({ kind: 'unusable', reason });
  });

  it('rejects a non-web scheme', () => {
    expect(normalizeDeclaredWebsite('mailto:contact@example.fr')).toEqual({
      kind: 'unusable',
      reason: 'unsupported-scheme',
    });
    expect(normalizeDeclaredWebsite('ftp://files.example.fr')).toEqual({
      kind: 'unusable',
      reason: 'unsupported-scheme',
    });
  });

  it('rejects an IP literal, which is a host but never a registrable domain', () => {
    expect(normalizeDeclaredWebsite('http://192.168.1.1/')).toEqual({
      kind: 'unusable',
      reason: 'ip-address',
    });
  });

  it('keeps a real URL whose path carries a stray space', () => {
    // Real, and six rows deep. Rejecting on whitespace anywhere in the value
    // discarded six chain hotels whose hostname was never in doubt.
    expect(
      normalizeDeclaredWebsite(
        'https://www.accorhotels.com/fr/hotel-1108-ibis- cognac/index.shtml',
      ),
    ).toMatchObject({ kind: 'own-domain', registrableDomain: 'accorhotels.com' });
  });

  it('rejects a bare label with no suffix', () => {
    expect(normalizeDeclaredWebsite('localhost')).toEqual({
      kind: 'unusable',
      reason: 'no-registrable-domain',
    });
  });

  it('rejects empty and whitespace-only input', () => {
    expect(normalizeDeclaredWebsite('')).toEqual({ kind: 'unusable', reason: 'not-a-url' });
    expect(normalizeDeclaredWebsite('   ')).toEqual({ kind: 'unusable', reason: 'not-a-url' });
  });
});

describe('normalizeDeclaredWebsite, internationalized domains', () => {
  it('preserves a Unicode host without transliterating it away', () => {
    // Real. Deciding whether this and its punycode form are the same domain is
    // a resolution question; mangling one of them here would remove the
    // evidence needed to answer it.
    expect(normalizeDeclaredWebsite('https://www.éveil-des-sens.fr')).toMatchObject({
      kind: 'own-domain',
      registrableDomain: 'éveil-des-sens.fr',
    });
  });

  it('accepts an already-punycoded host', () => {
    // Real.
    expect(normalizeDeclaredWebsite('https://www.xn--rsidenceoceane-bkb.com')).toMatchObject({
      kind: 'own-domain',
      registrableDomain: 'xn--rsidenceoceane-bkb.com',
    });
  });
});

describe('normalizeDeclaredWebsite, determinism', () => {
  it('returns the same result for the same input', () => {
    const raw = 'https://www.1924hotel.com/';
    expect(normalizeDeclaredWebsite(raw)).toEqual(normalizeDeclaredWebsite(raw));
  });
});
