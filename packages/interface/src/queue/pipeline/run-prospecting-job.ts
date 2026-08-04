/**
 * Batch scan for prospecting: same engine as a full audit (runAuditStage
 * is the identical function full-audit jobs call), but bounded per the
 * milestone-7 scope guardrail. computeBrokennessScore, a ranked prospect
 * table, and outreach email drafts are milestone 9 - not built here.
 * This job only needs to: scan each URL with a hard-capped light config,
 * skip the LLM/PDF stages entirely, and tag results (via Job.type, set
 * at creation) so milestone 9 can query them later.
 *
 * Per-origin lock is acquired and released per URL, not held for the
 * whole batch, so a large prospecting job doesn't block a same-origin
 * full-audit job for its entire runtime, only for the one page it is
 * currently scanning within it.
 */

import { completeJob, updateJobProgress, type JobDocument, type UrlResult } from '@odysseus/store';
import { runAuditStage } from '../../pipeline/audit-stage.js';
import { PROSPECTING_MAX_DEPTH, PROSPECTING_MAX_PAGES } from '../../config.js';
import type { PipelineContext } from '../job-queue.js';

export async function runProspectingJob(job: JobDocument, ctx: PipelineContext): Promise<void> {
  const { connection, originLock } = ctx;
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

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;
    urlResults[i] = { url, status: 'scanning' };
    await updateJobProgress(connection, job.jobId, {
      progress: { message: `${i} of ${urls.length} URLs scanned` },
      urlResults,
    });

    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      urlResults[i] = { url, status: 'error', error: 'not a valid URL' };
      continue;
    }

    const release = await originLock.acquire(origin);
    try {
      const result = await runAuditStage(
        url,
        { maxPages: PROSPECTING_MAX_PAGES, maxDepth: PROSPECTING_MAX_DEPTH },
        connection,
      );
      urlResults[i] = { url, status: 'complete', auditId: result.auditId };
      auditIds.push(result.auditId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      urlResults[i] = { url, status: 'error', error: message };
    } finally {
      release();
    }

    await updateJobProgress(connection, job.jobId, {
      progress: { message: `${i + 1} of ${urls.length} URLs scanned` },
      urlResults,
    });
  }

  await completeJob(connection, job.jobId, { auditIds, urlResults });
}
