import { describe, expect, it } from 'vitest';
import {
  PROSPECT_PAGE_SIZE,
  buildProspectsPath,
  canGenerateFollowUp,
  clampOffset,
  createEmptyFilters,
  currentPage,
  isIdentityStatusValue,
  isQualificationValue,
  locationLabel,
  prospectSubPages,
  qualificationBadgeTone,
  reviewBadgeTone,
  totalPages,
} from './prospects-model';
import type { ProspectFilterState, ProspectRow } from './prospects-model';

function makeRow(overrides: Partial<ProspectRow> = {}): ProspectRow {
  return {
    candidateId: 'cand-1',
    name: 'Hotel Exemple',
    commune: 'Paris',
    postcode: '75001',
    starRating: 3,
    identityStatus: 'resolved',
    groupStatus: 'independent',
    campaignEligibility: 'eligible',
    reviewState: 'pending',
    qualificationOutcome: 'qualified',
    qualificationReasons: [],
    prescanStatus: 'complete',
    scoringVersion: 'v1',
    brokennessTotal: 4,
    abilityTotal: 12,
    worthy: true,
    contactState: 'found',
    threadState: 'e1-sent',
    outcome: null,
    ...overrides,
  };
}

describe('buildProspectsPath', () => {
  it('returns the bare path with only the page size when nothing is filtered', () => {
    expect(buildProspectsPath(createEmptyFilters(), 0)).toBe('/api/prospects?limit=25');
  });

  it('encodes the queue and every active filter under their API names', () => {
    const filters: ProspectFilterState = {
      queue: 'join-review',
      identityStatus: 'needs-review',
      groupStatus: '',
      reviewState: 'pending',
      qualificationOutcome: 'not-evaluated',
      search: '',
    };
    const path = buildProspectsPath(filters, 50);
    expect(path).toBe(
      '/api/prospects?queue=join-review&identityStatus=needs-review&reviewState=pending' +
        '&qualificationOutcome=not-evaluated&limit=25&offset=50',
    );
  });

  it('omits the offset on the first page', () => {
    const path = buildProspectsPath({ ...createEmptyFilters(), queue: 'parked' }, 0);
    expect(path).not.toContain('offset');
  });

  it('sends the search as q when it has content and trims surrounding whitespace', () => {
    const path = buildProspectsPath({ ...createEmptyFilters(), search: '  Hôtel Belvédère ' }, 0);
    expect(path).toBe('/api/prospects?q=H%C3%B4tel+Belv%C3%A9d%C3%A8re&limit=25');
  });

  it('omits q for a blank or whitespace-only search', () => {
    expect(buildProspectsPath({ ...createEmptyFilters(), search: '' }, 0)).not.toContain('q=');
    expect(buildProspectsPath({ ...createEmptyFilters(), search: '   ' }, 0)).not.toContain('q=');
  });
});

describe('pagination math', () => {
  it('counts pages of a total', () => {
    expect(totalPages(0, PROSPECT_PAGE_SIZE)).toBe(1);
    expect(totalPages(1, PROSPECT_PAGE_SIZE)).toBe(1);
    expect(totalPages(26, PROSPECT_PAGE_SIZE)).toBe(2);
  });

  it('numbers pages from the offset', () => {
    expect(currentPage(0, PROSPECT_PAGE_SIZE)).toBe(1);
    expect(currentPage(25, PROSPECT_PAGE_SIZE)).toBe(2);
  });

  it('clamps an offset that ran past a shrunken total to the last page', () => {
    expect(clampOffset(0, PROSPECT_PAGE_SIZE, 75)).toBe(0);
    expect(clampOffset(30, PROSPECT_PAGE_SIZE, 75)).toBe(25);
    expect(clampOffset(100, PROSPECT_PAGE_SIZE, 75)).toBe(75);
    expect(clampOffset(100, PROSPECT_PAGE_SIZE, 0)).toBe(0);
  });
});

describe('row labels', () => {
  it('joins commune and postcode when both exist', () => {
    expect(locationLabel(makeRow())).toBe('Paris 75001');
  });

  it('falls back to whichever location part exists', () => {
    expect(locationLabel(makeRow({ postcode: null })).length).toBeGreaterThan(0);
    expect(locationLabel(makeRow({ commune: null }))).toBe('75001');
  });

  it('renders an empty location when the catalogue knows neither', () => {
    expect(locationLabel(makeRow({ commune: null, postcode: null }))).toBe('');
  });
});

describe('badge tones', () => {
  it('marks a pending review as the queue work item', () => {
    expect(reviewBadgeTone('pending')).toBe('accent');
    expect(reviewBadgeTone('accepted')).toBe('minor');
    expect(reviewBadgeTone('rejected')).toBe('neutral');
    expect(reviewBadgeTone('not-required')).toBe('neutral');
  });

  it('marks qualified as the good end and parked as needing attention', () => {
    expect(qualificationBadgeTone('qualified')).toBe('minor');
    expect(qualificationBadgeTone('parked')).toBe('serious');
    expect(qualificationBadgeTone('not-evaluated')).toBe('accent');
    expect(qualificationBadgeTone('rejected')).toBe('neutral');
    expect(qualificationBadgeTone('group-routed')).toBe('neutral');
  });
});

describe('filter value guards', () => {
  it('accepts the empty string and known values only', () => {
    expect(isIdentityStatusValue('')).toBe(true);
    expect(isIdentityStatusValue('needs-review')).toBe(true);
    expect(isIdentityStatusValue('banana')).toBe(false);
    expect(isQualificationValue('')).toBe(true);
    expect(isQualificationValue('not-evaluated')).toBe(true);
    expect(isQualificationValue('banana')).toBe(false);
  });
});

describe('prospectSubPages', () => {
  it('links the five sibling pages of a candidate', () => {
    expect(prospectSubPages('cand-1').map((page) => page.path)).toEqual([
      '/prospects/cand-1/prescan',
      '/prospects/cand-1/score',
      '/prospects/cand-1/evidence',
      '/prospects/cand-1/preview',
      '/prospects/cand-1/outreach',
    ]);
  });

  it('encodes the candidate id into the paths', () => {
    expect(prospectSubPages('a/b').every((page) => !page.path.includes('a/b'))).toBe(true);
  });
});

describe('canGenerateFollowUp', () => {
  it('allows a follow-up only right after touch 1 or touch 2 was sent', () => {
    expect(canGenerateFollowUp('e1-sent')).toBe(true);
    expect(canGenerateFollowUp('e2-sent')).toBe(true);
  });

  it('refuses every other thread state', () => {
    expect(canGenerateFollowUp('e1-drafted')).toBe(false);
    expect(canGenerateFollowUp('e2-drafted')).toBe(false);
    expect(canGenerateFollowUp('e3-drafted')).toBe(false);
    expect(canGenerateFollowUp('e3-sent')).toBe(false);
    expect(canGenerateFollowUp('closed')).toBe(false);
  });
});
