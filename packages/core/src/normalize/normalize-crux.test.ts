import { describe, expect, it } from 'vitest';
import {
  extractCruxCandidates,
  CRUX_LCP_POOR_RULE_ID,
  CRUX_CLS_POOR_RULE_ID,
  CRUX_INP_POOR_RULE_ID,
  goodFieldMetrics,
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

describe('goodFieldMetrics (issue #300)', () => {
  it('reports nothing for a site with no public CrUX record', () => {
    expect(goodFieldMetrics({ available: false })).toEqual(new Set());
    expect(goodFieldMetrics(undefined)).toEqual(new Set());
  });

  it('reports only the metrics real visitors experience as good', () => {
    // The Haaitza field record: LCP 2.4s and CLS 0.04 are good, INP 260ms
    // is not.
    const good = goodFieldMetrics({
      available: true,
      lcp: { p75: 2400 },
      cls: { p75: 0.04 },
      inp: { p75: 260 },
    });
    expect(good).toEqual(new Set(['lcp', 'cls']));
  });

  it('treats a metric sitting exactly on its threshold as good', () => {
    expect(
      goodFieldMetrics({
        available: true,
        lcp: { p75: 2500 },
        cls: { p75: 0.1 },
        inp: { p75: 200 },
      }),
    ).toEqual(new Set(['lcp', 'cls', 'inp']));
  });

  it('omits a metric CrUX does not report at all', () => {
    expect(goodFieldMetrics({ available: true, lcp: { p75: 1000 } })).toEqual(new Set(['lcp']));
  });
});
