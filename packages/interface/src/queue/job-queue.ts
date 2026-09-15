/**
 * FIFO queue: a single background loop claims the oldest queued job via
 * store's claimNextQueuedJob (an atomic findOneAndUpdate sorted by
 * createdAt), so FIFO order and safe concurrent claiming both come
 * straight from Mongo rather than a hand-rolled in-memory mirror that
 * would need to stay in sync with it. No queue-priority system, per 7.1.
 *
 * Per-origin coordination is a single shared OriginLock instance (see
 * @odysseus/scanner) held across every job this queue runs, so two jobs
 * against the same origin never overlap regardless of concurrency.
 */

import type { Connection } from 'mongoose';
import { OriginLock, readOdysseusBuildId } from '@odysseus/scanner';
import { ReportIdentityUnconfirmedError } from '@odysseus/report';
import {
  cancelJob,
  claimNextQueuedJob,
  failJob,
  markJobNeedsInput,
  reconcileFailedAuditJobs,
  resetOrphanedRunningJobs,
  type JobDocument,
  type JobType,
} from '@odysseus/store';
import { DEFAULT_QUEUE_CONCURRENCY } from '../config.js';
import { logger } from '../logger.js';
import { forgetJobPhaseTelemetry, lastKnownJobStage } from './pipeline/report-job-phase.js';
import { classifyJobError } from '../telemetry/events.js';
import { captureJobTelemetry } from '../telemetry/job-telemetry.js';
import { CancellationRegistry, JobCancelledError } from './cancellation.js';

export interface PipelineContext {
  connection: Connection;
  originLock: OriginLock;
  /** Shared stop-request registry; runners check it at page boundaries. */
  cancellation: CancellationRegistry;
}

export type PipelineFn = (job: JobDocument, ctx: PipelineContext) => Promise<void>;

export interface JobQueueOptions {
  connection: Connection;
  concurrency?: number;
  /** How often the loop checks for new work when nothing has woken it
   *  early via notify(). Milliseconds. */
  pollIntervalMs?: number;
  /** One runner per JobType, exhaustively - a Record rather than the
   *  two-way ternary this replaced (job.type === 'full-audit' ? A : B).
   *  With two job types that ternary was fine; with three (and counting)
   *  a hand-maintained conditional risks a silently-wrong fallback: the
   *  old code, unmodified, would have routed 'prospect-ingestion' jobs
   *  into runProspectingJob without a compile error. A Record is
   *  exhaustively checked - if JobType grows and this literal is missing
   *  a key, tsc rejects it. */
  runners: Record<JobType, PipelineFn>;
}

export class JobQueue {
  private readonly connection: Connection;
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private readonly originLock = new OriginLock();
  private readonly cancellation = new CancellationRegistry();
  private readonly runners: Record<JobType, PipelineFn>;

  private activeCount = 0;
  private running = false;
  private loopPromise?: Promise<void>;
  private wake: (() => void) | undefined;
  private readonly workerRevision: string;

  constructor(options: JobQueueOptions) {
    this.connection = options.connection;
    this.concurrency = options.concurrency ?? DEFAULT_QUEUE_CONCURRENCY;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.runners = options.runners;
    this.workerRevision = readOdysseusBuildId();
  }

  /** Resets any job left 'running' by an unclean previous shutdown back
   *  to 'queued' (see resetOrphanedRunningJobs), then advances any failed
   *  full-audit job whose audit has since gained a current bilingual
   *  report pair (see reconcileFailedAuditJobs, issue #56), then starts the
   *  claim loop. Returns
   *  the number of jobs reset, for the caller to log. includeFreshHeartbeats
   *  is required by the single-container deployment (issue #124): at
   *  start() every running job is by definition unowned because the
   *  container that wrote its heartbeat no longer exists, so waiting out
   *  the staleness window would only delay recovery after a fast bounce.
   *  Neither bookkeeping pass may ever keep the queue from starting: each
   *  is maintenance, not a prerequisite for work. */
  async start(): Promise<number> {
    const orphanedCount = await resetOrphanedRunningJobs(this.connection, new Date(), {
      includeFreshHeartbeats: true,
    });
    try {
      const reconciled = await reconcileFailedAuditJobs(this.connection);
      if (reconciled > 0) {
        logger.info(
          { reconciled },
          'advanced failed full-audit jobs whose audits completed outside the queue',
        );
      }
    } catch (error) {
      logger.error({ err: error }, 'failed job reconciliation skipped; the queue will still start');
    }
    this.running = true;
    this.loopPromise = this.runLoop();
    return orphanedCount;
  }

