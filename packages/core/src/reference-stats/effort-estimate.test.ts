import { describe, expect, it } from 'vitest';
import { estimateAggregateEffortDays } from './effort-estimate.js';

describe('estimateAggregateEffortDays', () => {
  it('returns zero for an empty list', () => {
    expect(estimateAggregateEffortDays([])).toEqual({ minDays: 0, maxDays: 0 });
  });

  it("sums each effort label's own day range", () => {
    const result = estimateAggregateEffortDays(['low', 'low', 'medium', 'high']);
    // low: 0.25-1, low: 0.25-1, medium: 1-3, high: 3-7
    expect(result.minDays).toBeCloseTo(0.25 + 0.25 + 1 + 3);
    expect(result.maxDays).toBeCloseTo(1 + 1 + 3 + 7);
  });

  it('never throws for any combination of the three effort labels', () => {
    expect(() =>
      estimateAggregateEffortDays(['low', 'medium', 'high', 'low', 'medium', 'high']),
    ).not.toThrow();
  });
});
