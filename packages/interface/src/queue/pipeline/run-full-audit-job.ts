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

import { completeJob, updateJobProgress, type JobDocument } from '@odysseus/store';
import type { SiteSignalOverrides } from '@odysseus/core';
import { runAnalysisStage } from '../../pipeline/analysis-stage.js';
import { runAuditStage } from '../../pipeline/audit-stage.js';
import { runAllReportsStage } from '../../pipeline/report-stage.js';
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
    const onProgress = createScanProgressReporter(connection, job.jobId);

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
        ...(job.options.siren !== undefined ? { manualSiren: job.options.siren } : {}),
        ...(siteSignalOverrides !== undefined ? { siteSignalOverrides } : {}),
        onProgress,
      },
      connection,
    );

    await updateJobProgress(connection, job.jobId, { phase: 'analyze-fr' });
    const frAnalysis = await runAnalysisStage(
      auditResult.auditDir,
      auditResult.manifest,
      auditResult.findings,
      { language: 'fr', obligationAssessment: auditResult.obligationAssessment },
      connection,
    );

    await updateJobProgress(connection, job.jobId, { phase: 'analyze-en' });
    const enAnalysis = await runAnalysisStage(
      auditResult.auditDir,
      auditResult.manifest,
      auditResult.findings,
      { language: 'en', obligationAssessment: auditResult.obligationAssessment },
      connection,
    );

    // Renders all four (language, tier) combinations - screening and full,
    // French and English - from the two analyses already produced above.
    // See runAllReportsStage's own doc comment: no re-scan, no second LLM
    // call, tier is purely a report-rendering decision.
    await updateJobProgress(connection, job.jobId, { phase: 'report-fr' });
    await runAllReportsStage(
      auditResult.auditDir,
      auditResult.manifest,
      auditResult.findings,
      { fr: frAnalysis.analysis, en: enAnalysis.analysis },
      connection,
    );
    await updateJobProgress(connection, job.jobId, { phase: 'report-en' });

    await completeJob(connection, job.jobId, { auditId: auditResult.auditId });
  } finally {
    release();
  }
}
