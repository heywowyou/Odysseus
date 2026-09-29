/**
 * The queued composition the CLI's five manual invocations
 * (audit -> analyze fr -> analyze en -> report fr -> report en) collapse
 * into. Calls the same stage functions cli's audit/analyze/report
 * commands call - see the stage files for the shared implementation.
 *
 * Plan 067: French is the canonical/default deliverable. English is never
 * generated here; the dashboard can add it later with one explicit writing
 * call against this exact structure and findings provenance.
 */

import { completeJob, ensureJobRunIdentity, type JobDocument } from '@odysseus/store';
import { buildFindingsProvenance, type SiteSignalOverrides } from '@odysseus/core';
import {
  deleteCrawlCheckpoint,
  deleteCrawlStateFile,
  serverLockKeys,
  type PageWorkGuard,
} from '@odysseus/scanner';
import { hasMeasuredCoreWebVitals } from '@odysseus/report';
import { runAuditStage } from '../../pipeline/audit-stage.js';
import { acquisitionClaimFor, crawlOptionsFromJob } from './job-crawl-options.js';
import { finalizeProspectScan } from '../../pipeline/finalize-prospect-scan.js';
import { runAllReportsStage } from '../../pipeline/report-stage.js';
import { JobCancelledError } from '../cancellation.js';
import type { PipelineContext } from '../job-queue.js';
import { createScanProgressReporter } from '../report-progress.js';
import { reportJobPhase } from './report-job-phase.js';
import {
  releaseReportProduction,
  tryAcquireReportProduction,
} from '../../pipeline/report-production-lock.js';
import { writeSelectedAnalysis } from '../../pipeline/write-selected-analysis.js';

export async function runFullAuditJob(job: JobDocument, ctx: PipelineContext): Promise<void> {
  const { connection } = ctx;
  const url = job.siteUrl;
  if (!url) {
    throw new Error(`odysseus interface: full-audit job ${job.jobId} has no siteUrl`);
  }

  // A full audit holds its server, not only its origin: two sites on one
  // shared host must not be audited at the same time.
  const release = await ctx.acquireServer(await serverLockKeys(url));

  // A stop is otherwise only seen during crawl and page work. Checked at
  // each stage boundary, so a stopped job does not spend two analysis
  // passes and a PDF render first.
  const throwIfCancelled = (): void => {
    if (ctx.cancellation.isRequested(job.jobId)) throw new JobCancelledError(job.jobId);
  };

  try {
    // Plan 035 (issue #124): one identity per job, minted once, reused by
    // every orphan re-claim. Its startedAt is the audit directory's
    // timestamp, so a re-claimed job lands in the same directory the
    // interrupted attempt was writing and its per-page results are reused.
    const runIdentity = await ensureJobRunIdentity(connection, job.jobId);

    // Issue #200: filled in by scanSite's onGuardReady once the run-wide
    // PageWorkGuard exists, so a cancellation seen through onProgress
    // (below) can force-close this run's live Chromium contexts instead
    // of only marking the job document cancelled.
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
        ...crawlOptionsFromJob(job.options),
        ...(job.options.siren !== undefined ? { manualSiren: job.options.siren } : {}),
        ...(siteSignalOverrides !== undefined ? { siteSignalOverrides } : {}),
        ...(job.options.prospectId !== undefined ? { prospectId: job.options.prospectId } : {}),
        scanIntent: 'full-audit',
        onProgress,
        onGuardReady,
        runIdentity,
        ...acquisitionClaimFor(connection, job),
      },
      connection,
    );

    if (!tryAcquireReportProduction(auditResult.auditId, 'job')) {
      throw new Error(`report production is already running for audit ${auditResult.auditId}`);
    }
    try {
      if (job.options.prospectId !== undefined) {
        await finalizeProspectScan(connection, {
          prospectId: job.options.prospectId,
          manifest: auditResult.manifest,
        });
      }

      // Computed once here over the same findings array every later stage
      // receives: the analysis and report stages each used to canonicalize
      // and hash the full array per language, four times per job. Computing
      // from the live findings (not the manifest's copy of the stamp) keeps
      // the stages' manifest-versus-findings asserts meaningful: they still
      // compare two independently obtained values.
      const findingsProvenance = buildFindingsProvenance(auditResult.findings);

      // Written now, not only in completeJob at the end: a report-stage
      // failure below still leaves the audit and both analyses persisted,
      // and the operator needs the dashboard link to reach them. See #35.
      await reportJobPhase(connection, job.jobId, job.type, {
        phase: 'analyze-fr',
        auditId: auditResult.auditId,
      });
      throwIfCancelled();
      // Issue #568: a candidate that is not recorded as ready and then
      // selected fails the job; the audit and analysis stay persisted.
      const { stage: frAnalysis } = await writeSelectedAnalysis(connection, {
        auditDir: auditResult.auditDir,
        manifest: auditResult.manifest,
        findings: auditResult.findings,
        findingsProvenance,
        obligationAssessment: auditResult.obligationAssessment,
      });

      // Plan 067: render only the canonical French report on the normal path.
      throwIfCancelled();
      await reportJobPhase(connection, job.jobId, job.type, { phase: 'report-fr' });
      await runAllReportsStage(
        auditResult.auditDir,
        auditResult.manifest,
        auditResult.findings,
        { fr: frAnalysis.analysis },
        connection,
        findingsProvenance,
      );

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

      // The registry is only forgotten in runJob's finally, after this runner
      // resolves, so a stop requested during the long analyze or report window
      // still gets observed here instead of being overwritten by 'complete'.
      // The audit, analyses, and reports are already persisted and the job
      // already carries the auditId (updateJobProgress writes it even to a
      // cancelled job), so the
      // dashboard still reaches the work.
      throwIfCancelled();

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
      releaseReportProduction(auditResult.auditId, 'job');
    }
  } finally {
    release();
  }
}
