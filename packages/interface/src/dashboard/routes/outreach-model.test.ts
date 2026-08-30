import { describe, expect, it } from 'vitest';
import {
  OUTCOME_VALUES,
  clampedOffset,
  pageState,
  summaryLostReasonCounts,
  summaryOutcomeCounts,
} from './outreach-model';

describe('OUTCOME_VALUES', () => {
  it('matches the store vocabulary by value and order', () => {
    expect(OUTCOME_VALUES).toEqual([
      'no-reply',
      'reply-positive',
      'reply-not-now',
      'reply-negative',
      'opt-out',
      'call',
      'quoted',
      'won',
      'lost',
    ]);
  });
});

describe('summaryOutcomeCounts', () => {
  it('orders counts in lifecycle order and drops zero counts', () => {
    expect(summaryOutcomeCounts({ won: 2, 'no-reply': 5, 'reply-negative': 0, lost: 1 })).toEqual([
      { outcome: 'no-reply', count: 5 },
      { outcome: 'won', count: 2 },
      { outcome: 'lost', count: 1 },
    ]);
  });

  it('keeps unknown values from a newer API, sorted after the known ones', () => {
    expect(summaryOutcomeCounts({ newcomer: 3, won: 1 })).toEqual([
      { outcome: 'won', count: 1 },
      { outcome: 'newcomer', count: 3 },
    ]);
  });

  it('returns an empty list for an empty aggregate', () => {
    expect(summaryOutcomeCounts({})).toEqual([]);
  });
});

describe('summaryLostReasonCounts', () => {
  it('sorts alphabetically and drops zero counts', () => {
    expect(summaryLostReasonCounts({ timing: 2, budget: 0, 'existing-provider': 4 })).toEqual([
      { reason: 'existing-provider', count: 4 },
      { reason: 'timing', count: 2 },
    ]);
  });
});

describe('pageState', () => {
  it('computes page numbers and window bounds', () => {
    expect(pageState(120, 50, 0)).toEqual({ page: 1, pages: 3, hasPrevious: false, hasNext: true });
    expect(pageState(120, 50, 50)).toEqual({ page: 2, pages: 3, hasPrevious: true, hasNext: true });
    expect(pageState(120, 50, 100)).toEqual({
      page: 3,
      pages: 3,
      hasPrevious: true,
      hasNext: false,
    });
  });

  it('reads a partial last page as its own page', () => {
    expect(pageState(61, 50, 50)).toEqual({ page: 2, pages: 2, hasPrevious: true, hasNext: false });
  });

  it('never reports fewer than one page, even when empty', () => {
    expect(pageState(0, 50, 0)).toEqual({ page: 1, pages: 1, hasPrevious: false, hasNext: false });
  });
});

describe('clampedOffset', () => {
  it('keeps a valid offset unchanged', () => {
    expect(clampedOffset(120, 50, 50)).toBe(50);
  });

  it('steps back when the data shrank past the current window', () => {
    expect(clampedOffset(60, 50, 50)).toBe(10);
    expect(clampedOffset(50, 50, 50)).toBe(0);
  });

  it('returns zero for an empty list or a first page', () => {
    expect(clampedOffset(0, 50, 50)).toBe(0);
    expect(clampedOffset(30, 50, 0)).toBe(0);
  });
});
