import { describe, expect, it } from 'vitest';
import { selectSiteRoleContact } from './role-contact.js';

describe('selectSiteRoleContact', () => {
  it('keeps the best-ranked address across pages, the first page winning a tie', () => {
    expect(
      selectSiteRoleContact([
        undefined,
        { address: 'reservation@hotel.fr', preferenceRank: 10, sourceUrl: 'https://hotel.fr/' },
        { address: 'contact@hotel.fr', preferenceRank: 2, sourceUrl: 'https://hotel.fr/contact' },
        { address: 'contact@hotel.fr', preferenceRank: 2, sourceUrl: 'https://hotel.fr/legal' },
      ]),
    ).toEqual({
      address: 'contact@hotel.fr',
      preferenceRank: 2,
      sourceUrl: 'https://hotel.fr/contact',
    });
    expect(selectSiteRoleContact([undefined])).toBeUndefined();
  });
});
