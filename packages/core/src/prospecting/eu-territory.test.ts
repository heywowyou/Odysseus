import { describe, expect, it } from 'vitest';
import { isOutsideEuTerritory } from './eu-territory.js';

describe('isOutsideEuTerritory', () => {
  it('rejects a hotel in a French territory outside the EU, by postcode or domain', () => {
    expect(isOutsideEuTerritory({ postcode: '98800' })).toBe(true); // Nouméa
    expect(isOutsideEuTerritory({ postcode: '98714' })).toBe(true); // Papeete
    expect(isOutsideEuTerritory({ postcode: '97133' })).toBe(true); // Saint-Barthélemy
    expect(isOutsideEuTerritory({ postcode: '97500' })).toBe(true); // Saint-Pierre
    expect(isOutsideEuTerritory({ url: 'https://www.hotelchateauroyal.nc/' })).toBe(true);
    expect(isOutsideEuTerritory({ url: 'https://hotel.pf/fr' })).toBe(true);
  });

  it('keeps metropolitan France, the overseas departments and Saint-Martin', () => {
    expect(
      isOutsideEuTerritory({ postcode: '75017', url: 'https://grandhotelchicago.paris/' }),
    ).toBe(false);
    expect(isOutsideEuTerritory({ postcode: '97400', url: 'https://hotel.re/' })).toBe(false); // Réunion
    expect(isOutsideEuTerritory({ postcode: '97110' })).toBe(false); // Guadeloupe
    expect(isOutsideEuTerritory({ postcode: '97150', url: 'https://hotel.mf/' })).toBe(false); // Saint-Martin
    expect(isOutsideEuTerritory({ postcode: '97600' })).toBe(false); // Mayotte
    expect(isOutsideEuTerritory({ postcode: '20000' })).toBe(false); // Corsica
  });

  it('does not reject a domain that only contains a territory code', () => {
    expect(isOutsideEuTerritory({ url: 'https://nc-hotel.fr/' })).toBe(false);
    expect(isOutsideEuTerritory({ url: 'not a url' })).toBe(false);
    expect(isOutsideEuTerritory({})).toBe(false);
  });
});
