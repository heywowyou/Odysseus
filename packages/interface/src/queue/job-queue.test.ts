import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  backfillQueueOrder: vi.fn().mockResolvedValue(0),
  cancelJob: vi.fn(),
  claimNextQueuedJob: vi.fn(),
  failJob: vi.fn(),
  markJobNeedsInput: vi.fn(),
  reconcileFailedAuditJobs: vi.fn(),
  resetOrphanedRunningJobs: vi.fn(),
  settleCancelRequestedJobsOnStartup: vi.fn(),
}));
vi.mock('@odysseus/scanner', () => ({
  OriginLock: class {},
  readOdysseusBuildId: () => 'test-build',
  StaleAcquisitionLeaseError: class extends Error {},
}));
vi.mock('@odysseus/report', () => ({
  ReportIdentityUnconfirmedError: class extends Error {
    constructor(
      readonly fields: unknown[],
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock('../telemetry/job-telemetry.js', () => ({ captureJobTelemetry: vi.fn() }));
vi.mock('../logger.js', () => {
  const log = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), child: () => log };
  return { logger: log };
});

import {
  cancelJob,
  claimNextQueuedJob,
  failJob,
  markJobNeedsInput,
  reconcileFailedAuditJobs,
  resetOrphanedRunningJobs,
  settleCancelRequestedJobsOnStartup,
  type JobDocument,
  type JobType,
} from '@odysseus/store';
import { ReportIdentityUnconfirmedError } from '@odysseus/report';
import { StaleAcquisitionLeaseError } from '@odysseus/scanner';
import { captureJobTelemetry } from '../telemetry/job-telemetry.js';
import { JobCancelledError } from './cancellation.js';
import { JobQueue, type PipelineFn } from './job-queue.js';

const connection = {} as never;

function job(jobId: string): JobDocument {
  return {
    jobId,
    type: 'full-audit',
    status: 'running',
    phase: 'queued',
    options: {},
    createdAt: new Date(),
    progress: {},
  } as JobDocument;
}

function queueWith(runner: PipelineFn): JobQueue {
  const runners = new Proxy({} as Record<JobType, PipelineFn>, { get: () => runner });
  return new JobQueue({ connection, concurrency: 1, pollIntervalMs: 5, runners });
}

let queue: JobQueue | undefined;

beforeEach(() => {
  vi.mocked(resetOrphanedRunningJobs).mockResolvedValue(0);
  vi.mocked(settleCancelRequestedJobsOnStartup).mockResolvedValue(0);
  vi.mocked(reconcileFailedAuditJobs).mockResolvedValue(0);
});

afterEach(async () => {
  await queue?.stop();
  queue = undefined;
  vi.clearAllMocks();
});

async function runOne(runner: PipelineFn, jobId = 'job-1'): Promise<void> {
  vi.mocked(claimNextQueuedJob).mockResolvedValueOnce(job(jobId)).mockResolvedValue(null);
  queue = queueWith(runner);
  await queue.start();
  await vi.waitFor(() => {
    expect(queue!.isJobInFlight(jobId)).toBe(false);
    expect(runner).toHaveBeenCalled();
  });
}

describe('JobQueue', () => {
  it('requeues every running job, fresh heartbeats included, on start', async () => {
    vi.mocked(claimNextQueuedJob).mockResolvedValue(null);
    vi.mocked(resetOrphanedRunningJobs).mockResolvedValue(2);
    queue = queueWith(vi.fn());
    expect(await queue.start()).toBe(2);
    expect(settleCancelRequestedJobsOnStartup).toHaveBeenCalledWith(connection);
    expect(resetOrphanedRunningJobs).toHaveBeenCalledWith(connection, expect.any(Date), {
      includeFreshHeartbeats: true,
    });
  });

  it('starts even when cancellation recovery throws', async () => {
    vi.mocked(claimNextQueuedJob).mockResolvedValue(null);
    vi.mocked(settleCancelRequestedJobsOnStartup).mockRejectedValue(new Error('store unavailable'));
    queue = queueWith(vi.fn());
    await queue.start();
    expect(queue.isReady()).toBe(true);
  });

  it('starts even when failed-job reconciliation throws', async () => {
    vi.mocked(claimNextQueuedJob).mockResolvedValue(null);
    vi.mocked(reconcileFailedAuditJobs).mockRejectedValue(new Error('mongo hiccup'));
    queue = queueWith(vi.fn());
    await queue.start();
    expect(queue.isReady()).toBe(true);
  });

  it('records a stopped run as cancelled, never as failed', async () => {
    const runner = vi.fn(async (current: JobDocument) => {
      throw new JobCancelledError(current.jobId);
    });
    await runOne(runner);
    expect(cancelJob).toHaveBeenCalledWith(connection, 'job-1', 'cancelled by operator');
    expect(failJob).not.toHaveBeenCalled();
    expect(markJobNeedsInput).not.toHaveBeenCalled();
  });

  it('records an identity-confirmation stop as needs-input with its fields', async () => {
    const fields = [{ field: 'raisonSociale', value: '' }];
    const runner = vi.fn(async () => {
      throw new ReportIdentityUnconfirmedError(fields as never, 'confirm identity');
    });
    await runOne(runner);
    expect(markJobNeedsInput).toHaveBeenCalledWith(connection, 'job-1', fields, 'confirm identity');
    expect(failJob).not.toHaveBeenCalled();
    expect(cancelJob).not.toHaveBeenCalled();
  });

  it('leaves a job to its new claim when the runner was superseded', async () => {
    const runner = vi.fn(async () => {
      throw new StaleAcquisitionLeaseError('lease moved');
    });
    await runOne(runner);
    expect(failJob).not.toHaveBeenCalled();
    expect(cancelJob).not.toHaveBeenCalled();
    expect(markJobNeedsInput).not.toHaveBeenCalled();
    expect(captureJobTelemetry).not.toHaveBeenCalled();
  });

  it('records any other error as a failure with telemetry', async () => {
    const runner = vi.fn(async () => {
      throw new Error('crawler exploded');
    });
    await runOne(runner);
    expect(failJob).toHaveBeenCalledWith(connection, 'job-1', 'crawler exploded');
    expect(captureJobTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'job-failed', jobId: 'job-1' }),
    );
    expect(cancelJob).not.toHaveBeenCalled();
  });

  it('writes no terminal state itself when the runner succeeds', async () => {
    await runOne(vi.fn(async () => {}));
    expect(failJob).not.toHaveBeenCalled();
    expect(cancelJob).not.toHaveBeenCalled();
    expect(markJobNeedsInput).not.toHaveBeenCalled();
  });

  it('reports a job in flight while its runner is still working after a stop', async () => {
    let release!: () => void;
    const runner = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    vi.mocked(claimNextQueuedJob).mockResolvedValueOnce(job('job-2')).mockResolvedValue(null);
    queue = queueWith(runner);
    await queue.start();
    await vi.waitFor(() => expect(runner).toHaveBeenCalled());

    queue.requestCancel('job-2');
    expect(queue.isJobInFlight('job-2')).toBe(true);
    release();
    await vi.waitFor(() => expect(queue!.isJobInFlight('job-2')).toBe(false));
  });

  it('keeps claiming work after a terminal-state write fails', async () => {
    vi.mocked(failJob).mockRejectedValueOnce(new Error('store outage'));
    const runner = vi.fn(async () => {
      throw new Error('boom');
    });
    vi.mocked(claimNextQueuedJob)
      .mockResolvedValueOnce(job('job-a'))
      .mockResolvedValueOnce(job('job-b'))
      .mockResolvedValue(null);
    queue = queueWith(runner);
    await queue.start();
    await vi.waitFor(() => expect(failJob).toHaveBeenCalledTimes(2));
    expect(vi.mocked(failJob).mock.calls.map((call) => call[1])).toEqual(['job-a', 'job-b']);
  });
});
