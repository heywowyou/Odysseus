/**
 * Translates scanner ScanProgressEvent callbacks into Job progress
 * writes. Best-effort: a failed progress write is swallowed rather than
 * failing the job, since it is telemetry for the dashboard, not part of
 * the audit's correctness.
 */

import type { Connection } from 'mongoose';
import type { ScanProgressEvent } from '@odysseus/scanner';
import { updateJobProgress } from '@odysseus/store';
import { JobCancelledError, type CancellationRegistry } from './cancellation.js';
import { computeCrawlEtaMs, computeScanEtaMs } from './eta.js';

export function createScanProgressReporter(
  connection: Connection,
  jobId: string,
  cancellation?: CancellationRegistry,
): (event: ScanProgressEvent) => void {
  let effectiveDelayMs = 0;
  let scanStartedAtMs: number | undefined;

  async function handle(event: ScanProgressEvent): Promise<void> {
    if (event.type === 'crawl-start') {
      effectiveDelayMs = event.effectiveDelayMs;
      await updateJobProgress(connection, jobId, {
        phase: 'crawl',
        progress: {
          crawl: {
            visited: 0,
            target: event.maxPages,
            effectiveDelayMs,
            // Absent when the crawl is uncapped: no known target, no honest ETA.
            ...(() => {
              const etaMs = computeCrawlEtaMs({
                visited: 0,
                maxPages: event.maxPages,
                effectiveDelayMs,
              });
              return etaMs !== undefined ? { etaMs } : {};
            })(),
          },
        },
      });
      return;
    }

    if (event.type === 'crawl-page') {
      await updateJobProgress(connection, jobId, {
        phase: 'crawl',
        progress: {
          crawl: {
            visited: event.visited,
            target: event.maxPages,
            effectiveDelayMs,
            ...(() => {
              const etaMs = computeCrawlEtaMs({
                visited: event.visited,
                maxPages: event.maxPages,
                effectiveDelayMs,
              });
              return etaMs !== undefined ? { etaMs } : {};
            })(),
          },
        },
      });
      return;
    }

    if (event.type === 'scan-start') {
      scanStartedAtMs = Date.now();
      await updateJobProgress(connection, jobId, {
        phase: 'scan',
        progress: { scan: { scanned: 0, target: event.totalPages } },
      });
      return;
    }

    // scan-page: reports 'normalize' once the last page has been
    // scanned, since normalize+persist run inside the same audit-stage
    // call with no separately observable hook of their own - a fast,
    // pure in-memory step that doesn't warrant one.
    const elapsedMs = scanStartedAtMs !== undefined ? Date.now() - scanStartedAtMs : 0;
    const etaMs = computeScanEtaMs({ scanned: event.scanned, target: event.totalPages, elapsedMs });
    await updateJobProgress(connection, jobId, {
      phase: event.scanned >= event.totalPages ? 'normalize' : 'scan',
      progress: {
        scan: {
          scanned: event.scanned,
          target: event.totalPages,
          ...(etaMs !== undefined ? { etaMs } : {}),
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
      throw new JobCancelledError(jobId);
    }
    void handle(event).catch(() => {
      // Best-effort: progress display is not the source of truth for job success.
    });
  };
}
