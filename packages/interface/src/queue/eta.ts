import { UNLIMITED_MAX_PAGES } from '@odysseus/scanner';

/**
 * Two independent ETA formulas, deliberately not combined into one
 * number (7.1's explicit requirement: crawling has a reasonably accurate
 * live estimate, scanning is looser, and one blended number would be
 * false precision).
 */

export interface CrawlEtaInput {
  visited: number;
  maxPages: number;
  effectiveDelayMs: number;
}

/** Config-based: the crawl's pacing is a known constant
 *  (effectiveDelayMs), so remaining pages times that delay is a direct,
 *  reasonably accurate projection.
 *
 *  Returns undefined when the crawl has no page limit (the default since
 *  2026-08-24, UNLIMITED_MAX_PAGES): the formula's whole basis is a known
 *  target, and subtracting from the sentinel would render a countdown of
 *  roughly 285 million years. No estimate is the honest answer, and the
 *  dashboard already handles an absent one. */
export function computeCrawlEtaMs(input: CrawlEtaInput): number | undefined {
  if (input.maxPages >= UNLIMITED_MAX_PAGES) return undefined;
  const remaining = Math.max(input.maxPages - input.visited, 0);
  return remaining * input.effectiveDelayMs;
}

export interface ScanEtaInput {
  scanned: number;
  target: number;
  elapsedMs: number;
}

export interface StageEtaInput {
  completed: number;
  target: number;
  elapsedMs: number;
}

/** Running-average ETA for one homogeneous stage. Callers keep separate
 * clocks for rendered/content work and serialized Lighthouse work so their
 * very different costs are never blended. */
export function computeStageEtaMs(input: StageEtaInput): number | undefined {
  if (input.completed <= 0) return undefined;
  const avgMsPerItem = input.elapsedMs / input.completed;
  const remaining = Math.max(input.target - input.completed, 0);
  return avgMsPerItem * remaining;
}

/** Empirical: there is no config value for how long a Lighthouse
 *  navigation-mode pass takes per page, so this is a running average of
 *  pages actually scanned so far, projected across the remaining pages.
 *  Returns undefined before the first page finishes - noisy on page one
 *  is expected, showing nothing is more honest than showing a number
 *  built from zero data. */
export function computeScanEtaMs(input: ScanEtaInput): number | undefined {
  return computeStageEtaMs({
    completed: input.scanned,
    target: input.target,
    elapsedMs: input.elapsedMs,
  });
}
