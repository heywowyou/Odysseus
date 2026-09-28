/**
 * Ordered queue: a single background loop claims the first queued job via
 * store's claimNextQueuedJob (an atomic findOneAndUpdate sorted by the
 * durable queueOrder, plan 061 §6), so order and safe concurrent claiming
 * both come straight from Mongo rather than a hand-rolled in-memory mirror
 * that would need to stay in sync with it. The operator may reorder waiting
 * scans; there are no priority classes.
 *
 * Per-origin coordination is a single shared OriginLock instance (see
 * @odysseus/scanner) held across every job this queue runs, so two jobs
 * against the same origin never overlap regardless of concurrency.
 *
 * A full audit also holds its site's server addresses (serverLockKeys), and
 * takes them through acquireServer: a job whose server is busy gives its
 * queue slot back while it waits, so a job for another server can run, and
 * it takes the next free slot before any new job is claimed once the server
 * is free. The slot count is the number of scans actually working.
 */

import type { Connection } from 'mongoose';
import { OriginLock, readOdysseusBuildId, StaleAcquisitionLeaseError } from '@odysseus/scanner';
import { ReportIdentityUnconfirmedError } from '@odysseus/report';
import {
  backfillQueueOrder,
  cancelJob,
  claimNextQueuedJob,
  failJob,
  markJobNeedsInput,
  reconcileFailedAuditJobs,
  resetOrphanedRunningJobs,
  settleCancelRequestedJobsOnStartup,
  settleCancelRequestedJob,
  updateJobProgress,
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
  /** Takes every key in `keys` on originLock for this job. When one is held
   *  by another job, this job gives its queue slot back while it waits and
   *  takes a slot again before returning, so it never occupies a slot while
   *  idle. Throws JobCancelledError when the job is stopped while waiting.
   *  Returns the release for the keys. */
  acquireServer: (keys: readonly string[]) => Promise<() => void>;
}

/** How often a job waiting for its server checks for a stop request. */
const SERVER_WAIT_CANCEL_POLL_MS = 2_000;

export type PipelineFn = (job: JobDocument, ctx: PipelineContext) => Promise<void>;

export function waiterCanInheritServerSlot(
  waiterKeys: ReadonlySet<string>,
  releasingKeys: ReadonlySet<string>,
): boolean {
  return [...waiterKeys].every((key) => releasingKeys.has(key));
}

interface ServerWaiter {
  jobId: string;
  keys: ReadonlySet<string>;
  /** Set when an ending job handed its slot to this waiter. */
  slotTransferred: boolean;
}

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
  /** How often a job waiting for its server checks for a stop request.
   *  Milliseconds; tests shorten it. */
  serverWaitCancelPollMs?: number;
}

export class JobQueue {
  private readonly connection: Connection;
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private readonly serverWaitCancelPollMs: number;
  private readonly originLock = new OriginLock();
  private readonly cancellation = new CancellationRegistry();
  /** Jobs whose runner is executing in this process right now. A stopped
   *  job's document is terminal immediately, but its pipeline keeps working
   *  until the next stage boundary; this is what tells the two apart. */
  private readonly inFlight = new Set<string>();
  private readonly runners: Record<JobType, PipelineFn>;

  /** Queue slots in use: jobs working, slots handed to a job about to work,
   *  and the claim loop's reservation while it asks Mongo for the next job.
   *  Never counts a job waiting for its server (see acquireServer). */
  private activeCount = 0;
  /** Jobs whose server is free again, waiting for a slot. Served before the
   *  loop claims new work. Non-empty only while every slot is in use. */
  private readonly slotWaiters: Array<() => void> = [];
  /** Jobs that gave their slot back to wait for their server, in the order
   *  they started waiting, which is also the lock's own order. A job that
   *  ends while holding keys they need hands its slot to the first of them,
   *  so the slot follows the server instead of going to a new claim. */
  private readonly serverWaiters: ServerWaiter[] = [];
  /** Whether each in-flight job currently holds a slot. */
  private readonly slotHeld = new Map<string, boolean>();
  /** Server keys each in-flight job took through acquireServer. */
  private readonly heldKeys = new Map<string, readonly string[]>();
  private running = false;
  private loopPromise?: Promise<void>;
  private wake: (() => void) | undefined;
  private readonly workerRevision: string;

