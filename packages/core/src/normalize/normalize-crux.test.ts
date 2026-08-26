import { describe, expect, it } from 'vitest';
import {
  extractCruxCandidates,
  CRUX_LCP_POOR_RULE_ID,
  CRUX_CLS_POOR_RULE_ID,
  CRUX_INP_POOR_RULE_ID,
} from './normalize-crux.js';

describe('crux', () => {
  it('produces no candidates when CrUX has no public record', () => {
    expect(extractCruxCandidates({ available: false }, 'https://example.com/')).toEqual([]);
  });

  it('fires for a metric crossing the poor threshold', () => {
    const candidates = extractCruxCandidates(
      { available: true, lcp: { p75: 5000 }, cls: { p75: 0.05 }, inp: { p75: 100 } },
      'https://example.com/',
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ruleId).toBe(CRUX_LCP_POOR_RULE_ID);
    expect(candidates[0]?.category).toBe('performance');
    expect(candidates[0]?.pageUrl).toBe('https://example.com/');
  });

  it('does not fire when every available metric is within range', () => {
    expect(
      extractCruxCandidates(
        { available: true, lcp: { p75: 2000 }, cls: { p75: 0.05 }, inp: { p75: 100 } },
        'https://example.com/',
      ),
    ).toEqual([]);
  });

  it('fires for all three metrics when all cross their thresholds', () => {
    const candidates = extractCruxCandidates(
      { available: true, lcp: { p75: 4500 }, cls: { p75: 0.3 }, inp: { p75: 600 } },
      'https://example.com/',
    );
    expect(candidates.map((c) => c.ruleId).sort()).toEqual(
      [CRUX_LCP_POOR_RULE_ID, CRUX_CLS_POOR_RULE_ID, CRUX_INP_POOR_RULE_ID].sort(),
    );
  });
});
