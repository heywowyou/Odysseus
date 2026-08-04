import { describe, expect, it } from 'vitest';
import { computeCrawlEtaMs, computeScanEtaMs } from './eta.js';

describe('computeCrawlEtaMs', () => {
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
