import { describe, it, expect } from 'vitest';
import { qualifyHotelCandidate } from './qualify-hotel.js';
import type { HotelQualificationFacts, HotelSiteFacts } from '../types/hotel-qualification.js';

/** A candidate that passes every condition. Each test names only what it
 *  changes, so a test's subject is visible without reading the baseline. */
function healthySite(overrides: Partial<HotelSiteFacts> = {}): HotelSiteFacts {
  return {
    finalUrl: 'https://hotel-exemple.fr/',
    reachability: 'ok',
    parkedPage: false,
    reservationUrl: 'https://hotel-exemple.fr/reserver',
    bookingVendors: [],
    accessibilityStatementUrl: null,
    siren: '552100554',
    siret: null,
    mentionsLegalesUrl: 'https://hotel-exemple.fr/mentions-legales',
    redirectedWithinSite: false,
    ...overrides,
  };
}

function facts(overrides: Partial<HotelQualificationFacts> = {}): HotelQualificationFacts {
  return {
    starRating: 3,
    groupStatus: 'independent',
    ownRegistrableDomain: 'hotel-exemple.fr',
    reviewState: 'not-required',
    effectifBandCode: '11',
    capacity: 60,
    site: healthySite(),
    ...overrides,
  };
}

describe('qualifyHotelCandidate', () => {
  it('qualifies a healthy independent three-star hotel with no reasons', () => {
    const result = qualifyHotelCandidate(facts());
    expect(result.outcome).toBe('qualified');
    expect(result.reasons).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  describe('the three-star gate', () => {
    // The boundary the campaign is defined by. Two must park, three must pass.
    it.each([
      [1, 'parked', 'below-three-stars'],
      [2, 'parked', 'below-three-stars'],
      [3, 'qualified', undefined],
      [4, 'qualified', undefined],
      [5, 'qualified', undefined],
    ] as const)('rates %i as %s', (starRating, outcome, reason) => {
      const result = qualifyHotelCandidate(facts({ starRating }));
      expect(result.outcome).toBe(outcome);
      if (reason !== undefined) expect(result.reasons).toContain(reason);
    });

    it.each([null, undefined] as const)(
      'parks an unreadable rating (%s) separately',
      (starRating) => {
        const result = qualifyHotelCandidate(facts({ starRating: starRating ?? null }));
        expect(result.outcome).toBe('parked');
        expect(result.reasons).toEqual(['unknown-star-rating']);
      },
    );
  });

  describe('routing', () => {
    it('routes a chain member rather than rejecting it', () => {
      const result = qualifyHotelCandidate(facts({ groupStatus: 'group-member' }));
      expect(result.outcome).toBe('group-routed');
      expect(result.reasons).toEqual(['group-member']);
    });

    it('routes a vendor-hosted hotel under its own distinct reason', () => {
      const result = qualifyHotelCandidate(facts({ groupStatus: 'vendor-hosted' }));
      expect(result.outcome).toBe('group-routed');
      expect(result.reasons).toEqual(['vendor-hosted']);
    });

    it('marks a hotel already publishing an accessibility statement as engaged', () => {
      const result = qualifyHotelCandidate(
        facts({
          site: healthySite({
            accessibilityStatementUrl: 'https://hotel-exemple.fr/accessibilite',
          }),
        }),
      );
      expect(result.outcome).toBe('already-engaged');
      expect(result.reasons).toEqual(['accessibility-statement-published']);
    });

    it('prefers already-engaged over group routing, since the conversation differs most', () => {
      const result = qualifyHotelCandidate(
        facts({
          groupStatus: 'group-member',
          site: healthySite({
            accessibilityStatementUrl: 'https://hotel-exemple.fr/accessibilite',
          }),
        }),
      );
      expect(result.outcome).toBe('already-engaged');
      expect(result.reasons).toEqual(['accessibility-statement-published', 'group-member']);
    });
  });

  describe('site rejection', () => {
    it.each([
      ['dns-unresolved', 'dns-unresolved'],
      ['tls-invalid', 'tls-invalid'],
      ['redirect-loop', 'redirect-loop'],
      ['redirect-offsite', 'redirect-offsite'],
      ['http-error', 'http-error'],
      ['non-html-response', 'non-html-response'],
      ['robots-denied', 'robots-denied'],
      ['timeout', 'fetch-timeout'],
    ] as const)('rejects %s with reason %s', (reachability, reason) => {
      const result = qualifyHotelCandidate(facts({ site: healthySite({ reachability }) }));
      expect(result.outcome).toBe('rejected');
      expect(result.reasons).toEqual([reason]);
    });

    it('rejects a registrar holding page', () => {
      const result = qualifyHotelCandidate(facts({ site: healthySite({ parkedPage: true }) }));
      expect(result.outcome).toBe('rejected');
      expect(result.reasons).toEqual(['parked-domain-page']);
    });

    it('records no-own-domain once, not twice, when nothing was attempted', () => {
      const result = qualifyHotelCandidate(
        facts({
          ownRegistrableDomain: null,
          site: { reachability: 'not-attempted' },
        }),
      );
      expect(result.outcome).toBe('rejected');
      expect(result.reasons).toEqual(['no-own-domain']);
    });

    it('rejects rather than parks when the site is dead and the rating unknown', () => {
      // A human clearing a review queue cannot make an unresolvable domain
      // scannable, so the dead domain is the governing fact.
      const result = qualifyHotelCandidate(
        facts({ starRating: null, site: healthySite({ reachability: 'dns-unresolved' }) }),
      );
      expect(result.outcome).toBe('rejected');
      expect(result.reasons).toEqual(['dns-unresolved', 'unknown-star-rating']);
    });
  });

  describe('parking', () => {
    it('parks a candidate a human still has to look at', () => {
      const result = qualifyHotelCandidate(facts({ reviewState: 'pending' }));
      expect(result.outcome).toBe('parked');
      expect(result.reasons).toEqual(['awaiting-review']);
    });

    it.each(['not-required', 'accepted', 'rejected'] as const)(
      'does not park on review state %s',
      (reviewState) => {
        const result = qualifyHotelCandidate(facts({ reviewState }));
        expect(result.reasons).not.toContain('awaiting-review');
      },
    );

    it('parks a microenterprise only when effectif and capacity are both small', () => {
      const result = qualifyHotelCandidate(facts({ effectifBandCode: '02', capacity: 12 }));
      expect(result.outcome).toBe('parked');
      expect(result.reasons).toEqual(['microenterprise-scope-unresolved']);
    });

    it('does not park a small-capacity hotel with ten or more employees', () => {
      const result = qualifyHotelCandidate(facts({ effectifBandCode: '11', capacity: 12 }));
      expect(result.outcome).toBe('qualified');
    });

    it('does not park a small-effectif hotel with real capacity', () => {
      const result = qualifyHotelCandidate(facts({ effectifBandCode: '02', capacity: 80 }));
      expect(result.outcome).toBe('qualified');
    });

    it.each([null, ''] as const)(
      'treats an absent effectif band (%s) as unknown, never as small',
      (effectifBandCode) => {
        const result = qualifyHotelCandidate(facts({ effectifBandCode, capacity: 6 }));
        expect(result.outcome).toBe('qualified');
        expect(result.reasons).toEqual([]);
      },
    );

    it('treats an absent capacity as unknown, never as small', () => {
      const result = qualifyHotelCandidate(facts({ effectifBandCode: '02', capacity: null }));
      expect(result.outcome).toBe('qualified');
    });
  });

  describe('accumulation', () => {
    it('records every failing condition rather than the first one found', () => {
      const result = qualifyHotelCandidate(
        facts({
          starRating: 2,
          groupStatus: 'group-member',
          reviewState: 'pending',
          effectifBandCode: '01',
          capacity: 8,
          site: healthySite({ reachability: 'http-error' }),
        }),
      );
      expect(result.reasons).toEqual([
        'group-member',
        'http-error',
        'below-three-stars',
        'awaiting-review',
        'microenterprise-scope-unresolved',
      ]);
    });

    it('orders reasons independently of which facts were supplied', () => {
      const a = qualifyHotelCandidate(facts({ starRating: 2, reviewState: 'pending' }));
      const b = qualifyHotelCandidate(facts({ reviewState: 'pending', starRating: 2 }));
      expect(a.reasons).toEqual(b.reasons);
    });
  });

  describe('non-blocking notes', () => {
    it('notes a missing booking path without blocking qualification', () => {
      const result = qualifyHotelCandidate(facts({ site: healthySite({ reservationUrl: null }) }));
      expect(result.outcome).toBe('qualified');
      expect(result.notes).toEqual(['no-booking-path-detected']);
    });

    it('distinguishes an OTA-only funnel from no booking path at all', () => {
      const result = qualifyHotelCandidate(
        facts({
          site: healthySite({
            reservationUrl: null,
            bookingVendors: [{ hostname: 'www.booking.com', registrableDomain: 'booking.com' }],
          }),
        }),
      );
      expect(result.outcome).toBe('qualified');
      expect(result.notes).toEqual(['booking-path-offsite-only']);
    });

    it('notes a site publishing no identification', () => {
      const result = qualifyHotelCandidate(
        facts({ site: healthySite({ siren: null, siret: null }) }),
      );
      expect(result.outcome).toBe('qualified');
      expect(result.notes).toEqual(['no-identification-published']);
    });

    it('accepts a SIRET alone as published identification', () => {
      const result = qualifyHotelCandidate(
        facts({ site: healthySite({ siren: null, siret: '55210055400015' }) }),
      );
      expect(result.notes).not.toContain('no-identification-published');
    });

    it('records no notes when no page was read, since nothing was observed', () => {
      const result = qualifyHotelCandidate(
        facts({ site: healthySite({ reachability: 'dns-unresolved' }) }),
      );
      expect(result.notes).toEqual([]);
    });
  });
});

describe('deliberately not checked', () => {
  function notChecked(overrides: Partial<HotelQualificationFacts> = {}) {
    return qualifyHotelCandidate(facts({ site: { reachability: 'not-checked' }, ...overrides }));
  }

  it('contributes no reason of its own', () => {
    // A chain property nobody fetched must route on being a chain, not on a
    // site fact nobody gathered.
    const result = notChecked({ groupStatus: 'group-member' });
    expect(result.outcome).toBe('group-routed');
    expect(result.reasons).toEqual(['group-member']);
  });

  it('never reports a hotel with a good domain as having none', () => {
    // The defect this distinction exists to prevent.
    const result = notChecked({ starRating: 2 });
    expect(result.reasons).not.toContain('no-own-domain');
    expect(result.outcome).toBe('parked');
    expect(result.reasons).toEqual(['below-three-stars']);
  });

  it('records no notes, since nothing was observed', () => {
    expect(notChecked({ groupStatus: 'vendor-hosted' }).notes).toEqual([]);
  });
});

describe('a declared domain that moved TLD', () => {
  const moved = {
    reachability: 'redirect-offsite',
    redirectedToRelatedDomain: true,
    finalUrl: 'https://www.hotelchaponfin.fr/',
  } as const;

  it('parks rather than rejects, because a person can settle it in one look', () => {
    // Measured on the first live batch: hotelchaponfin.com redirects to
    // hotelchaponfin.fr. Rejecting discards a live hotel.
    const result = qualifyHotelCandidate(facts({ site: { ...moved } }));
    expect(result.outcome).toBe('parked');
    expect(result.reasons).toContain('domain-moved');
    expect(result.reasons).not.toContain('redirect-offsite');
  });

  it('still rejects an offsite landing on an unrelated domain', () => {
    const result = qualifyHotelCandidate(
      facts({ site: { reachability: 'redirect-offsite', finalUrl: 'https://booking.com/x' } }),
    );
    expect(result.outcome).toBe('rejected');
    expect(result.reasons).toContain('redirect-offsite');
  });
});
