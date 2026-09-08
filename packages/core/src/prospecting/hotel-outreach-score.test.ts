import { describe, it, expect } from 'vitest';
import {
  CURRENT_SCORING_VERSION,
  computeHotelOutreachScore,
  getHotelOutreachScoreConfig,
  isHotelOutreachWorthy,
  type HotelOutreachScoreInput,
  type HotelScorePageFacts,
} from './hotel-outreach-score.js';

/** A healthy, unremarkable hotel: nothing broken, nothing missing. Each test
 *  names only what it changes, so a test's subject is visible without reading
 *  the baseline. */
function input(overrides: Partial<HotelOutreachScoreInput> = {}): HotelOutreachScoreInput {
  return {
    candidateId: 'candidate-1',
    pages: [page()],
    evidence: { status: 'incomplete', specificFailureReason: null, summarySeverities: [] },
    starRating: 3,
    capacity: 10,
    groupStatus: 'independent',
    effectifBandCode: null,
    reservationUrl: null,
    offsiteBookingCount: 0,
    ...overrides,
  };
}

function page(overrides: Partial<HotelScorePageFacts> = {}): HotelScorePageFacts {
  return {
    missingPercent: 0,
    axeCritical: 0,
    axeSerious: 0,
    consoleErrorCount: 0,
    largestContentfulPaintMs: 1200,
    mainThreadBlockingMs: 50,
    cumulativeLayoutShift: 0.01,
    ...overrides,
  };
}