  /** Stops claiming new work and waits for the loop to notice. Does not
   *  wait for already-running jobs to finish: they become 'running'
   *  orphans a future start() will recover, which is the intended
   *  behavior for a Ctrl+C shutdown mid-scan rather than hanging on a
   *  scan that can take minutes. */
  async stop(): Promise<void> {
    this.running = false;
    this.wake?.();
    await this.loopPromise;
  }

  /** Wakes the loop immediately rather than waiting out the poll
   *  interval - called right after POST /api/scans creates a job, so
   *  a submitted scan starts promptly instead of on the next tick. */
  notify(): void {
    this.wake?.();
  }

  /** Readiness requires start() to have completed and the claim loop to remain enabled. */
  isReady(): boolean {
    return this.running && this.loopPromise !== undefined;
  }

  /** Registers an operator stop request for a job. The job document's
   *  'cancelled' status is written by the cancel route; this registry is
   *  only the in-process signal the runner observes. Forgetting the entry
   *  once the runner has acted keeps the set bounded over the process's
   *  life. The route also registers the stop for queued jobs, so a claim
   *  landing between the route's read and its write still aborts the
   *  pipeline; an entry for a job cancelled while queued and never claimed
   *  then stays until process end (jobIds are randomUUID, never reused).
   *  Forgetting on the claim path is forbidden: it would erase the entry
   *  before the route's cancelJob write lands, and the running pipeline
   *  would never abort. */
  requestCancel(jobId: string): void {
    this.cancellation.request(jobId);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      this.wake = resolve;
      setTimeout(resolve, ms);
    });
    this.wake = undefined;
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      while (this.activeCount < this.concurrency) {
        let job: JobDocument | null;
        try {
          job = await claimNextQueuedJob(this.connection, { workerRevision: this.workerRevision });
        } catch (error) {
          // A transient claim failure (e.g. a Mongo hiccup) must not escape
          // runLoop: an unhandled rejection here would either crash the
          // process or, if swallowed elsewhere, leave this loop exited
          // with `running` still true - silently never claiming work again.
          // Log it and fall through to the poll-interval sleep below
          // instead of retrying in a tight loop.
          logger.error(
            { err: error },
            'failed to claim next queued job, will retry after poll interval',
          );
          break;
        }
        if (!job) break;
        this.activeCount++;
        void this.runJob(job)
          .catch((error: unknown) => {
            // runJob contains pipeline failures, so a rejection here means
            // recording the appropriate terminal state failed. This promise
            // is deliberately detached; keep its final rejection boundary
            // here so a transient store outage cannot become an unhandled
            // rejection or disable subsequent queue work (issue #224).
            logger.error(
              { err: error, jobId: job.jobId, jobType: job.type },
              'failed to persist job terminal state; the queue will continue',
            );
          })
          .finally(() => {
            this.activeCount--;
            this.wake?.();
          });
      }
      await this.sleep(this.pollIntervalMs);
    }
  }

  private async runJob(job: JobDocument): Promise<void> {
    const runner = this.runners[job.type];
    const jobLog = logger.child({ jobId: job.jobId, jobType: job.type });
    try {
      await runner(job, {
        connection: this.connection,
        originLock: this.originLock,
        cancellation: this.cancellation,
      });
    } catch (error) {
      if (error instanceof JobCancelledError) {
        // The cancel route already wrote the terminal state; this write is
        // the safety net for the restart path where the runner observes the
        // registry but the document write raced. failJob would mislabel a
        // stopped scan as a failure, so it must not run for this case.
        await cancelJob(this.connection, job.jobId, 'cancelled by operator');
      } else if (error instanceof ReportIdentityUnconfirmedError) {
        // Issue #73: the pipeline finished and stopped deliberately on the
        // D8 identity-confirmation gate - not a crash. failJob would make
        // this indistinguishable from a real failure on the dashboard.
        await markJobNeedsInput(this.connection, job.jobId, error.fields, error.message);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        jobLog.error({ err: error }, 'pipeline job failed');
        captureJobTelemetry({
          kind: 'job-failed',
          jobId: job.jobId,
          jobType: job.type,
          buildId: readOdysseusBuildId(),
          stage: lastKnownJobStage(job.jobId) ?? 'unknown',
          errorKind: classifyJobError(error),
        });
        await failJob(this.connection, job.jobId, message);
      }
    } finally {
      this.cancellation.forget(job.jobId);
      forgetJobPhaseTelemetry(job.jobId);
    }
  }
}
