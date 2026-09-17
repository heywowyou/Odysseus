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

  it('marks a chain booking portal as a chain website', () => {
    const entry = directoryEntryFromHotelSource({
      source: 'atout-france',
      sourceId: 'mercure',
      sourceVersion: 'fixture',
      retrievedAt: new Date(),
      licence: 'fr-lo',
      name: 'MERCURE BORDEAUX GARE ATLANTIC',
      declaredWebsite: 'https://all.accor.com/hotel/B4Z0/index.fr.shtml',
      accommodationType: 'HÔTEL DE TOURISME',
      starRating: 4,
      roomCount: 120,
      warnings: [],
    });
    expect(entry.websiteKind).toBe('chain');
    expect(entry.registrableDomain).toBe('accor.com');
  });
});
