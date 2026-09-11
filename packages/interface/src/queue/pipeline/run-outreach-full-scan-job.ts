/**
 * Plan 037: the candidate-linked outreach full scan.
 *
 * Runs the paid audit's own crawl, content checks, normalization, and
 * persistence, then stops: no model analysis, no report. The resulting
 * audit is prospecting evidence for the v2 scorecard preview, never a
 * deliverable - a paid purchase always runs a fresh full-audit job.
 *
 * Checkpoint and resume come along for free: the stage's resume machinery
 * is gated on Lighthouse running (never skipped here), and the job's run
 * identity works exactly as for a paid audit.
 *
 * Authorization is re-checked when the worker claims the job, not only at
 * creation: a queued scan must never spend the expensive scan after the
 * facts that authorized it changed (suppression, selection, domain).
 */

import {
  completeJob,
  failJob,
  ensureJobRunIdentity,
  planOutreachFullScan,
  type JobDocument,
} from '@odysseus/store';
import { deleteCrawlCheckpoint, deleteCrawlStateFile } from '@odysseus/scanner';
import { CURRENT_QUALIFICATION_VERSION } from '../../prospecting/hotel-qualification/qualify-hotels.js';
import { runAuditStage } from '../../pipeline/audit-stage.js';
import type { PipelineContext } from '../job-queue.js';
import { createScanProgressReporter } from '../report-progress.js';

export async function runOutreachFullScanJob(
  job: JobDocument,
  ctx: PipelineContext,
): Promise<void> {
  const { connection, originLock } = ctx;
  const url = job.siteUrl;
  if (!url) {
    throw new Error(`odysseus interface: outreach-full-scan job ${job.jobId} has no siteUrl`);
  }
  const { outreachCandidateId } = job.options;
  if (
    outreachCandidateId === undefined ||
    job.options.outreachCohortId === undefined ||
    job.options.outreachScoringVersion === undefined
  ) {
    throw new Error(
      `odysseus interface: outreach-full-scan job ${job.jobId} has no candidate provenance`,
    );
  }

  const origin = new URL(url).origin;
  const release = await originLock.acquire(origin);

  try {
    const plan = await planOutreachFullScan(
      connection,
      outreachCandidateId,
      { qualificationVersion: CURRENT_QUALIFICATION_VERSION },
      // The claim already flipped this job to `running`, so the in-flight
      // check must exclude the job itself or every scan would refuse.
      { excludeJobId: job.jobId },
    );
    if ('refused' in plan) {
      await failJob(connection, job.jobId, `outreach full scan refused: ${plan.refused}`);
      return;
    }
    if (plan.domain !== new URL(url).hostname.toLowerCase()) {
      await failJob(
        connection,
        job.jobId,
        'outreach full scan refused: domain-mismatch between job and current selection',
      );
      return;
    }

    const runIdentity = await ensureJobRunIdentity(connection, job.jobId);
    const onProgress = createScanProgressReporter(connection, job.jobId, ctx.cancellation);

    const auditResult = await runAuditStage(
      url,
      {
        onProgress,
        runIdentity,
        outreachContext: {
          candidateId: plan.candidateId,
          cohortId: plan.cohortId,
          scoringVersion: plan.scoringVersion,
        },
      },
      connection,
    );

    await completeJob(connection, job.jobId, { auditId: auditResult.auditId });

    // Same lifecycle as the paid audit runner: the checkpoint outlives the
    // audit stage and is only dropped once the job is terminal.
    deleteCrawlCheckpoint(auditResult.auditDir);
    deleteCrawlStateFile(auditResult.auditDir);
  } finally {
    release();
  }
}
