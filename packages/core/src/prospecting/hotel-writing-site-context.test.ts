import { describe, expect, it } from 'vitest';
import { resolveHotelCatalogueWritingSiteContext } from './hotel-writing-site-context.js';

describe('resolveHotelCatalogueWritingSiteContext (issue #559)', () => {
  it('names the type with its rating in words and the city in normal case', () => {
    expect(
      resolveHotelCatalogueWritingSiteContext({
        accommodationType: 'Hôtel',
        starRating: 4,
        commune: 'SAINT-JEAN-DE-LUZ',
      }),
    ).toEqual({
      siteContext: {
        propertyType: 'Hôtel (quatre étoiles)',
        sector: 'hospitality',
        city: 'Saint-Jean-de-Luz',
      },
      unknownReasons: {},
    });
  });

  it('drops a Paris arrondissement so the city carries no digit', () => {
    const { siteContext } = resolveHotelCatalogueWritingSiteContext({
      accommodationType: 'Hôtel',
      commune: 'PARIS 10E ARRONDISSEMENT',
    });
    expect(siteContext).toEqual({ propertyType: 'Hôtel', sector: 'hospitality', city: 'Paris' });
  });

  it('keeps an absent fact unknown with its reason', () => {
    expect(resolveHotelCatalogueWritingSiteContext({ starRating: 3 })).toEqual({
      siteContext: {},
      unknownReasons: {
        propertyType: 'missing-accommodation-type',
        sector: 'missing-accommodation-type',
        city: 'missing-commune',
      },
    });
    expect(resolveHotelCatalogueWritingSiteContext(undefined).siteContext).toEqual({});
  });

  it('never yields a digit in any fact', () => {
    for (const starRating of [1, 2, 3, 4, 5]) {
      const { siteContext } = resolveHotelCatalogueWritingSiteContext({
        accommodationType: 'Hôtel',
        starRating,
        commune: 'LYON 2E ARRONDISSEMENT',
      });
      expect(JSON.stringify(siteContext)).not.toMatch(/\d/u);
    }
  });
});
