import { describe, expect, it } from 'vitest';
import { directoryEntryFromHotelSource } from './directory-entry.js';

describe('directoryEntryFromHotelSource', () => {
  it('retains vendor-hosted sites as a searchable directory facet', () => {
    const entry = directoryEntryFromHotelSource({
      source: 'atout-france',
      sourceId: 'ark',
      sourceVersion: 'fixture',
      retrievedAt: new Date(),
      licence: 'fr-lo',
      name: 'ARK HÔTEL',
      declaredWebsite: 'https://arkhotel.octosite.net',
      accommodationType: 'HÔTEL DE TOURISME',
      starRating: 3,
      roomCount: 75,
      warnings: [],
    });
    expect(entry.websiteKind).toBe('vendor-hosted');
    expect(entry.registrableDomain).toBe('octosite.net');
    expect(entry.directoryId).toBe('atout-france:ark');
  });
});
