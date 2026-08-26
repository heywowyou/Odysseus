import { describe, expect, it } from 'vitest';
import { estimateRevenueImpact } from './calculator.js';
import { REFERENCE_STAT_TABLE } from './stats.js';

function findStat(id: string) {
  const stat = REFERENCE_STAT_TABLE.find((s) => s.id === id);
  if (!stat) throw new Error(`fixture stat not found: ${id}`);
  return stat;
}

describe('estimateRevenueImpact', () => {
  it('multiplies a scalable ratio against the given revenue', () => {
    const stat = findStat('deloitte-speed-conversion-travel-2020');
    const result = estimateRevenueImpact(stat, 500_000);
    expect(result).toEqual({ revenueGainEur: 50_500 });
  });

  it('refuses a context-only stat', () => {
    // legal-general-w3c-case-study (the original fixture for this test)
    // was removed from stats.ts 2026-08-18 (item 1.5: wrong-sector, undated
    // UK case study cited to a French hotel client) - any other
    // 'context-only' row exercises the same behaviour.
    const stat = findStat('nestle-rich-results-ctr');
    const result = estimateRevenueImpact(stat, 500_000);
    expect(result).toEqual({ error: 'not-scalable' });
  });

  it('passes zero revenue through with no clamping', () => {
    const stat = findStat('deloitte-speed-conversion-travel-2020');
    const result = estimateRevenueImpact(stat, 0);
    expect(result).toEqual({ revenueGainEur: 0 });
  });

  it("passes negative revenue through with no clamping (caller contract, not this function's)", () => {
    const stat = findStat('deloitte-speed-conversion-travel-2020');
    const result = estimateRevenueImpact(stat, -1000);
    expect(result).toEqual({ revenueGainEur: -101 });
  });
});
