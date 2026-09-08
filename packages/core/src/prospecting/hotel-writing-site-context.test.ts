import { describe, expect, it } from 'vitest';
import { resolveHotelCatalogueWritingSiteContext } from './hotel-writing-site-context.js';

describe('resolveHotelCatalogueWritingSiteContext', () => {
  it('returns all verified catalogue facts for a complete hotel candidate', () => {
    expect(
      resolveHotelCatalogueWritingSiteContext({
        accommodationType: 'HÔTEL DE TOURISME',
        starRating: 4,
        roomCount: 38,
        commune: 'GRENOBLE',
      }),
    ).toEqual({
      siteContext: {
        propertyType: 'HÔTEL DE TOURISME (4 étoiles)',
        roomCount: 38,
        city: 'GRENOBLE',
        sector: 'hospitality',
      },
      unknownReasons: {},
    });
  });

  it('keeps known facts and records a reason for each missing one', () => {
    expect(
      resolveHotelCatalogueWritingSiteContext({
        accommodationType: 'HÔTEL DE TOURISME',
        commune: 'BARR',
      }),
    ).toEqual({
      siteContext: {
        propertyType: 'HÔTEL DE TOURISME',
        city: 'BARR',
        sector: 'hospitality',
      },
      unknownReasons: { roomCount: 'missing-room-count' },
    });
  });

  it('records candidate-not-found for every fact without inventing a fallback', () => {
    expect(resolveHotelCatalogueWritingSiteContext(undefined)).toEqual({
      siteContext: {},
      unknownReasons: {
        propertyType: 'candidate-not-found',
        roomCount: 'candidate-not-found',
        city: 'candidate-not-found',
        sector: 'candidate-not-found',
      },
    });
  });
});