  constructor(options: JobQueueOptions) {
    this.connection = options.connection;
    this.concurrency = options.concurrency ?? DEFAULT_QUEUE_CONCURRENCY;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.serverWaitCancelPollMs = options.serverWaitCancelPollMs ?? SERVER_WAIT_CANCEL_POLL_MS;
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
    try {
      await settleCancelRequestedJobsOnStartup(this.connection);
    } catch (error) {
      logger.error({ err: error }, 'cancellation recovery skipped; the queue will still start');
    }
    const orphanedCount = await resetOrphanedRunningJobs(this.connection, new Date(), {
      includeFreshHeartbeats: true,
    });
    // Before the first claim, so a row queued by an older build keeps the
    // position its createdAt gave it instead of jumping the ordered queue.
    const backfilled = await backfillQueueOrder(this.connection);
    if (backfilled > 0) logger.info({ backfilled }, 'gave legacy queued jobs a durable order');
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
   *  status is written by the cancel route; this registry is only the
   *  in-process signal the runner observes. The route registers a stop only
   *  when the job was running (`cancel-requested`): a queued job is
   *  cancelled by one conditional write on `status: 'queued'`, so a claim
   *  cannot slip between a read and a write there, and nothing needs
   *  signalling. Forgetting the entry once the runner has acted keeps the
   *  set bounded over the process's life. Forgetting on the claim path is
   *  forbidden: it would erase a stop registered for a job that is already
   *  running, and the pipeline would never abort. */
  requestCancel(jobId: string): void {
    this.cancellation.request(jobId);
  }

  /** True while the job's runner is still executing here, including after a
   *  stop was requested and before the runner reached a stage boundary. */
  isJobInFlight(jobId: string): boolean {
    return this.inFlight.has(jobId);
  }

  /** Every job whose runner is still executing here (see isJobInFlight). */
  listInFlightJobIds(): string[] {
    return [...this.inFlight];
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      this.wake = resolve;
      setTimeout(resolve, ms);
    });
    this.wake = undefined;
  }

  /** Gives a slot back. A job ending with server keys hands it to the
   *  first job waiting for one of those keys; otherwise it goes to the job
   *  that has waited longest for a slot, or back to the claim loop. */
  private releaseSlot(keys?: readonly string[]): void {
    if (keys !== undefined && keys.length > 0) {
      const releasing = new Set(keys);
      const heir = this.serverWaiters.find(
        (waiter) => !waiter.slotTransferred && waiterCanInheritServerSlot(waiter.keys, releasing),
      );
      if (heir !== undefined) {
        heir.slotTransferred = true;
        return;
      }
    }
    const next = this.slotWaiters.shift();
    if (next !== undefined) {
      next();
      return;
    }
    this.activeCount--;
    this.wake?.();
  }

  /** Resolves once this caller holds a slot. `abandon` withdraws a caller
   *  still waiting, and returns false when the slot was already handed over,
   *  in which case the caller owns it and must release it. */
  private takeSlot(): { taken: Promise<void>; abandon: () => boolean } {
    if (this.activeCount < this.concurrency) {
      this.activeCount++;
      return { taken: Promise.resolve(), abandon: () => false };
    }
    let resolveTaken!: () => void;
    const taken = new Promise<void>((resolve) => {
      resolveTaken = resolve;
    });
    this.slotWaiters.push(resolveTaken);
    return {
      taken,
      abandon: () => {
        const index = this.slotWaiters.indexOf(resolveTaken);
        if (index === -1) return false;
        this.slotWaiters.splice(index, 1);
        return true;
      },
    };
  }

  /** Resolves with `promise`, or throws JobCancelledError once the job is
   *  stopped. Stop requests are in-process flags, so they are polled. */
  private async unlessCancelled<T>(jobId: string, promise: Promise<T>): Promise<T> {
    if (this.cancellation.isRequested(jobId)) throw new JobCancelledError(jobId);
    let timer: ReturnType<typeof setInterval> | undefined;
    const cancelled = new Promise<never>((_, reject) => {
      timer = setInterval(() => {
        if (this.cancellation.isRequested(jobId)) reject(new JobCancelledError(jobId));
      }, this.serverWaitCancelPollMs);
    });
    try {
      return await Promise.race([promise, cancelled]);
    } finally {
      clearInterval(timer);
    }
  }

  private async reportServerWait(job: JobDocument, waiting: boolean): Promise<void> {
    try {
      await updateJobProgress(this.connection, job.jobId, {
        progress: {
          serverWait: waiting ? { waiting, since: new Date().toISOString() } : { waiting },
        },
      });
    } catch (error) {
      // Display only: a failed write must not stop or strand the job.
      logger.warn({ err: error, jobId: job.jobId }, 'could not record the server wait');
    }
  }

  private async acquireServer(job: JobDocument, keys: readonly string[]): Promise<() => void> {
    const acquiring = this.originLock.acquireAll(keys);
    // Free keys resolve within microtasks; anything still pending after
    // the next macrotask is waiting on another job.
    const immediate = await Promise.race([
      acquiring,
      new Promise<undefined>((resolve) => setImmediate(() => resolve(undefined))),
    ]);
    if (immediate !== undefined) {
      this.heldKeys.set(job.jobId, keys);
      if (job.progress?.serverWait?.waiting === true) await this.reportServerWait(job, false);
      return immediate;
    }

    const waiter: ServerWaiter = { jobId: job.jobId, keys: new Set(keys), slotTransferred: false };
    this.serverWaiters.push(waiter);
    const stopWaiting = (): void => {
      const index = this.serverWaiters.indexOf(waiter);
      if (index !== -1) this.serverWaiters.splice(index, 1);
    };
    if (this.slotHeld.get(job.jobId) === true) {
      this.slotHeld.set(job.jobId, false);
      this.releaseSlot();
    }
    await this.reportServerWait(job, true);

    let release: () => void;
    try {
      release = await this.unlessCancelled(job.jobId, acquiring);
    } catch (error) {
      stopWaiting();
      // The keys are granted later all the same; hand them straight back.
      void acquiring.then((granted) => granted());
      if (waiter.slotTransferred) this.releaseSlot();
      throw error;
    }
    stopWaiting();

    if (!waiter.slotTransferred) {
      const slot = this.takeSlot();
      try {
        await this.unlessCancelled(job.jobId, slot.taken);
      } catch (error) {
        release();
        if (!slot.abandon()) this.releaseSlot(keys);
        throw error;
      }
    }
    this.slotHeld.set(job.jobId, true);
    this.heldKeys.set(job.jobId, keys);
    await this.reportServerWait(job, false);
    return release;
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      while (this.activeCount < this.concurrency) {
        // Reserved before the claim, so a slot handed to a waiting job while
        // Mongo answers cannot push the working count past the limit.
        this.activeCount++;
        let job: JobDocument | null;
        try {
          job = await claimNextQueuedJob(this.connection, { workerRevision: this.workerRevision });
        } catch (error) {
          this.releaseSlot();
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
        if (!job) {
          this.releaseSlot();
          break;
        }
        this.slotHeld.set(job.jobId, true);
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
            if (this.slotHeld.get(job.jobId) === true) {
              this.releaseSlot(this.heldKeys.get(job.jobId));
            }
            this.slotHeld.delete(job.jobId);
            this.heldKeys.delete(job.jobId);
          });
      }
      await this.sleep(this.pollIntervalMs);
    }
  }

  private async runJob(job: JobDocument): Promise<void> {
    const runner = this.runners[job.type];
    const jobLog = logger.child({ jobId: job.jobId, jobType: job.type });
    this.inFlight.add(job.jobId);
    try {
      await runner(job, {
        connection: this.connection,
        originLock: this.originLock,
        cancellation: this.cancellation,
        acquireServer: (keys) => this.acquireServer(job, keys),
      });
    } catch (error) {
      if (error instanceof JobCancelledError) {
        // The cancel route already wrote the terminal state; this write is
        // the safety net for the restart path where the runner observes the
        // registry but the document write raced. failJob would mislabel a
        // stopped scan as a failure, so it must not run for this case.
        await cancelJob(this.connection, job.jobId, 'cancelled by operator');
      } else if (error instanceof StaleAcquisitionLeaseError) {
        // Plan 059 step 22: the job was requeued and another worker now holds
        // it. Its row belongs to that worker, so this one writes nothing.
        jobLog.warn({ err: error }, 'superseded worker stopped; the job belongs to another claim');
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
      try {
        // Any outcome after a durable stop request is terminal cancellation,
        // including a normal return or a different pipeline error.
        await settleCancelRequestedJob(this.connection, job.jobId);
      } finally {
        this.inFlight.delete(job.jobId);
        this.cancellation.forget(job.jobId);
        forgetJobPhaseTelemetry(job.jobId);
      }
    }
  }
}
