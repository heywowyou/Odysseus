import { describe, expect, it } from 'vitest';
import { fr } from '../i18n/fr';
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
  qualificationBadgeTone,
  reviewBadgeTone,
  selectionBadgeTone,
  selectionCountLine,
  totalPages,
} from './prospects-model';
import type {
  ProspectFilterState,
  ProspectRow,
  SelectionCohortFactsResponse,
} from './prospects-model';

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
    qualificationFreshness: { state: 'missing' },
    scoreFreshness: { state: 'missing' },
    prescanStatus: 'complete',
    scoringVersion: 'v1',
    brokennessTotal: 4,
    abilityTotal: 12,
    worthy: true,
    contactState: 'found',
    threadState: 'e1-sent',
    outcome: null,
    inSelection: false,
    selectionSource: null,
    selectionRank: null,
    ...overrides,
  };
}

describe('buildProspectsPath', () => {
  it('defaults to the selection filter, with only the page size otherwise', () => {
    expect(buildProspectsPath(createEmptyFilters(), 0)).toBe(
      '/api/prospects?inSelection=true&limit=25',
    );
  });

  it('encodes the queue and every active filter under their API names', () => {
    const filters: ProspectFilterState = {
      queue: 'join-review',
      selection: 'all',
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

  it('omits inSelection once the operator switches the filter to the whole catalogue', () => {
    const path = buildProspectsPath({ ...createEmptyFilters(), selection: 'all' }, 0);
    expect(path).not.toContain('inSelection');
  });

  it('omits the offset on the first page', () => {
    const path = buildProspectsPath({ ...createEmptyFilters(), queue: 'parked' }, 0);
    expect(path).not.toContain('offset');
  });

  it('sends the search as q when it has content and trims surrounding whitespace', () => {
    const path = buildProspectsPath({ ...createEmptyFilters(), search: '  Hôtel Belvédère ' }, 0);
    expect(path).toBe('/api/prospects?inSelection=true&q=H%C3%B4tel+Belv%C3%A9d%C3%A8re&limit=25');
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

  it('marks selection membership as the good end, absence as neutral rather than bad', () => {
    expect(selectionBadgeTone(true)).toBe('minor');
    expect(selectionBadgeTone(false)).toBe('neutral');
  });
});

describe('selectionCountLine', () => {
  const cohort: SelectionCohortFactsResponse = {
    cohortId: 'cohort-1',
    scoringVersion: 'hotel-outreach-v1',
    computedAt: '2026-09-08T00:00:00.000Z',
    populationSize: 42,
    selectedCount: 6,
    abilityCutoff: 60,
    brokennessCutoff: 40,
  };

  it('interpolates the selected, scored, and total counts', () => {
    expect(selectionCountLine(fr, cohort, 10, 9765)).toBe(
      '10 dans la sélection, 42 scorés, 9765 au catalogue',
    );
  });

  it('falls back to the vocabulary placeholder when no cohort has ever been approved', () => {
    expect(selectionCountLine(fr, null, 0, 9765)).toBe(
      `0 dans la sélection, ${fr.common.vocabularyFallback} scorés, 9765 au catalogue`,
    );
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
