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
import { OriginLock } from '@odysseus/scanner';
import { claimNextQueuedJob, failJob, resetOrphanedRunningJobs, type JobDocument, type JobType } from '@odysseus/store';
import { DEFAULT_QUEUE_CONCURRENCY } from '../config.js';

export interface PipelineContext {
  connection: Connection;
  originLock: OriginLock;
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
  private readonly runners: Record<JobType, PipelineFn>;

  private activeCount = 0;
  private running = false;
  private loopPromise?: Promise<void>;
  private wake: (() => void) | undefined;

  constructor(options: JobQueueOptions) {
    this.connection = options.connection;
    this.concurrency = options.concurrency ?? DEFAULT_QUEUE_CONCURRENCY;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.runners = options.runners;
  }

  /** Resets any job left 'running' by an unclean previous shutdown back
   *  to 'queued' (see resetOrphanedRunningJobs), then starts the claim
   *  loop. Returns the number of jobs reset, for the caller to log. */
  async start(): Promise<number> {
    const orphanedCount = await resetOrphanedRunningJobs(this.connection);
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
        const job = await claimNextQueuedJob(this.connection);
        if (!job) break;
        this.activeCount++;
        void this.runJob(job).finally(() => {
          this.activeCount--;
          this.wake?.();
        });
      }
      await this.sleep(this.pollIntervalMs);
    }
  }

  private async runJob(job: JobDocument): Promise<void> {
    const runner = this.runners[job.type];
    try {
      await runner(job, { connection: this.connection, originLock: this.originLock });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await failJob(this.connection, job.jobId, message);
    }
  }
}
