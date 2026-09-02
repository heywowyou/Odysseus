import { UNLIMITED_MAX_PAGES } from '@odysseus/scanner';
import { describe, expect, it } from 'vitest';
import { computeCrawlEtaMs, computeScanEtaMs, computeStageEtaMs } from './eta.js';

describe('computeCrawlEtaMs', () => {
  // 2026-08-24: MAX_PAGES has no default limit any more, so the target the
  // formula subtracts from can be the UNLIMITED_MAX_PAGES sentinel. Without
  // this guard the dashboard rendered a countdown of roughly 285 million
  // years instead of simply omitting the estimate.
  it('returns undefined when the crawl is uncapped', () => {
    expect(
      computeCrawlEtaMs({ visited: 12, maxPages: UNLIMITED_MAX_PAGES, effectiveDelayMs: 1000 }),
    ).toBeUndefined();
  });

  it('multiplies remaining pages by the effective delay', () => {
    expect(computeCrawlEtaMs({ visited: 3, maxPages: 10, effectiveDelayMs: 1000 })).toBe(7000);
  });

  it('returns 0 once maxPages has been reached', () => {
    expect(computeCrawlEtaMs({ visited: 10, maxPages: 10, effectiveDelayMs: 1000 })).toBe(0);
  });

  it('never goes negative if visited somehow exceeds maxPages', () => {
    expect(computeCrawlEtaMs({ visited: 12, maxPages: 10, effectiveDelayMs: 1000 })).toBe(0);
  });

  it('returns 0 for a zero delay', () => {
    expect(computeCrawlEtaMs({ visited: 0, maxPages: 10, effectiveDelayMs: 0 })).toBe(0);
  });
});

describe('computeScanEtaMs', () => {
  it('returns undefined before any page has been scanned', () => {
    expect(computeScanEtaMs({ scanned: 0, target: 5, elapsedMs: 0 })).toBeUndefined();
  });

  it('projects the running average across remaining pages', () => {
    // 2 pages took 4000ms total -> 2000ms/page average, 3 remaining -> 6000ms
    expect(computeScanEtaMs({ scanned: 2, target: 5, elapsedMs: 4000 })).toBe(6000);
  });

  it('returns 0 once every page has been scanned', () => {
    expect(computeScanEtaMs({ scanned: 5, target: 5, elapsedMs: 10_000 })).toBe(0);
  });

  it('never goes negative if scanned somehow exceeds target', () => {
    expect(computeScanEtaMs({ scanned: 6, target: 5, elapsedMs: 10_000 })).toBe(0);
  });
});

describe('computeStageEtaMs', () => {
  it('projects one stage without blending another stage average into it', () => {
    expect(computeStageEtaMs({ completed: 2, target: 5, elapsedMs: 4000 })).toBe(6000);
    expect(computeStageEtaMs({ completed: 1, target: 3, elapsedMs: 10_000 })).toBe(20_000);
  });

  it('has no estimate before the first completion and reaches zero at the target', () => {
    expect(computeStageEtaMs({ completed: 0, target: 5, elapsedMs: 1000 })).toBeUndefined();
    expect(computeStageEtaMs({ completed: 5, target: 5, elapsedMs: 5000 })).toBe(0);
  });
});
