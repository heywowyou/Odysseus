import { describe, expect, it } from 'vitest';
import { buildNapConsistency, normalizePhone } from './nap-consistency.js';
import type { JsonLdBlock } from './head-metadata.js';

function jsonLd(value: unknown): JsonLdBlock[] {
  return [{ raw: JSON.stringify(value), parsed: value, selector: 'script:nth-of-type(1)' }];
}

const URL = 'https://hotel.fr/contact';

describe('normalizePhone', () => {
  it('treats every French writing convention for one number as equal', () => {
    const forms = [
      '+33 5 56 22 33 44',
      '0033556223344',
      '05.56.22.33.44',
      '05 56 22 33 44',
      '0556223344',
    ];
    expect(new Set(forms.map(normalizePhone)).size).toBe(1);
    expect(normalizePhone(forms[0]!)).toBe('0556223344');
  });
});

describe('buildNapConsistency', () => {
  it('reports nothing when the declared and visible numbers agree despite different formatting', () => {
    const result = buildNapConsistency(
      URL,
      jsonLd({ '@type': 'Hotel', telephone: '+33 5 56 22 33 44' }),
      'Réservations au 05.56.22.33.44',
    );
    expect(result.phoneMismatch).toBe(false);
  });

  it('reports a genuine digit difference', () => {
    const result = buildNapConsistency(
      URL,
      jsonLd({ '@type': 'Hotel', telephone: '+33 5 56 22 33 44' }),
      'Réservations au 05 56 22 33 99',
    );
    expect(result.phoneMismatch).toBe(true);
    expect(result.structuredPhones).toEqual(['0556223344']);
    expect(result.visiblePhones).toEqual(['0556223399']);
  });

  it('finds a phone nested inside an @graph, at any depth', () => {
    const result = buildNapConsistency(
      URL,
      jsonLd({
        '@graph': [
          { '@type': 'WebSite' },
          { '@type': 'Hotel', contactPoint: { telephone: '0556223344' } },
        ],
      }),
      'Appelez le 05 56 22 33 99',
    );
    expect(result.structuredPhones).toEqual(['0556223344']);
    expect(result.phoneMismatch).toBe(true);
  });

  // A page that simply does not print its phone number is silent, not
  // contradictory - reporting that would be reporting an absence as a
  // conflict.
  it('reports nothing when the page shows no phone at all', () => {
    const result = buildNapConsistency(
      URL,
      jsonLd({ telephone: '0556223344' }),
      'Bienvenue à notre hôtel.',
    );
    expect(result.phoneMismatch).toBe(false);
  });

  it('reports nothing when there is no structured data to compare against', () => {
    expect(buildNapConsistency(URL, [], 'Appelez le 05 56 22 33 44').phoneMismatch).toBe(false);
  });

  it('accepts any one of several declared numbers matching', () => {
    const result = buildNapConsistency(
      URL,
      jsonLd([{ telephone: '0556223344' }, { telephone: '0140205050' }]),
      'Standard : 01 40 20 50 50',
    );
    expect(result.phoneMismatch).toBe(false);
  });

  it('compares postal codes', () => {
    const match = buildNapConsistency(
      URL,
      jsonLd({ address: { '@type': 'PostalAddress', postalCode: '33000' } }),
      '12 boulevard Wilson, 33000 Bordeaux',
    );
    expect(match.postalCodeMismatch).toBe(false);

    const mismatch = buildNapConsistency(
      URL,
      jsonLd({ address: { '@type': 'PostalAddress', postalCode: '33000' } }),
      '12 boulevard Wilson, 33120 Arcachon',
    );
    expect(mismatch.postalCodeMismatch).toBe(true);
  });

  it('does not read a phone number or a price as a postal code', () => {
    const result = buildNapConsistency(
      URL,
      jsonLd({ address: { postalCode: '33120' } }),
      'Appelez le 05 56 22 33 44. À partir de 33120 centimes. 33120 Arcachon',
    );
    expect(result.postalCodeMismatch).toBe(false);
    expect(result.visiblePostalCodes).toContain('33120');
  });

  // Street names are deliberately not compared: deciding whether "12 bd
  // Wilson" and "12 boulevard du Président Wilson" are the same address
  // is a judgment, and a false mismatch on a correct address is worse
  // than no check at all.
  it('does not compare street names', () => {
    const result = buildNapConsistency(
      URL,
      jsonLd({
        address: { streetAddress: '12 boulevard du Président Wilson', postalCode: '33000' },
      }),
      '12 bd Wilson, 33000 Bordeaux',
    );
    expect(result.postalCodeMismatch).toBe(false);
    expect(result.phoneMismatch).toBe(false);
  });
});