function component(
  score: ReturnType<typeof computeHotelOutreachScore>,
  side: 'brokenness' | 'ability',
  id: string,
): { points: number; reason: string } {
  const found = score[side].components.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no ${side} component ${id}`);
  return { points: found.points, reason: found.reason };
}

describe('computeHotelOutreachScore brokenness', () => {
  it('scores a severe render gap above a material one', () => {
    const severe = computeHotelOutreachScore(input({ pages: [page({ missingPercent: 62 })] }));
    const material = computeHotelOutreachScore(input({ pages: [page({ missingPercent: 24 })] }));
    expect(component(severe, 'brokenness', 'render-gap')).toEqual({
      points: 30,
      reason: 'render-gap-severe',
    });
    expect(component(material, 'brokenness', 'render-gap')).toEqual({
      points: 18,
      reason: 'render-gap-material',
    });
  });

  it('separates a gap below the threshold from a gap nobody measured', () => {
    const below = computeHotelOutreachScore(input({ pages: [page({ missingPercent: 4 })] }));
    const unknown = computeHotelOutreachScore(input({ pages: [page({ missingPercent: null })] }));
    expect(component(below, 'brokenness', 'render-gap').reason).toBe('render-gap-below-threshold');
    expect(component(unknown, 'brokenness', 'render-gap').reason).toBe('render-gap-unknown');
    expect(component(unknown, 'brokenness', 'render-gap').points).toBe(0);
  });

  it('weights a booking-page failure above a generic one', () => {
    const booking = computeHotelOutreachScore(
      input({
        evidence: {
          status: 'complete',
          specificFailureReason: 'booking-keyboard-trap',
          summarySeverities: ['serious'],
        },
      }),
    );
    const generic = computeHotelOutreachScore(
      input({
        evidence: {
          status: 'complete',
          specificFailureReason: 'generic-element-failure',
          summarySeverities: ['serious'],
        },
      }),
    );
    expect(component(booking, 'brokenness', 'booking-failure')).toEqual({
      points: 25,
      reason: 'booking-page-failure-captured',
    });
    expect(component(generic, 'brokenness', 'booking-failure')).toEqual({
      points: 12,
      reason: 'generic-failure-captured',
    });
  });

  it('bands axe criticals and seriouses across every page', () => {
    const many = computeHotelOutreachScore(
      input({ pages: [page({ axeCritical: 2 }), page({ axeCritical: 1, axeSerious: 6 })] }),
    );
    expect(component(many, 'brokenness', 'axe-critical')).toEqual({
      points: 20,
      reason: 'axe-critical-many',
    });
    expect(component(many, 'brokenness', 'axe-serious')).toEqual({
      points: 12,
      reason: 'axe-serious-many',
    });

    const some = computeHotelOutreachScore(
      input({ pages: [page({ axeCritical: 1, axeSerious: 2 })] }),
    );
    expect(component(some, 'brokenness', 'axe-critical').reason).toBe('axe-critical-present');
    expect(component(some, 'brokenness', 'axe-serious')).toEqual({
      points: 7,
      reason: 'axe-serious-several',
    });

    const one = computeHotelOutreachScore(input({ pages: [page({ axeSerious: 1 })] }));
    expect(component(one, 'brokenness', 'axe-serious')).toEqual({
      points: 3,
      reason: 'axe-serious-present',
    });
  });

  it('records an unobserved axe pass as unknown, not as clean', () => {
    const score = computeHotelOutreachScore(
      input({ pages: [page({ axeCritical: null, axeSerious: null })] }),
    );
    expect(component(score, 'brokenness', 'axe-critical').reason).toBe('axe-unknown');
    expect(component(score, 'brokenness', 'axe-serious').reason).toBe('axe-unknown');
  });

  it('bands console errors', () => {
    expect(
      component(
        computeHotelOutreachScore(
          input({ pages: [page({ consoleErrorCount: 7 }), page({ consoleErrorCount: 4 })] }),
        ),
        'brokenness',
        'console-errors',
      ),
    ).toEqual({ points: 8, reason: 'console-errors-many' });
    expect(
      component(
        computeHotelOutreachScore(input({ pages: [page({ consoleErrorCount: 1 })] })),
        'brokenness',
        'console-errors',
      ),
    ).toEqual({ points: 4, reason: 'console-errors-present' });
    expect(
      component(
        computeHotelOutreachScore(input({ pages: [page({ consoleErrorCount: null })] })),
        'brokenness',
        'console-errors',
      ).reason,
    ).toBe('console-errors-unknown');
  });

  it('fires the metric band on any one poor metric and records absence separately', () => {
    for (const overrides of [
      { largestContentfulPaintMs: 4200 },
      { mainThreadBlockingMs: 900 },
      { cumulativeLayoutShift: 0.4 },
    ]) {
      const score = computeHotelOutreachScore(input({ pages: [page(overrides)] }));
      expect(component(score, 'brokenness', 'metrics')).toEqual({
        points: 5,
        reason: 'metrics-poor',
      });
    }
    const unobserved = computeHotelOutreachScore(
      input({
        pages: [
          page({
            largestContentfulPaintMs: null,
            mainThreadBlockingMs: null,
            cumulativeLayoutShift: null,
          }),
        ],
      }),
    );
    expect(component(unobserved, 'brokenness', 'metrics').reason).toBe('metrics-unobserved');
  });

  it('totals 100 when every brokenness band fires', () => {
    const score = computeHotelOutreachScore(
      input({
        pages: [
          page({
            missingPercent: 80,
            axeCritical: 4,
            axeSerious: 9,
            consoleErrorCount: 20,
            largestContentfulPaintMs: 8000,
          }),
        ],
        evidence: {
          status: 'complete',
          specificFailureReason: 'booking-form-error',
          summarySeverities: ['critical'],
        },
      }),
    );
    expect(score.brokenness.total).toBe(100);
  });
});

describe('computeHotelOutreachScore ability', () => {
  it('prefers a first-party reservation path over an offsite one', () => {
    const direct = computeHotelOutreachScore(
      input({ reservationUrl: 'https://example.fr/reserver' }),
    );
    const offsite = computeHotelOutreachScore(input({ offsiteBookingCount: 2 }));
    const none = computeHotelOutreachScore(input());
    expect(component(direct, 'ability', 'direct-booking')).toEqual({
      points: 30,
      reason: 'direct-booking-on-own-domain',
    });
    expect(component(offsite, 'ability', 'direct-booking')).toEqual({
      points: 10,
      reason: 'booking-offsite-only',
    });
    expect(component(none, 'ability', 'direct-booking')).toEqual({
      points: 0,
      reason: 'booking-path-undetected',
    });
  });

  it('lets v2 use only direct booking evidence captured by a v4 prescan', () => {
    const config = getHotelOutreachScoreConfig('hotel-outreach-v2');
    const detected = computeHotelOutreachScore(
      input({
        prescanVersion: 'v4',
        bookingEvidenceKinds: ['delegated-booking-single-property'],
      }),
      config,
    );
    const olderPrescan = computeHotelOutreachScore(
      input({
        prescanVersion: 'v3',
        bookingEvidenceKinds: ['delegated-booking-single-property'],
      }),
      config,
    );
    const inconclusive = computeHotelOutreachScore(
      input({
        prescanVersion: 'v4',
        bookingEvidenceKinds: ['booking-control-unresolved', 'delegated-booking-undetermined'],
      }),
      config,
    );

    expect(component(detected, 'ability', 'direct-booking')).toEqual({
      points: 30,
      reason: 'direct-booking-detected-by-prescan',
    });
    expect(component(olderPrescan, 'ability', 'direct-booking')).toEqual({
      points: 0,
      reason: 'booking-path-undetected',
    });
    expect(component(inconclusive, 'ability', 'direct-booking')).toEqual({
      points: 0,
      reason: 'booking-path-undetected',
    });
  });

  it('scores four and five stars above three', () => {
    expect(
      component(computeHotelOutreachScore(input({ starRating: 5 })), 'ability', 'star-rating'),
    ).toEqual({
      points: 20,
      reason: 'star-rating-four-or-five',
    });
    expect(
      component(computeHotelOutreachScore(input({ starRating: 3 })), 'ability', 'star-rating'),
    ).toEqual({
      points: 12,
      reason: 'star-rating-three',
    });
    expect(
      component(computeHotelOutreachScore(input({ starRating: null })), 'ability', 'star-rating')
        .reason,
    ).toBe('star-rating-unknown');
  });

  it('falls back to rooms only when capacity is missing', () => {
    expect(
      component(computeHotelOutreachScore(input({ capacity: 40 })), 'ability', 'capacity'),
    ).toEqual({
      points: 15,
      reason: 'capacity-meaningful',
    });
    expect(
      component(
        computeHotelOutreachScore(input({ capacity: null, roomCount: 30 })),
        'ability',
        'capacity',
      ).reason,
    ).toBe('capacity-meaningful');
    expect(
      component(
        computeHotelOutreachScore(input({ capacity: 12, roomCount: 30 })),
        'ability',
        'capacity',
      ).reason,
    ).toBe('capacity-small');
    expect(
      component(
        computeHotelOutreachScore(input({ capacity: null, roomCount: null })),
        'ability',
        'capacity',
      ).reason,
    ).toBe('capacity-unknown');
  });

  it('reads the effectif band through the shipped threshold', () => {
    expect(
      component(
        computeHotelOutreachScore(input({ effectifBandCode: '21' })),
        'ability',
        'effectif',
      ),
    ).toEqual({ points: 20, reason: 'effectif-ten-or-more' });
    expect(
      component(computeHotelOutreachScore(input({ effectifBandCode: '02' })), 'ability', 'effectif')
        .points,
    ).toBe(0);
  });

  it('uses Atout France room bands in the unapproved v2 configuration', () => {
    const config = getHotelOutreachScoreConfig('hotel-outreach-v2');
    const large = computeHotelOutreachScore(input({ roomCount: 50 }), config);
    const medium = computeHotelOutreachScore(input({ roomCount: 25 }), config);
    const small = computeHotelOutreachScore(input({ roomCount: 24 }), config);
    const sireneFallback = computeHotelOutreachScore(
      input({ roomCount: null, effectifBandCode: '21' }),
      config,
    );

    expect(component(large, 'ability', 'effectif')).toEqual({
      points: 20,
      reason: 'room-count-fifty-or-more',
    });
    expect(component(medium, 'ability', 'effectif')).toEqual({
      points: 12,
      reason: 'room-count-twenty-five-to-forty-nine',
    });
    expect(component(small, 'ability', 'effectif')).toEqual({
      points: 0,
      reason: 'room-count-under-twenty-five',
    });
    expect(component(sireneFallback, 'ability', 'effectif')).toEqual({
      points: 20,
      reason: 'effectif-ten-or-more',
    });
  });

  it('scores independence only for an independent hotel', () => {
    expect(
      component(
        computeHotelOutreachScore(input({ groupStatus: 'independent' })),
        'ability',
        'independence',
      ),
    ).toEqual({ points: 15, reason: 'independent' });
    for (const groupStatus of ['group-member', 'vendor-hosted', 'unknown'] as const) {
      expect(
        component(computeHotelOutreachScore(input({ groupStatus })), 'ability', 'independence'),
      ).toEqual({ points: 0, reason: 'not-independent' });
    }
  });

  it('totals 100 when every ability band fires', () => {
    const score = computeHotelOutreachScore(
      input({
        reservationUrl: 'https://example.fr/reserver',
        starRating: 4,
        capacity: 60,
        effectifBandCode: '21',
        groupStatus: 'independent',
      }),
    );
    expect(score.ability.total).toBe(100);
  });
});

describe('computeHotelOutreachScore determinism', () => {
  it('is unchanged by the order the pages arrive in', () => {
    const pages = [
      page({ missingPercent: 55, axeCritical: 1 }),
      page({ missingPercent: 10, axeSerious: 3, consoleErrorCount: 2 }),
      page({ largestContentfulPaintMs: 5000 }),
    ];
    const forward = computeHotelOutreachScore(input({ pages }));
    const reversed = computeHotelOutreachScore(input({ pages: [...pages].reverse() }));
    expect(reversed).toEqual(forward);
  });

  it('stamps the configuration version it used', () => {
    expect(computeHotelOutreachScore(input()).scoringVersion).toBe(CURRENT_SCORING_VERSION);
  });

  it('refuses an unknown configuration version rather than scoring with a default', () => {
    expect(() => getHotelOutreachScoreConfig('hotel-outreach-v9')).toThrow(
      /Unknown hotel outreach/,
    );
  });

  it('keeps v2 unapproved until the operator reviews its score diff', () => {
    expect(getHotelOutreachScoreConfig('hotel-outreach-v2').approved).toBe(false);
  });
});

describe('isHotelOutreachWorthy', () => {
  it('requires complete evidence', () => {
    expect(
      isHotelOutreachWorthy(
        input({
          pages: [page({ missingPercent: 70 })],
          evidence: {
            status: 'incomplete',
            specificFailureReason: 'booking-form-error',
            summarySeverities: ['critical'],
          },
        }),
      ),
    ).toBe(false);
  });

  it('accepts a material render gap', () => {
    expect(
      isHotelOutreachWorthy(
        input({
          pages: [page({ missingPercent: 21 })],
          evidence: {
            status: 'complete',
            specificFailureReason: null,
            summarySeverities: ['minor'],
          },
        }),
      ),
    ).toBe(true);
  });

  it('accepts a critical or serious observation with no render gap', () => {
    for (const severity of ['critical', 'serious'] as const) {
      expect(
        isHotelOutreachWorthy(
          input({
            evidence: {
              status: 'complete',
              specificFailureReason: null,
              summarySeverities: [severity],
            },
          }),
        ),
      ).toBe(true);
    }
  });

  it('rejects complete evidence that only says small things', () => {
    expect(
      isHotelOutreachWorthy(
        input({
          evidence: {
            status: 'complete',
            specificFailureReason: 'generic-element-failure',
            summarySeverities: ['moderate', 'minor'],
          },
        }),
      ),
    ).toBe(false);
  });
});
