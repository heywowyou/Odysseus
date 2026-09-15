import { describe, expect, it } from 'vitest';
import { directoryEntrySchema, prospectSchema } from './prospect.js';

describe('prospect contracts', () => {
  it('accepts a sector-neutral prospect with hotel facets', () => {
    const result = prospectSchema.safeParse({
      prospectId: '7f25f44c-0e4d-4b48-bf88-1f5a19b5e2f2',
      sector: 'hotel',
      name: 'ARK HÔTEL',
      websites: [
        {
          url: 'https://arkhotel.octosite.net',
          registrableDomain: 'octosite.net',
          kind: 'vendor-hosted',
          primary: true,
        },
      ],
      emails: [],
      status: 'new',
      hotel: { groupStatus: 'vendor-hosted', stars: 3 },
      fieldOrigins: { name: 'atout-france' },
      createdAt: new Date(),
      updatedAt: new Date(),
      lastActivityAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('keeps directory filters as first-class persisted facets', () => {
    expect(
      directoryEntrySchema.parse({
        directoryId: 'atout-france:ark',
        sector: 'hotel',
        name: 'ARK HÔTEL',
        postcode: '92100',
        department: '92',
        commune: 'Boulogne-Billancourt',
        websiteKind: 'vendor-hosted',
        groupStatus: 'unknown',
        stars: 3,
        rooms: 75,
        sourceRefs: [{ source: 'atout-france', sourceId: 'ark' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      }).department,
    ).toBe('92');
  });
});
