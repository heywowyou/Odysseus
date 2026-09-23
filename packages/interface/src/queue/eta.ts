import { UNLIMITED_MAX_PAGES } from '@odysseus/scanner';

/**
 * Two independent ETA formulas, deliberately not combined into one
 * number (7.1's explicit requirement: crawling has a reasonably accurate
 * live estimate, scanning is looser, and one blended number would be
 * false precision).
 *
 * Issue #223 replaced both formulas' inner mechanics (a lifetime running
 * average adapts too slowly to a shift in page cost, and the crawl
 * formula ignored real navigation/extraction time and the live frontier),
 * but kept this same two-formula split and stayed dependency-free and
 * deterministic - no ML/prediction service, per the issue's non-goals.
 */

const EWMA_ALPHA = 0.35;
/** Samples at which the EWMA channel and the overall average are weighted
 *  evenly (weight = samples / (samples + this)); low so a handful of real
 *  pages already outweighs the plain lifetime average, satisfying "as
 *  samples increase, progressively trust EWMA more" without needing many
 *  samples to get there. */
const BLEND_SMOOTHING_SAMPLES = 2;
/** A single sample may not move the EWMA channel by more than this
 *  multiple of its current value - the "clamp pathological single-sample
 *  jumps so the ETA does not oscillate wildly" requirement. The lifetime
 *  average channel is intentionally left unclamped: it is the stability
 *  anchor the blend falls back on while there are too few samples for the
 *  EWMA channel to be trusted on its own. */
const MAX_SAMPLE_JUMP_RATIO = 3;

/** Smoothed per-page duration: a blend of the overall average (stable
 *  with few samples) and an EWMA of recent durations (responsive to a
 *  shift in page cost), rather than a lifetime average that a single very
 *  slow or very fast early page would skew for the rest of the phase. */
export interface DurationEstimator {
  record(durationMs: number): void;
  /** Undefined until the first sample - no estimate is more honest than
   *  one built from zero data. */
  estimateMs(): number | undefined;
  readonly sampleCount: number;
}

export function createDurationEstimator(): DurationEstimator {
  let sampleCount = 0;
  let totalMs = 0;
  let ewmaMs: number | undefined;
  return {
    get sampleCount(): number {
      return sampleCount;
    },
    record(durationMs: number): void {
      if (!Number.isFinite(durationMs) || durationMs < 0) return;
      sampleCount += 1;
      totalMs += durationMs;
      if (ewmaMs === undefined) {
        ewmaMs = durationMs;
        return;
      }
      const lowerBound = ewmaMs / MAX_SAMPLE_JUMP_RATIO;
      const upperBound = ewmaMs * MAX_SAMPLE_JUMP_RATIO;
      const clamped = Math.min(Math.max(durationMs, lowerBound), upperBound);
      ewmaMs = EWMA_ALPHA * clamped + (1 - EWMA_ALPHA) * ewmaMs;
    },
    estimateMs(): number | undefined {
      if (sampleCount === 0) return undefined;
      const overallAvg = totalMs / sampleCount;
      if (ewmaMs === undefined) return overallAvg;
      const ewmaWeight = sampleCount / (sampleCount + BLEND_SMOOTHING_SAMPLES);
      return overallAvg * (1 - ewmaWeight) + ewmaMs * ewmaWeight;
    },
  };
}

export interface CrawlEtaInput {
  visited: number;
  maxPages: number;
  /** The current crawl frontier's size (pages queued but not yet
   *  dequeued). Used to cap the estimate below the configured page limit
   *  when the actual site is smaller than that limit allows - a capped
   *  crawl must never extrapolate straight to maxPages once the frontier
   *  shows there is substantially less work than that. Absent or 0 (no
   *  live frontier reported, or it has genuinely drained) falls back to
   *  the cap-derived remaining count. */
  queued: number;
  /** The configured/robots-adjusted delay between requests, used only
   *  until real per-page timing exists (see observedPageCostMs) and as
   *  the fallback once it stops existing (e.g. between dequeues on an
   *  otherwise idle connection). */
  effectiveDelayMs: number;
  /** Smoothed wall-clock cost per dequeued page, observed from the actual
   *  crawl cadence (politeness delay + navigation + extraction combined),
   *  not just the configured delay. Undefined before the first page. */
  observedPageCostMs: number | undefined;
}

/** Returns undefined when the crawl has no page limit (the default since
 *  2026-08-24, UNLIMITED_MAX_PAGES): the formula's whole basis is a known
 *  target, and subtracting from the sentinel would render a countdown of
 *  roughly 285 million years. No estimate is the honest answer, and the
 *  dashboard already handles an absent one - an uncapped crawl continues
 *  to avoid false precision rather than growing a frontier-only estimate
 *  the crawl's own continued discovery would immediately invalidate. */
export function computeCrawlEtaMs(input: CrawlEtaInput): number | undefined {
  if (input.maxPages >= UNLIMITED_MAX_PAGES) return undefined;
  const remainingByCap = Math.max(input.maxPages - input.visited, 0);
  if (remainingByCap === 0) return 0;
  const remaining = input.queued > 0 ? Math.min(remainingByCap, input.queued) : remainingByCap;
  const perPageCostMs = input.observedPageCostMs ?? input.effectiveDelayMs;
  return remaining * perPageCostMs;
}

export interface PacedStageEtaInput {
  remaining: number;
  slotsPerPage: number;
  currentDelayMs: number;
  workEstimateMs: number | undefined;
  concurrency: number;
}

/** A stage ETA is bounded below by both host pacing and observed page work. */
export function computePacedStageEtaMs(input: PacedStageEtaInput): number {
  const remaining = Math.max(0, input.remaining);
  if (remaining === 0) return 0;
  const concurrency = Math.max(1, Math.trunc(input.concurrency));
  const pacedFloor =
    remaining * Math.max(0, input.slotsPerPage) * Math.max(0, input.currentDelayMs);
  const workFloor =
    input.workEstimateMs === undefined
      ? 0
      : (remaining * Math.max(0, input.workEstimateMs)) / concurrency;
  return Math.max(pacedFloor, workFloor);
}

export interface StageEtaInput {
  completed: number;
  target: number;
  /** Parallel lanes actually processing this stage right now. 1 for a
   *  stage that is inherently serialized (Lighthouse's passes run
   *  process-wide serialized, never in parallel lanes) so its ETA is
   *  never divided down as if it had concurrency it does not have. */
  concurrency: number;
  /** From a DurationEstimator fed this stage's real per-page durationMs
   *  samples. Undefined before the first sample. */
  smoothedPageDurationMs: number | undefined;
}

/** Empirical: there is no config value for how long a page's content scan
 *  or Lighthouse pass takes, so this projects a smoothed per-page
 *  duration across the remaining work. For a concurrent stage (content
 *  scan), the remaining pages are grouped into
 *  `ceil(remaining / concurrency)` waves rather than treated as one
 *  serial stream, since N lanes finish N pages in roughly one page's
 *  wall time, not N times that. Returns undefined before the first page
 *  finishes - noisy on page one is expected, showing nothing is more
 *  honest than showing a number built from zero data. */
export function computeStageEtaMs(input: StageEtaInput): number | undefined {
  if (input.smoothedPageDurationMs === undefined) return undefined;
  const remaining = Math.max(input.target - input.completed, 0);
  if (remaining === 0) return 0;
  const effectiveConcurrency = Math.max(Math.trunc(input.concurrency), 1);
  const remainingWaves = Math.ceil(remaining / effectiveConcurrency);
  return remainingWaves * input.smoothedPageDurationMs;
}
