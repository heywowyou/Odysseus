import { UNLIMITED_MAX_PAGES } from '@odysseus/scanner';
import { describe, expect, it } from 'vitest';
import { computeCrawlEtaMs, computeStageEtaMs, createDurationEstimator } from './eta.js';

describe('createDurationEstimator', () => {
  it('has no estimate before the first sample', () => {
    const estimator = createDurationEstimator();
    expect(estimator.estimateMs()).toBeUndefined();
    expect(estimator.sampleCount).toBe(0);
  });

  it('returns the sample itself after exactly one sample', () => {
    const estimator = createDurationEstimator();
    estimator.record(2000);
    expect(estimator.estimateMs()).toBe(2000);
    expect(estimator.sampleCount).toBe(1);
  });

  it('blends toward the overall average with few samples', () => {
    const estimator = createDurationEstimator();
    estimator.record(1000);
    estimator.record(3000);
    // overallAvg = 2000. ewma after 2nd sample = 0.35*3000 + 0.65*1000 = 1700.
    // blend weight at sampleCount=2 is 2/4 = 0.5 -> (2000+1700)/2 = 1850.
    expect(estimator.estimateMs()).toBe(1850);
  });

  it('clamps a single pathological outlier sample instead of jumping straight to it', () => {
    const estimator = createDurationEstimator();
    estimator.record(1000);
    estimator.record(1000);
    // ewma is 1000 here; a 100x outlier should be clamped to 3x (3000), not used raw.
    estimator.record(100_000);
    const estimate = estimator.estimateMs();
    expect(estimate).toBeDefined();
    // Overall average alone would be (1000+1000+100000)/3 = 34000; the
    // clamped EWMA channel (capped at 3x = 3000) pulls the blend well
    // below that even though the unclamped average still carries some
    // weight at only 3 samples.
    expect(estimate as number).toBeLessThan(20_000);
  });

  it('ignores negative or non-finite samples', () => {
    const estimator = createDurationEstimator();
    estimator.record(-5);
    estimator.record(Number.NaN);
    estimator.record(Number.POSITIVE_INFINITY);
    expect(estimator.sampleCount).toBe(0);
    expect(estimator.estimateMs()).toBeUndefined();
  });

  it('trusts the EWMA channel more as samples accumulate', () => {
    const estimator = createDurationEstimator();
    for (let i = 0; i < 20; i += 1) estimator.record(1000);
    estimator.record(4000);
    // With many stable samples, the blend leans heavily on the EWMA
    // channel (weight 21/23), so the clamped 3000 outlier moves the
    // estimate up only modestly rather than dragging it toward the raw
    // (1000*20+4000)/21 ~= 1143 overall average.
    const estimate = estimator.estimateMs() as number;
    expect(estimate).toBeGreaterThan(1000);
    expect(estimate).toBeLessThan(1800);
  });
});

describe('computeCrawlEtaMs', () => {
  // 2026-08-24: MAX_PAGES has no default limit any more, so the target the
  // formula subtracts from can be the UNLIMITED_MAX_PAGES sentinel. Without
  // this guard the dashboard rendered a countdown of roughly 285 million
  // years instead of simply omitting the estimate.
  it('returns undefined when the crawl is uncapped', () => {
    expect(
      computeCrawlEtaMs({
        visited: 12,
        maxPages: UNLIMITED_MAX_PAGES,
        queued: 5,
        effectiveDelayMs: 1000,
        observedPageCostMs: undefined,
      }),
    ).toBeUndefined();
  });

  it('falls back to the effective delay before any page cost has been observed', () => {
    expect(
      computeCrawlEtaMs({
        visited: 3,
        maxPages: 10,
        queued: 0,
        effectiveDelayMs: 1000,
        observedPageCostMs: undefined,
      }),
    ).toBe(7000);
  });

  it('uses the observed page cost once available, not the configured delay', () => {
    expect(
      computeCrawlEtaMs({
        visited: 3,
        maxPages: 10,
        queued: 0,
        effectiveDelayMs: 1000,
        observedPageCostMs: 2000,
      }),
    ).toBe(14_000);
  });

  it('caps remaining work at the live frontier when it is smaller than the cap allows', () => {
    // 7 pages remain by cap, but only 2 are actually queued -> use 2.
    expect(
      computeCrawlEtaMs({
        visited: 3,
        maxPages: 10,
        queued: 2,
        effectiveDelayMs: 1000,
        observedPageCostMs: undefined,
      }),
    ).toBe(2000);
  });

  it('falls back to the cap-derived remaining count once the frontier has drained', () => {
    expect(
      computeCrawlEtaMs({
        visited: 3,
        maxPages: 10,
        queued: 0,
        effectiveDelayMs: 1000,
        observedPageCostMs: undefined,
      }),
    ).toBe(7000);
  });

  it('returns 0 once maxPages has been reached', () => {
    expect(
      computeCrawlEtaMs({
        visited: 10,
        maxPages: 10,
        queued: 0,
        effectiveDelayMs: 1000,
        observedPageCostMs: undefined,
      }),
    ).toBe(0);
  });

  it('never goes negative if visited somehow exceeds maxPages', () => {
    expect(
      computeCrawlEtaMs({
        visited: 12,
        maxPages: 10,
        queued: 0,
        effectiveDelayMs: 1000,
        observedPageCostMs: undefined,
      }),
    ).toBe(0);
  });

  it('returns 0 for a zero delay', () => {
    expect(
      computeCrawlEtaMs({
        visited: 0,
        maxPages: 10,
        queued: 0,
        effectiveDelayMs: 0,
        observedPageCostMs: undefined,
      }),
    ).toBe(0);
  });
});

describe('computeStageEtaMs', () => {
  it('has no estimate before the first sample', () => {
    expect(
      computeStageEtaMs({
        completed: 0,
        target: 5,
        concurrency: 1,
        smoothedPageDurationMs: undefined,
      }),
    ).toBeUndefined();
  });

  it('projects remaining pages across a serial (concurrency 1) stage', () => {
    expect(
      computeStageEtaMs({ completed: 2, target: 5, concurrency: 1, smoothedPageDurationMs: 2000 }),
    ).toBe(6000);
  });

  it('groups remaining pages into waves for a concurrent stage', () => {
    // 7 remaining pages / 3 lanes -> 3 waves of one page's duration.
    expect(
      computeStageEtaMs({ completed: 3, target: 10, concurrency: 3, smoothedPageDurationMs: 1000 }),
    ).toBe(3000);
  });

  it('treats a fractional or zero concurrency as at least 1', () => {
    expect(
      computeStageEtaMs({ completed: 0, target: 4, concurrency: 0, smoothedPageDurationMs: 1000 }),
    ).toBe(4000);
  });

  it('returns 0 once completed reaches target', () => {
    expect(
      computeStageEtaMs({ completed: 5, target: 5, concurrency: 1, smoothedPageDurationMs: 5000 }),
    ).toBe(0);
  });

  it('never goes negative if completed somehow exceeds target', () => {
    expect(
      computeStageEtaMs({ completed: 6, target: 5, concurrency: 1, smoothedPageDurationMs: 5000 }),
    ).toBe(0);
  });
});
