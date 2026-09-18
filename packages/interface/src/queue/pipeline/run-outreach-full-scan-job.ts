/** Prospect-linked audit runner kept for queued jobs created before the hub
 *  launch path was unified. It runs the shared audit stage and records the
 *  durable prospect link; no candidate qualification or cohort provenance is
 *  consulted. */

import {
  completeJob,
  ensureJobRunIdentity,
  updateJobProgress,
  type JobDocument,
} from '@odysseus/store';
import { deleteCrawlCheckpoint, deleteCrawlStateFile } from '@odysseus/scanner';
import { runAuditStage } from '../../pipeline/audit-stage.js';
import { acquisitionClaimFor } from './job-crawl-options.js';
import { finalizeProspectScan } from '../../pipeline/finalize-prospect-scan.js';
import type { PipelineContext } from '../job-queue.js';
import { JobCancelledError } from '../cancellation.js';
import { createScanProgressReporter } from '../report-progress.js';

export async function runOutreachFullScanJob(
  job: JobDocument,
  ctx: PipelineContext,
): Promise<void> {
  const { connection, originLock } = ctx;
  const url = job.siteUrl;
  const prospectId = job.options.prospectId;
  if (url === undefined || prospectId === undefined) {
    throw new Error(`odysseus interface: outreach-full-scan job ${job.jobId} is missing its scope`);
  }
  const release = await originLock.acquire(new URL(url).origin);
  try {
    const runIdentity = await ensureJobRunIdentity(connection, job.jobId);
    const auditResult = await runAuditStage(
      url,
      {
        prospectId,
        scanIntent: 'prospecting-audit',
        runIdentity,
        ...acquisitionClaimFor(connection, job),
        onProgress: createScanProgressReporter(connection, job.jobId, job.type, ctx.cancellation),
      },
      connection,
    );
    await finalizeProspectScan(connection, { prospectId, manifest: auditResult.manifest });
    if (ctx.cancellation.isRequested(job.jobId)) {
      // The audit is already persisted: link it so deleting the stopped job
      // also removes it.
      await updateJobProgress(connection, job.jobId, { auditId: auditResult.auditId });
      throw new JobCancelledError(job.jobId);
    }
    await completeJob(connection, job.jobId, { auditId: auditResult.auditId });
    deleteCrawlCheckpoint(auditResult.auditDir);
    deleteCrawlStateFile(auditResult.auditDir);
  } finally {
    release();
  }
}
