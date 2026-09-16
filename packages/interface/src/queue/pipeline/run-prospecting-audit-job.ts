/** Single-site Prepare outreach composition. This deliberately calls the
 * normal audit stage with no bounded prospecting overrides, then stops before
 * analysis and report generation. Historical outreach-full-scan rows keep
 * using their compatibility runner; newly created rows use this canonical
 * job type. */

import { completeJob, ensureJobRunIdentity, type JobDocument } from '@odysseus/store';
import { deleteCrawlCheckpoint, deleteCrawlStateFile, type PageWorkGuard } from '@odysseus/scanner';
import { runAuditStage } from '../../pipeline/audit-stage.js';
import { crawlOptionsFromJob } from './job-crawl-options.js';
import { finalizeProspectScan } from '../../pipeline/finalize-prospect-scan.js';
import type { PipelineContext } from '../job-queue.js';
import { JobCancelledError } from '../cancellation.js';
import { createScanProgressReporter } from '../report-progress.js';

export async function runProspectingAuditJob(
  job: JobDocument,
  ctx: PipelineContext,
): Promise<void> {
  const { connection, originLock } = ctx;
  const url = job.siteUrl;
  if (url === undefined) {
    throw new Error(`odysseus interface: prospecting-audit job ${job.jobId} has no siteUrl`);
  }

  const release = await originLock.acquire(new URL(url).origin);
  try {
    const runIdentity = await ensureJobRunIdentity(connection, job.jobId);
    const guardHolder: { current?: PageWorkGuard } = {};
    const onProgress = createScanProgressReporter(
      connection,
      job.jobId,
      job.type,
      ctx.cancellation,
      guardHolder,
    );
    const onGuardReady = (guard: PageWorkGuard): void => {
      guardHolder.current = guard;
    };
    const auditResult = await runAuditStage(
      url,
      {
        ...(job.options.prospectId === undefined ? {} : { prospectId: job.options.prospectId }),
        ...crawlOptionsFromJob(job.options),
        scanIntent: 'prospecting-audit',
        onProgress,
        onGuardReady,
        runIdentity,
      },
      connection,
    );

    if (job.options.prospectId !== undefined) {
      await finalizeProspectScan(connection, {
        prospectId: job.options.prospectId,
        manifest: auditResult.manifest,
      });
    }
    if (ctx.cancellation.isRequested(job.jobId)) {
      throw new JobCancelledError(job.jobId);
    }

    await completeJob(connection, job.jobId, { auditId: auditResult.auditId });
    deleteCrawlCheckpoint(auditResult.auditDir);
    deleteCrawlStateFile(auditResult.auditDir);
  } finally {
    release();
  }
}
