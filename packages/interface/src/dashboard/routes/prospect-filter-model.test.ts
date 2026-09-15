import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  buildProspectApiQuery,
  clearProspectFilters,
  parseProspectFilters,
  serializeProspectFilters,
  updateProspectFilter,
} from './prospect-filter-model';

describe('prospect filter model', () => {
  it('parses deep-linked state and normalizes an invalid page', () => {
    const state = parseProspectFilters(
      new URLSearchParams('q=Paris&view=results&roomsMin=10&page=not-a-page'),
    );

    expect(state).toMatchObject({ view: 'results', q: 'Paris', roomsMin: '10', page: 1 });
    expect(state.status).toBe('');
  });

  it('treats unknown views as the ordinary portfolio view', () => {
    expect(parseProspectFilters(new URLSearchParams('view=unknown')).view).toBe('all');
  });

  it('updates a known filter without dropping unknown context', () => {
    const next = updateProspectFilter(
      new URLSearchParams('view=results&experiment=compact&page=4'),
      'commune',
      ' Lyon ',
    );

    expect(next.toString()).toContain('view=results');
    expect(next.toString()).toContain('experiment=compact');
    expect(next.get('commune')).toBe('Lyon');
    expect(next.get('page')).toBe('1');
  });

  it('counts source-specific advanced filters', () => {
    const state = parseProspectFilters(
      new URLSearchParams('stars=4&department=75&postcode=75001&roomsMin=20'),
    );

    expect(activeFilterCount(state, 'prospects')).toBe(3);
    expect(activeFilterCount(state, 'directory')).toBe(2);
  });

  it('clears known filters but keeps the selected view and unknown context', () => {
    const next = clearProspectFilters(
      new URLSearchParams('view=results&q=Paris&status=won&sector=hotel&experiment=compact&page=8'),
    );

    expect(next.get('view')).toBe('results');
    expect(next.get('experiment')).toBe('compact');
    expect(next.get('q')).toBeNull();
    expect(next.get('status')).toBeNull();
    expect(next.get('sector')).toBeNull();
    expect(next.get('page')).toBe('1');
  });

  it('round-trips owned state while retaining unrelated query parameters', () => {
    const current = new URLSearchParams('experiment=compact&view=results');
    const state = parseProspectFilters(
      new URLSearchParams('view=results&q=Paris&sector=hotel&commune=Lyon&roomsMax=80&page=3'),
    );

    expect(serializeProspectFilters(state, current).toString()).toBe(
      'experiment=compact&view=results&q=Paris&sector=hotel&commune=Lyon&roomsMax=80&page=3',
    );
  });

  it('builds a bounded API query for each source', () => {
    const state = parseProspectFilters(
      new URLSearchParams(
        'q=Paris&status=won&sector=hotel&stars=4&department=75&commune=Paris&postcode=75001&hasScan=true&inactive=false&page=2',
      ),
    );

    expect(buildProspectApiQuery(state, 'prospects', 'results').toString()).toBe(
      'view=results&q=Paris&status=won&sector=hotel&stars=4&department=75&commune=Paris&hasScan=true&inactive=false&page=2&pageSize=50',
    );
    expect(buildProspectApiQuery(state, 'directory').toString()).toBe(
      'q=Paris&sector=hotel&stars=4&department=75&commune=Paris&postcode=75001&page=2&pageSize=50',
    );
  });
});
