import { describe, expect, it } from 'vitest';
import {
  findHotelChainPortal,
  hasHotelChainBrandName,
  websiteKindForResolution,
} from './hotel-chain-portals.js';
import { normalizeDeclaredWebsite } from './hotel-domain.js';

function kindOf(raw: string): string {
  const resolution = normalizeDeclaredWebsite(raw);
  return resolution.kind === 'unusable' ? 'unusable' : websiteKindForResolution(resolution);
}

describe('hotel chain portals', () => {
  it('classifies chain booking portals as chain websites, not own sites', () => {
    expect(kindOf('https://www.marriott.fr/hotels/bodmc')).toBe('chain');
    expect(kindOf('https://all.accor.com/hotel/1234/index.fr.shtml')).toBe('chain');
    expect(kindOf('www.hotel-bb.com/fr/hotel/bordeaux')).toBe('chain');
    expect(kindOf('https://www.atlantichotel.fr/')).toBe('own');
    expect(kindOf('https://arkhotel.octosite.net')).toBe('vendor-hosted');
  });

  it('matches exact registrable domains only', () => {
    expect(findHotelChainPortal('notaccor.com')).toBeUndefined();
    expect(findHotelChainPortal('ACCOR.com')?.chain).toBe('Accor');
  });

  it('recognises corporate brand names as whole words', () => {
    expect(hasHotelChainBrandName('5 TERRES HÔTEL & SPA MGALLERY BY SOFITEL')).toBe(true);
    expect(hasHotelChainBrandName('25HOURS HÔTEL TERMINUS NORD')).toBe(true);
    expect(hasHotelChainBrandName('Hôtel Première Classe Lyon')).toBe(true);
    expect(hasHotelChainBrandName('ATLANTIC HÔTEL')).toBe(false);
    expect(hasHotelChainBrandName('Hôtel Les Libis')).toBe(false);
    expect(hasHotelChainBrandName('Logis Hôtel du Parc')).toBe(false);
  });
});
