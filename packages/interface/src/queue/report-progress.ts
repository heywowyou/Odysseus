/**
 * Translates scanner ScanProgressEvent callbacks into Job progress
 * writes. Best-effort: a failed progress write is swallowed rather than
 * failing the job, since it is telemetry for the dashboard, not part of
 * the audit's correctness.
 */

import type { Connection } from 'mongoose';
import type {
  HostPacingRecoveredEvent,
  HostPushbackEvent,
  PageWorkGuard,
  ScanProgressEvent,
} from '@odysseus/scanner';
import type { JobProgressPatch, JobType } from '@odysseus/store';
import { JobCancelledError, type CancellationRegistry } from './cancellation.js';
import {
  computeCrawlEtaMs,
  computePacedStageEtaMs,
  computeStageEtaMs,
  createDurationEstimator,
} from './eta.js';
import { reportJobPhase } from './pipeline/report-job-phase.js';

export function createScanProgressReporter(
  connection: Connection,
  jobId: string,
  /** Issue #253: job telemetry needs the job type to label its events;
   *  the pilot only maps full-audit's phase vocabulary (see
   *  ./pipeline/report-job-phase.ts), so a caller passing a different job
   *  type still writes progress exactly as before, just without
   *  telemetry. */
  jobType: JobType,
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
  let currentDelayMs = 0;
  // The staged pipeline reports its own phases (content-scan,
  // select-performance, lighthouse, then normalize on analysis-complete).
  // Its scan-page events are per-page bookkeeping that also fire while
  // Lighthouse runs - on a resume `scanned` already equals the total -
  // so they must never move the phase, or the dashboard would claim
  // normalize while Lighthouse is still measuring pages.
  let stagedPipeline = false;
  // Issue #223: crawl-page fires once per dequeued page in a single
  // serial stream, so the wall time between two consecutive events is
  // exactly one page's real cost (politeness delay + navigation +
  // extraction) - no separate durationMs field is needed on the event
  // itself the way the concurrent stages below need one.
  let lastCrawlPageAtMs: number | undefined;
  const crawlDurationEstimator = createDurationEstimator();

  // The staged scanner may admit pages discovered by rendered/state surfaces
  // after crawl-page events have stopped. Keep the last crawl snapshot here
  // so content-scan-start can advance the durable inventoried count without
  // dropping the effective delay or ETA fields from the nested crawl object.
  let crawlVisited = 0;
  let crawlTarget: number | undefined;
  let crawlEffectiveDelayMs: number | undefined;
  let crawlEtaMs: number | undefined;
  let crawlEtaCalculatedAt: Date | undefined;
  let crawlExcluded = 0;
  const pushbackEvents: HostPushbackEvent[] = [];
  const pacingRecoveryEvents: HostPacingRecoveredEvent[] = [];
  let activePacingStage:
    | {
        bucket: 'contentScan' | 'lighthouse';
        completed: number;
        target: number;
        concurrency: number;
        initialCompleted: number;
        startRequestCount?: number;
        requestStartCount?: number;
        plannedSlotsPerPage: number;
        paced: boolean;
      }
    | undefined;

  let contentScanConcurrency = 1;
  const contentScanDurationEstimator = createDurationEstimator();
  const lighthouseDurationEstimator = createDurationEstimator();
  const scanDurationEstimator = createDurationEstimator();

  function estimateActiveStageEta(
    estimator: ReturnType<typeof createDurationEstimator>,
    counts?: { completed: number; target: number },
  ): number | undefined {
    if (activePacingStage === undefined) return undefined;
    const completed = counts?.completed ?? activePacingStage.completed;
    const target = counts?.target ?? activePacingStage.target;
    const remaining = Math.max(0, target - completed);
    const workEstimateMs = estimator.estimateMs();
    if (!activePacingStage.paced && workEstimateMs === undefined) return undefined;
    if (!activePacingStage.paced) {
      return computeStageEtaMs({
        completed,
        target,
        concurrency: activePacingStage.concurrency,
        smoothedPageDurationMs: workEstimateMs,
      });
    }
    return computePacedStageEtaMs({
      remaining,
      slotsPerPage: activePacingStage.plannedSlotsPerPage,
      currentDelayMs,
      workEstimateMs,
      concurrency: activePacingStage.concurrency,
    });
  }

  async function reportHostPacingProgress(progress: {
    pushbackEvents?: HostPushbackEvent[];
    pacingRecoveryEvents?: HostPacingRecoveredEvent[];
  }): Promise<void> {
    const patch: NonNullable<JobProgressPatch['progress']> = { ...progress };
    const etaMs = estimateActiveStageEta(
      activePacingStage?.bucket === 'lighthouse'
        ? lighthouseDurationEstimator
        : contentScanDurationEstimator,
    );
    if (activePacingStage !== undefined && activePacingStage.paced) {
      patch[activePacingStage.bucket] = {
        completed: activePacingStage.completed,
        target: activePacingStage.target,
        currentDelayMs,
        ...(activePacingStage.requestStartCount !== undefined
          ? { requestStartCount: activePacingStage.requestStartCount }
          : {}),
        ...(etaMs !== undefined ? { etaMs, etaCalculatedAt: new Date() } : {}),
      };
    }
    await reportJobPhase(connection, jobId, jobType, { progress: patch });
  }

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
      crawlTarget = event.maxPages;
      currentDelayMs = event.delayMs;
      crawlEffectiveDelayMs = event.delayMs;
      crawlEtaMs = etaMs;
      crawlEtaCalculatedAt = etaMs === undefined ? undefined : new Date();
      crawlVisited = 0;
      await reportJobPhase(connection, jobId, jobType, {
        phase: 'crawl',
        progress: {
          crawl: {
            visited: 0,
            target: event.maxPages,
            effectiveDelayMs: event.delayMs,
            ...(etaMs !== undefined ? { etaMs, etaCalculatedAt: crawlEtaCalculatedAt! } : {}),
          },
        },
      });
      return;
    }

    if (event.type === 'crawl-start') {
      effectiveDelayMs = event.effectiveDelayMs;
      currentDelayMs = event.effectiveDelayMs;
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
      crawlTarget = event.maxPages;
      crawlEffectiveDelayMs = effectiveDelayMs;
      crawlEtaMs = etaMs;
      crawlEtaCalculatedAt = etaMs === undefined ? undefined : new Date();
      crawlVisited = 0;
      await reportJobPhase(connection, jobId, jobType, {
        phase: 'crawl',
        progress: {
          crawl: {
            visited: 0,
            target: event.maxPages,
            effectiveDelayMs,
            // Absent when the crawl is uncapped: no known target, no honest ETA.
            ...(etaMs !== undefined ? { etaMs, etaCalculatedAt: crawlEtaCalculatedAt! } : {}),
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
      crawlVisited = event.visited;
      crawlTarget = event.maxPages;
      crawlEtaMs = etaMs;
      crawlEtaCalculatedAt = etaMs === undefined ? undefined : new Date();
      await reportJobPhase(connection, jobId, jobType, {
        phase: 'crawl',
        progress: {
          crawl: {
            visited: event.visited,
            target: event.maxPages,
            effectiveDelayMs,
            ...(etaMs !== undefined ? { etaMs, etaCalculatedAt: crawlEtaCalculatedAt! } : {}),
          },
        },
      });
      return;
    }

    if (event.type === 'continuation-guard') {
      await reportJobPhase(connection, jobId, jobType, {
        progress: {
          continuationGuard: {
            omittedUrlCount: event.omittedUrlCount,
            omittedFamilyCount: event.omittedFamilyCount,
          },
        },
      });
      return;
    }

    if (event.type === 'crawl-exclusions') {
      crawlExcluded =
        event.excluded.discoveryOnly +
        event.excluded.externalRedirect +
        event.excluded.nonHtml +
        event.excluded.httpError +
        event.excluded.blocked +
        event.excluded.error;
      await reportJobPhase(connection, jobId, jobType, {
        progress: { crawlExclusions: event.excluded },
      });
      return;
    }

    if (event.type === 'pushback') {
      pushbackEvents.push(event.event);
      if (event.event.delayMs !== undefined) currentDelayMs = event.event.delayMs;
      await reportHostPacingProgress({
        pushbackEvents: pushbackEvents.map((pushback) => ({ ...pushback })),
      });
      return;
    }

    if (event.type === 'pacing-recovered') {
      pacingRecoveryEvents.push(event.event);
      currentDelayMs = event.event.delayMs;
      await reportHostPacingProgress({
        pacingRecoveryEvents: pacingRecoveryEvents.map((recovery) => ({ ...recovery })),
      });
      return;
    }

    if (event.type === 'content-scan-start') {
      stagedPipeline = true;
      contentScanConcurrency = event.concurrency;
      if (event.currentDelayMs !== undefined) currentDelayMs = event.currentDelayMs;
      activePacingStage = {
        bucket: 'contentScan',
        completed: event.alreadyCompleted,
        target: event.totalPages,
        concurrency: contentScanConcurrency,
        initialCompleted: event.alreadyCompleted,
        ...(event.requestStartCount !== undefined
          ? {
              startRequestCount: event.requestStartCount,
              requestStartCount: event.requestStartCount,
            }
          : {}),
        plannedSlotsPerPage: event.plannedSlotsPerPage ?? 3,
        paced:
          event.requestStartCount !== undefined ||
          event.currentDelayMs !== undefined ||
          event.plannedSlotsPerPage !== undefined,
      };
      const etaMs = estimateActiveStageEta(contentScanDurationEstimator);
      // State-surface discovery can add real inventoried pages after the
      // crawl's last page event. The content target is the checked subset;
      // adding known exclusions gives the complete inventory denominator.
      // Without this update the dashboard can truthfully show 216 checked
      // pages beside a stale 185 inventoried count and make a healthy
      // discovery expansion look like a ledger failure.
      const inventoriedAfterSurfaceDiscovery = event.totalPages + crawlExcluded;
      const inventoryTarget =
        crawlTarget === undefined
          ? inventoriedAfterSurfaceDiscovery
          : Math.max(crawlTarget, inventoriedAfterSurfaceDiscovery);
      const inventoryVisited = Math.max(crawlVisited, inventoriedAfterSurfaceDiscovery);
      const crawlInventoryPatch =
        crawlTarget === undefined
          ? undefined
          : {
              visited: inventoryVisited,
              target: inventoryTarget,
              ...(crawlEffectiveDelayMs === undefined
                ? {}
                : { effectiveDelayMs: crawlEffectiveDelayMs }),
              ...(crawlEtaMs === undefined || crawlEtaCalculatedAt === undefined
                ? {}
                : { etaMs: crawlEtaMs, etaCalculatedAt: crawlEtaCalculatedAt! }),
            };
      if (crawlInventoryPatch !== undefined) {
        crawlVisited = crawlInventoryPatch.visited;
        crawlTarget = crawlInventoryPatch.target;
      }
      await reportJobPhase(connection, jobId, jobType, {
        phase: 'content-scan',
        progress: {
          ...(crawlInventoryPatch === undefined ? {} : { crawl: crawlInventoryPatch }),
          contentScan: {
            completed: event.alreadyCompleted,
            target: event.totalPages,
            ...(etaMs !== undefined ? { etaMs, etaCalculatedAt: new Date() } : {}),
            ...(event.requestStartCount !== undefined
              ? { requestStartCount: event.requestStartCount }
              : {}),
            ...(event.currentDelayMs !== undefined ? { currentDelayMs: event.currentDelayMs } : {}),
          },
        },
      });
      return;
    }

    if (event.type === 'content-scan-page') {
      contentScanDurationEstimator.record(event.durationMs);
      if (event.currentDelayMs !== undefined) currentDelayMs = event.currentDelayMs;
      if (activePacingStage !== undefined) {
        activePacingStage.completed = event.completed;
        activePacingStage.target = event.totalPages;
        if (event.requestStartCount !== undefined) {
          activePacingStage.requestStartCount = event.requestStartCount;
        }
        if (event.currentDelayMs !== undefined) currentDelayMs = event.currentDelayMs;
        const newCompleted = Math.max(1, event.completed - activePacingStage.initialCompleted);
        if (
          activePacingStage.startRequestCount !== undefined &&
          activePacingStage.requestStartCount !== undefined
        ) {
          const observedSlots =
            (activePacingStage.requestStartCount - activePacingStage.startRequestCount) /
            newCompleted;
          if (Number.isFinite(observedSlots) && observedSlots > 0) {
            activePacingStage.plannedSlotsPerPage = Math.max(
              activePacingStage.plannedSlotsPerPage,
              observedSlots,
            );
          }
        }
      }
      const etaMs = estimateActiveStageEta(contentScanDurationEstimator, {
        completed: event.completed,
        target: event.totalPages,
      });
      await reportJobPhase(connection, jobId, jobType, {
        phase: 'content-scan',
        progress: {
          contentScan: {
            completed: event.completed,
            target: event.totalPages,
            ...(etaMs !== undefined ? { etaMs, etaCalculatedAt: new Date() } : {}),
            ...(event.requestStartCount !== undefined
              ? { requestStartCount: event.requestStartCount }
              : {}),
            ...(event.currentDelayMs !== undefined ? { currentDelayMs: event.currentDelayMs } : {}),
          },
        },
      });
      return;
    }

    if (event.type === 'content-recovery-page') {
      // Retries change no progress figure; writing the phase refreshes the
      // job's heartbeat so a long recovery never looks like a dead job.
      await reportJobPhase(connection, jobId, jobType, { phase: 'content-scan' });
      return;
    }

    if (event.type === 'select-performance') {
      stagedPipeline = true;
      activePacingStage = undefined;
      await reportJobPhase(connection, jobId, jobType, { phase: 'select-performance' });
      return;
    }

    if (event.type === 'lighthouse-start') {
      stagedPipeline = true;
      if (event.currentDelayMs !== undefined) currentDelayMs = event.currentDelayMs;
      activePacingStage = {
        bucket: 'lighthouse',
        completed: event.alreadyCompleted,
        target: event.totalPages,
        concurrency: 1,
        initialCompleted: event.alreadyCompleted,
        ...(event.requestStartCount !== undefined
          ? {
              startRequestCount: event.requestStartCount,
              requestStartCount: event.requestStartCount,
            }
          : {}),
        plannedSlotsPerPage: event.plannedSlotsPerPage ?? 1,
        paced:
          event.requestStartCount !== undefined ||
          event.currentDelayMs !== undefined ||
          event.plannedSlotsPerPage !== undefined,
      };
      const etaMs = estimateActiveStageEta(lighthouseDurationEstimator);
      await reportJobPhase(connection, jobId, jobType, {
        phase: 'lighthouse',
        progress: {
          lighthouse: {
            completed: event.alreadyCompleted,
            target: event.totalPages,
            ...(etaMs !== undefined ? { etaMs, etaCalculatedAt: new Date() } : {}),
            ...(event.requestStartCount !== undefined
              ? { requestStartCount: event.requestStartCount }
              : {}),
            ...(event.currentDelayMs !== undefined ? { currentDelayMs: event.currentDelayMs } : {}),
          },
        },
      });
      return;
    }

    if (event.type === 'lighthouse-page') {
      lighthouseDurationEstimator.record(event.durationMs);
      if (activePacingStage !== undefined) {
        activePacingStage.completed = event.completed;
        activePacingStage.target = event.totalPages;
        if (event.requestStartCount !== undefined) {
          activePacingStage.requestStartCount = event.requestStartCount;
        }
        if (event.currentDelayMs !== undefined) currentDelayMs = event.currentDelayMs;
        const newCompleted = Math.max(1, event.completed - activePacingStage.initialCompleted);
        if (
          activePacingStage.startRequestCount !== undefined &&
          activePacingStage.requestStartCount !== undefined
        ) {
          const observedSlots =
            (activePacingStage.requestStartCount - activePacingStage.startRequestCount) /
            newCompleted;
          if (Number.isFinite(observedSlots) && observedSlots > 0) {
            activePacingStage.plannedSlotsPerPage = Math.max(
              activePacingStage.plannedSlotsPerPage,
              observedSlots,
            );
          }
        }
      }
      const etaMs = estimateActiveStageEta(lighthouseDurationEstimator, {
        completed: event.completed,
        target: event.totalPages,
      });
      await reportJobPhase(connection, jobId, jobType, {
        phase: 'lighthouse',
        progress: {
          lighthouse: {
            completed: event.completed,
            target: event.totalPages,
            ...(etaMs !== undefined ? { etaMs, etaCalculatedAt: new Date() } : {}),
            ...(event.requestStartCount !== undefined
              ? { requestStartCount: event.requestStartCount }
              : {}),
            ...(event.currentDelayMs !== undefined ? { currentDelayMs: event.currentDelayMs } : {}),
          },
        },
      });
      return;
    }

    if (event.type === 'analysis-complete') {
      await reportJobPhase(connection, jobId, jobType, { phase: 'normalize' });
      return;
    }

    if (event.type === 'scan-start') {
      await reportJobPhase(connection, jobId, jobType, {
        phase: 'scan',
        progress: { scan: { scanned: 0, target: event.totalPages } },
      });
      return;
    }

    // scan-page: on the legacy (non-staged) path, reports 'normalize'
    // once the last page has been scanned, since normalize+persist run
    // inside the same audit-stage call with no separately observable hook
    // of their own - a fast, pure in-memory step that doesn't warrant
    // one. The staged path leaves the phase alone (see stagedPipeline).
    // Issue #223: the
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
    await reportJobPhase(connection, jobId, jobType, {
      ...(stagedPipeline
        ? {}
        : { phase: event.scanned >= event.totalPages ? 'normalize' : 'scan' }),
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
