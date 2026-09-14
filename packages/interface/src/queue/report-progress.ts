/**
 * Translates scanner ScanProgressEvent callbacks into Job progress
 * writes. Best-effort: a failed progress write is swallowed rather than
 * failing the job, since it is telemetry for the dashboard, not part of
 * the audit's correctness.
 */

import type { Connection } from 'mongoose';
import type { PageWorkGuard, ScanProgressEvent } from '@odysseus/scanner';
import { updateJobProgress } from '@odysseus/store';
import { JobCancelledError, type CancellationRegistry } from './cancellation.js';
import { computeCrawlEtaMs, computeStageEtaMs, createDurationEstimator } from './eta.js';

export function createScanProgressReporter(
  connection: Connection,
  jobId: string,
  cancellation?: CancellationRegistry,
  /** Issue #200: a mutable holder the caller fills in via scanSite's
   *  onGuardReady once the run-wide guard exists - a plain optional
   *  value would be captured before that happens, since this reporter is
   *  built before scanSite runs. Force-closed the moment a cancellation
   *  is seen, so the live Chromium contexts for this run are actually
   *  released - not just the job document marked cancelled - even for a
   *  page that never reaches a progress boundary of its own. */
  guardHolder?: { current?: PageWorkGuard },
): (event: ScanProgressEvent) => void {
  let effectiveDelayMs = 0;
  // Issue #223: crawl-page fires once per dequeued page in a single
  // serial stream, so the wall time between two consecutive events is
  // exactly one page's real cost (politeness delay + navigation +
  // extraction) - no separate durationMs field is needed on the event
  // itself the way the concurrent stages below need one.
  let lastCrawlPageAtMs: number | undefined;
  const crawlDurationEstimator = createDurationEstimator();

  let contentScanConcurrency = 1;
  const contentScanDurationEstimator = createDurationEstimator();
  const lighthouseDurationEstimator = createDurationEstimator();
  const scanDurationEstimator = createDurationEstimator();

  async function handle(event: ScanProgressEvent): Promise<void> {
    if (event.type === 'crawl-setup') {
      // Issue #121: robots.txt and sitemap retrieval are paced crawl work,
      // so the job leaves the queued phase while they run. The configured
      // delay stands in as effective until robots.txt can raise it; the
      // crawl-start event that follows corrects both fields.
      const etaMs = computeCrawlEtaMs({
        visited: 0,
        maxPages: event.maxPages,
        queued: 0,
        effectiveDelayMs: event.delayMs,
        observedPageCostMs: undefined,
      });
      await updateJobProgress(connection, jobId, {
        phase: 'crawl',
        progress: {
          crawl: {
            visited: 0,
            target: event.maxPages,
            effectiveDelayMs: event.delayMs,
            ...(etaMs !== undefined ? { etaMs, etaCalculatedAt: new Date() } : {}),
          },
        },
      });
      return;
    }

    if (event.type === 'crawl-start') {
      effectiveDelayMs = event.effectiveDelayMs;
      // Issue #223: the clock for observed per-page cadence starts here,
      // once the real (robots-adjusted) delay is known, not at
      // crawl-setup - the robots.txt/sitemap fetch that precedes this
      // event is not itself a page's cost.
      lastCrawlPageAtMs = Date.now();
      const etaMs = computeCrawlEtaMs({
        visited: 0,
        maxPages: event.maxPages,
        queued: 0,
        effectiveDelayMs,
        observedPageCostMs: undefined,
      });
      await updateJobProgress(connection, jobId, {
        phase: 'crawl',
        progress: {
          crawl: {
            visited: 0,
            target: event.maxPages,
            effectiveDelayMs,
            // Absent when the crawl is uncapped: no known target, no honest ETA.
            ...(etaMs !== undefined ? { etaMs, etaCalculatedAt: new Date() } : {}),
          },
        },
      });
      return;
    }

    if (event.type === 'crawl-page') {
      const now = Date.now();
      if (lastCrawlPageAtMs !== undefined) {
        crawlDurationEstimator.record(now - lastCrawlPageAtMs);
      }
      lastCrawlPageAtMs = now;
      const etaMs = computeCrawlEtaMs({
        visited: event.visited,
        maxPages: event.maxPages,
        queued: event.queued,
        effectiveDelayMs,
        observedPageCostMs: crawlDurationEstimator.estimateMs(),
      });
      await updateJobProgress(connection, jobId, {
        phase: 'crawl',
        progress: {
          crawl: {
            visited: event.visited,
            target: event.maxPages,
            effectiveDelayMs,
            ...(etaMs !== undefined ? { etaMs, etaCalculatedAt: new Date() } : {}),
          },
        },
      });
      return;
    }

    if (event.type === 'continuation-guard') {
      await updateJobProgress(connection, jobId, {
        progress: {
          continuationGuard: {
            omittedUrlCount: event.omittedUrlCount,
            omittedFamilyCount: event.omittedFamilyCount,
          },
        },
      });
      return;
    }

    if (event.type === 'content-scan-start') {
      contentScanConcurrency = event.concurrency;
      // Issue #223: seeded from the reused count, but no timing sample is
      // recorded for it - a resumed page took no wall time in this
      // process, so it never distorts the fresh estimator below.
      const etaMs = computeStageEtaMs({
        completed: event.alreadyCompleted,
        target: event.totalPages,
        concurrency: contentScanConcurrency,
        smoothedPageDurationMs: contentScanDurationEstimator.estimateMs(),
      });
      await updateJobProgress(connection, jobId, {
        phase: 'content-scan',
        progress: {
          contentScan: {
            completed: event.alreadyCompleted,
            target: event.totalPages,
            ...(etaMs !== undefined ? { etaMs, etaCalculatedAt: new Date() } : {}),
          },
        },
      });
      return;
    }

    if (event.type === 'content-scan-page') {
      contentScanDurationEstimator.record(event.durationMs);
      const etaMs = computeStageEtaMs({
        completed: event.completed,
        target: event.totalPages,
        concurrency: contentScanConcurrency,
        smoothedPageDurationMs: contentScanDurationEstimator.estimateMs(),
      });
      await updateJobProgress(connection, jobId, {
        phase: 'content-scan',
        progress: {
          contentScan: {
            completed: event.completed,
            target: event.totalPages,
            ...(etaMs !== undefined ? { etaMs, etaCalculatedAt: new Date() } : {}),
          },
        },
      });
      return;
    }

    if (event.type === 'select-performance') {
      await updateJobProgress(connection, jobId, { phase: 'select-performance' });
      return;
    }

    if (event.type === 'lighthouse-start') {
      // Issue #223: Lighthouse passes are serialized process-wide, so
      // concurrency is always 1 here regardless of the content stage's
      // lane count - never divide this stage's ETA as if it ran in
      // parallel.
      const etaMs = computeStageEtaMs({
        completed: event.alreadyCompleted,
        target: event.totalPages,
        concurrency: 1,
        smoothedPageDurationMs: lighthouseDurationEstimator.estimateMs(),
      });
      await updateJobProgress(connection, jobId, {
        phase: 'lighthouse',
        progress: {
          lighthouse: {
            completed: event.alreadyCompleted,
            target: event.totalPages,
            ...(etaMs !== undefined ? { etaMs, etaCalculatedAt: new Date() } : {}),
          },
        },
      });
      return;
    }

    if (event.type === 'lighthouse-page') {
      lighthouseDurationEstimator.record(event.durationMs);
      const etaMs = computeStageEtaMs({
        completed: event.completed,
        target: event.totalPages,
        concurrency: 1,
        smoothedPageDurationMs: lighthouseDurationEstimator.estimateMs(),
      });
      await updateJobProgress(connection, jobId, {
        phase: 'lighthouse',
        progress: {
          lighthouse: {
            completed: event.completed,
            target: event.totalPages,
            ...(etaMs !== undefined ? { etaMs, etaCalculatedAt: new Date() } : {}),
          },
        },
      });
      return;
    }

    if (event.type === 'analysis-complete') {
      await updateJobProgress(connection, jobId, { phase: 'normalize' });
      return;
    }

    if (event.type === 'scan-start') {
      await updateJobProgress(connection, jobId, {
        phase: 'scan',
        progress: { scan: { scanned: 0, target: event.totalPages } },
      });
      return;
    }

    // scan-page: reports 'normalize' once the last page has been
    // scanned, since normalize+persist run inside the same audit-stage
    // call with no separately observable hook of their own - a fast,
    // pure in-memory step that doesn't warrant one. Issue #223: the
    // legacy (non-staged) scan phase also runs concurrent lanes, but its
    // progress event carries no lane count, so this stage's ETA stays
    // concurrency 1 (same conservative, never-underestimate choice
    // Lighthouse's inherently serial stage uses) rather than assuming a
    // lane count it was never told.
    scanDurationEstimator.record(event.durationMs);
    const etaMs = computeStageEtaMs({
      completed: event.scanned,
      target: event.totalPages,
      concurrency: 1,
      smoothedPageDurationMs: scanDurationEstimator.estimateMs(),
    });
    await updateJobProgress(connection, jobId, {
      phase: event.scanned >= event.totalPages ? 'normalize' : 'scan',
      progress: {
        scan: {
          scanned: event.scanned,
          target: event.totalPages,
          ...(etaMs !== undefined ? { etaMs, etaCalculatedAt: new Date() } : {}),
        },
      },
    });
  }

  return (event: ScanProgressEvent) => {
    // The stop check is synchronous and throws into the crawler/scanner's
    // own call frame, which is what actually aborts the pipeline: every
    // onProgress call site sits between pages, so a stop lands within one
    // page of work. Errors inside handle() stay best-effort.
    if (cancellation?.isRequested(jobId)) {
      void guardHolder?.current?.closeAll();
      throw new JobCancelledError(jobId);
    }
    void handle(event).catch(() => {
      // Best-effort: progress display is not the source of truth for job success.
    });
  };
}
