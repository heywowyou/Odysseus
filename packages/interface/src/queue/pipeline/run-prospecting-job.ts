/**
 * Batch scan for prospecting: same engine as a full audit (runAuditStage
 * is the identical function full-audit jobs call), but bounded to a
 * light config. Nothing on this path is brokenness-gated: the LLM and
 * PDF stages are skipped unconditionally here, so no LLM cost gate runs.
 * Of the milestone 9b gates in @odysseus/core
 * (cost-gating/brokenness.ts), isAuditFallbackEligible is wired into the
 * audit analysis stage as of issue #162 (see the trade-off 23
 * amendment), while computeBrokennessScore and isProspectingWorthy
 * remain unwired by decision (trade-off 23). There is no outreach
 * worthiness score: plan 047 removed hotel scoring, and outreach
 * qualification is eligible scan purpose plus complete coverage on the
 * prospect hub.
 *
 * Milestone 9b: the serial for-loop became a bounded worker pool
 * (PROSPECTING_JOB_CONCURRENCY workers pulling from a shared cursor)
 * across the job's full URL list, not grouped by origin - safe without
 * origin grouping because the per-origin lock below already serializes
 * same-origin URLs regardless of which worker reaches them, so the
 * pool's concurrency gain comes from distinct origins running in
 * parallel, same-origin URLs contend on the lock exactly as before. Per-
 * origin lock is still acquired and released per URL, not held for the
 * whole batch, so a large prospecting job doesn't block a same-origin
 * full-audit job for its entire runtime, only for the one page it is
 * currently scanning within it.
 *
 * skipLighthouse: true (ScanPageOptions's own doc comment has the full
 * reasoning) - Lighthouse is this pipeline's serialisation bottleneck
 * and the weakest cold-outreach signal.
 */

import { completeJob, updateJobProgress, type JobDocument, type UrlResult } from '@odysseus/store';
import { runAuditStage } from '../../pipeline/audit-stage.js';
import { finalizeProspectScan } from '../../pipeline/finalize-prospect-scan.js';
import { JobCancelledError } from '../cancellation.js';
import {
  PROSPECTING_JOB_CONCURRENCY,
  PROSPECTING_MAX_DEPTH,
  PROSPECTING_MAX_PAGES,
  PROSPECTING_PROGRESS_WRITE_INTERVAL,
} from '../../config.js';
import type { PipelineContext } from '../job-queue.js';

export async function runProspectingJob(job: JobDocument, ctx: PipelineContext): Promise<void> {
  const { connection, originLock, cancellation } = ctx;
  const urls = job.urls ?? [];
  if (urls.length === 0) {
    throw new Error(`odysseus interface: prospecting job ${job.jobId} has no urls`);
  }

  const urlResults: UrlResult[] = urls.map((url) => ({ url, status: 'pending' }));
  await updateJobProgress(connection, job.jobId, {
    phase: 'scanning',
    progress: { message: `0 of ${urls.length} URLs scanned` },
    urlResults,
  });

  const auditIds: string[] = [];
  let completedCount = 0;

  // Full-array $set on every call, so writing on every status transition of
  // every URL scales write volume with job size. Only the completion
  // transition is progress-worthy enough to write at all; even that is
  // throttled to every Nth completion, with a forced write on the very
  // last one so the stored state is never stale once the job finishes
  // scanning.
  async function reportProgress(force = false): Promise<void> {
    if (!force && completedCount % PROSPECTING_PROGRESS_WRITE_INTERVAL !== 0) return;
    await updateJobProgress(connection, job.jobId, {
      progress: { message: `${completedCount} of ${urls.length} URLs scanned` },
      urlResults,
    });
  }

  async function scanOne(index: number): Promise<void> {
    const url = urls[index]!;
    urlResults[index] = { url, status: 'scanning' };

    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      urlResults[index] = { url, status: 'error', error: 'not a valid URL' };
      completedCount += 1;
      await reportProgress(completedCount === urls.length);
      return;
    }

    const release = await originLock.acquire(origin);
    try {
      const result = await runAuditStage(
        url,
        {
          maxPages: job.options.maxPages ?? PROSPECTING_MAX_PAGES,
          maxDepth: job.options.maxDepth ?? PROSPECTING_MAX_DEPTH,
          skipLighthouse: true,
          sitemapMode: 'inspect',
          ...(job.options.scanType === 'quick-check' ? { scanIntent: 'quick-check' as const } : {}),
          ...(job.options.prospectId !== undefined ? { prospectId: job.options.prospectId } : {}),
        },
        connection,
      );
      if (job.options.prospectId !== undefined) {
        await finalizeProspectScan(connection, {
          prospectId: job.options.prospectId,
          manifest: result.manifest,
        });
      }
      urlResults[index] = { url, status: 'complete', auditId: result.auditId };
      auditIds.push(result.auditId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      urlResults[index] = { url, status: 'error', error: message };
    } finally {
      release();
    }

    completedCount += 1;
    await reportProgress(completedCount === urls.length);
  }

  // Shared cursor: each worker claims the next unclaimed index rather
  // than owning a fixed slice, so a worker that finishes an early URL
  // quickly (or a failed one) immediately picks up more work instead of
  // sitting idle while a slower worker's slice still has entries left.
  // A stop request stops workers from pulling new URLs. The per-URL
  // audits already in flight are each bounded by PROSPECTING_MAX_PAGES,
  // so they finish on their own rather than aborting mid-audit; only the
  // remaining queue is cut.
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < urls.length && !cancellation.isRequested(job.jobId)) {
      const index = nextIndex;
      nextIndex += 1;
      await scanOne(index);
    }
  }

  const workerCount = Math.min(PROSPECTING_JOB_CONCURRENCY, urls.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (cancellation.isRequested(job.jobId)) {
    throw new JobCancelledError(job.jobId);
  }

  await completeJob(connection, job.jobId, { auditIds, urlResults });
}
