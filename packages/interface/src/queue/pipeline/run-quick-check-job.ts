/** Single-site Quick Check composition. It is intentionally explicit rather
 * than a one-item call through the internal bounded prospecting batch: the
 * job contract, one-page cap, and lack of analysis/report stages should be
 * visible to both the queue and its tests. */

import { completeJob, ensureJobRunIdentity, type JobDocument } from '@odysseus/store';
import { deleteCrawlCheckpoint, deleteCrawlStateFile, type PageWorkGuard } from '@odysseus/scanner';
import { runAuditStage } from '../../pipeline/audit-stage.js';
import { crawlOptionsFromJob } from './job-crawl-options.js';
import { finalizeProspectScan } from '../../pipeline/finalize-prospect-scan.js';
import type { PipelineContext } from '../job-queue.js';
import { JobCancelledError } from '../cancellation.js';
import { createScanProgressReporter } from '../report-progress.js';

export async function runQuickCheckJob(job: JobDocument, ctx: PipelineContext): Promise<void> {
  const { connection, originLock } = ctx;
  const url = job.siteUrl;
  if (url === undefined) {
    throw new Error(`odysseus interface: quick-check job ${job.jobId} has no siteUrl`);
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
        // Spread after the operator's options: a Quick Check is one page by
        // definition, whatever a stored row says.
        maxPages: 1,
        skipLighthouse: true,
        sitemapMode: 'inspect',
        scanIntent: 'quick-check',
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
