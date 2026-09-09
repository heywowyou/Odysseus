/**
 * The queued composition the CLI's five manual invocations
 * (audit -> analyze fr -> analyze en -> report fr -> report en) collapse
 * into. Calls the same stage functions cli's audit/analyze/report
 * commands call - see the stage files for the shared implementation.
 *
 * Both languages are always generated: bilingual delivery is a product
 * requirement (CLAUDE.md style rules) and LLM cost is negligible per the
 * brief's own engineering constraints, so there is no reason to make the
 * operator come back for a second language later.
 */

import {
  completeJob,
  ensureJobRunIdentity,
  updateJobProgress,
  type JobDocument,
} from '@odysseus/store';
import type { SiteSignalOverrides } from '@odysseus/core';
import { deleteCrawlCheckpoint, deleteCrawlStateFile } from '@odysseus/scanner';
import { hasMeasuredCoreWebVitals } from '@odysseus/report';
import { pauseBetweenLanguagePasses } from '@odysseus/llm';
import { runAnalysisStage } from '../../pipeline/analysis-stage.js';
import { runAuditStage } from '../../pipeline/audit-stage.js';
import { runAllReportsStage } from '../../pipeline/report-stage.js';
import { JobCancelledError } from '../cancellation.js';
import type { PipelineContext } from '../job-queue.js';
import { createScanProgressReporter } from '../report-progress.js';

export async function runFullAuditJob(job: JobDocument, ctx: PipelineContext): Promise<void> {
  const { connection, originLock } = ctx;
  const url = job.siteUrl;
  if (!url) {
    throw new Error(`odysseus interface: full-audit job ${job.jobId} has no siteUrl`);
  }

  const origin = new URL(url).origin;
  const release = await originLock.acquire(origin);

  try {
    // Plan 035 (issue #124): one identity per job, minted once, reused by
    // every orphan re-claim. Its startedAt is the audit directory's
    // timestamp, so a re-claimed job lands in the same directory the
    // interrupted attempt was writing and its per-page results are reused.
    const runIdentity = await ensureJobRunIdentity(connection, job.jobId);

    const onProgress = createScanProgressReporter(connection, job.jobId, ctx.cancellation);

    const siteSignalOverrides: SiteSignalOverrides | undefined =
      job.options.transactionalFlow !== undefined
        ? {
            hasTransactionalFlow: {
              value: job.options.transactionalFlow,
              ...(job.options.transactionalFlowReason !== undefined
                ? { reason: job.options.transactionalFlowReason }
                : {}),
            },
          }
        : undefined;

    const auditResult = await runAuditStage(
      url,
      {
        ...(job.options.maxPages !== undefined ? { maxPages: job.options.maxPages } : {}),
        ...(job.options.maxDepth !== undefined ? { maxDepth: job.options.maxDepth } : {}),
        ...(job.options.delayMs !== undefined ? { delayMs: job.options.delayMs } : {}),
        ...(job.options.scanConcurrency !== undefined
          ? { scanConcurrency: job.options.scanConcurrency }
          : {}),
        ...(job.options.siren !== undefined ? { manualSiren: job.options.siren } : {}),
        ...(siteSignalOverrides !== undefined ? { siteSignalOverrides } : {}),
        ...(job.options.seeds !== undefined ? { seeds: job.options.seeds } : {}),
        ...(job.options.exclusions !== undefined ? { exclusions: job.options.exclusions } : {}),
        ...(job.options.bookingEngineUrl !== undefined
          ? { bookingEngineUrl: job.options.bookingEngineUrl }
          : {}),
        onProgress,
        runIdentity,
      },
      connection,
    );

    // Written now, not only in completeJob at the end: a report-stage
    // failure below still leaves the audit and both analyses persisted,
    // and the operator needs the dashboard link to reach them. See #35.
    await updateJobProgress(connection, job.jobId, {
      phase: 'analyze-fr',
      auditId: auditResult.auditId,
    });
    const frAnalysis = await runAnalysisStage(
      auditResult.auditDir,
      auditResult.manifest,
      auditResult.findings,
      { language: 'fr', obligationAssessment: auditResult.obligationAssessment },
      connection,
    );

    // Issue #30: back to back, the English pass entered the provider quota
    // window the French pass had just drained and 429ed through every
    // retry. The pacing knowledge lives in @odysseus/llm with the rest of
    // the rate-limit handling.
    await pauseBetweenLanguagePasses();

    await updateJobProgress(connection, job.jobId, { phase: 'analyze-en' });
    const enAnalysis = await runAnalysisStage(
      auditResult.auditDir,
      auditResult.manifest,
      auditResult.findings,
      { language: 'en', obligationAssessment: auditResult.obligationAssessment },
      connection,
    );

    // Renders both language reports (fr and en) from the two analyses
    // already produced above. See runAllReportsStage's own doc comment:
    // no re-scan, no second LLM call.
    await updateJobProgress(connection, job.jobId, { phase: 'report-fr' });
    await runAllReportsStage(
      auditResult.auditDir,
      auditResult.manifest,
      auditResult.findings,
      { fr: frAnalysis.analysis, en: enAnalysis.analysis },
      connection,
    );
    await updateJobProgress(connection, job.jobId, { phase: 'report-en' });

    // P0.1 (2026-08-21 La Corniche feedback pass): a completed job whose
    // report advertises a pillar (performance) it has zero data for used
    // to look identical, in the dashboard, to a genuinely complete one -
    // the only place that fact was visible was 27 pages into the PDF
    // itself. Status stays 'complete' (the audit and report did generate);
    // needsReview flags the gap for the dashboard without inventing a new
    // status value every other status check would need to learn about.
    const needsReview = hasMeasuredCoreWebVitals(auditResult.manifest)
      ? undefined
      : 'Performance measurement (Lighthouse) failed on every scanned page: the report has no Core Web Vitals data.';

    // The advisory passes are pure advisory value and were started inside
    // the analysis stages; settling them here keeps shutdown semantics (no
    // silently dropped work) while no longer serializing four provider
    // round trips ahead of the report stage.
    await Promise.allSettled([...frAnalysis.advisoryPasses, ...enAnalysis.advisoryPasses]);
    // The registry is only forgotten in runJob's finally, after this runner
    // resolves, so a stop requested during the long analyze or report window
    // still gets observed here instead of being overwritten by 'complete'.
    // The audit, analyses, and reports are already persisted and the job
    // already carries the auditId (updateJobProgress above), so the
    // dashboard still reaches the work.
    if (ctx.cancellation.isRequested(job.jobId)) {
      throw new JobCancelledError(job.jobId);
    }

    await completeJob(connection, job.jobId, {
      auditId: auditResult.auditId,
      ...(needsReview !== undefined ? { needsReview } : {}),
    });

    // Plan 002 (issue #132): the crawl checkpoint deliberately outlives the
    // audit stage, so only now is it safe to drop. It sits after
    // completeJob inside this try on purpose: a crash in any stage above,
    // or in completeJob itself, requeues the job, and the checkpoint is
    // what keeps that retry from re-crawling the whole site.
    deleteCrawlCheckpoint(auditResult.auditDir);
    deleteCrawlStateFile(auditResult.auditDir);
  } finally {
    release();
  }
}
