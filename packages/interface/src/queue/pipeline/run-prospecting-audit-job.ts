/** Compatibility executor for historical `prospecting-audit` rows (Plan 050).
 * No route creates this job type any more: a complete crawl is launched only
 * as a Full scan. The runner stays registered so a row queued before the
 * change still drains instead of failing with no runner. It calls the normal
 * audit stage with no bounded prospecting overrides, then stops before
 * analysis and report generation. Delete it once no such row can remain
 * queued in production. */

import {
  completeJob,
  ensureJobRunIdentity,
  updateJobProgress,
  type JobDocument,
} from '@odysseus/store';
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
