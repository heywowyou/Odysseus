import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  claimNextQueuedJob: vi.fn(),
  failJob: vi.fn(),
  resetOrphanedRunningJobs: vi.fn(),
}));

import { claimNextQueuedJob, failJob, resetOrphanedRunningJobs } from '@odysseus/store';
import { JobQueue } from './job-queue.js';

const fakeConnection = {} as never;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeJob(overrides: Partial<{ jobId: string; type: 'full-audit' | 'prospecting' }> = {}) {
  return {
    jobId: overrides.jobId ?? 'job-1',
    type: overrides.type ?? 'full-audit',
    status: 'running',
    phase: 'queued',
    options: {},
    createdAt: new Date(),
    progress: {},
  } as never;
}

let queue: JobQueue | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resetOrphanedRunningJobs).mockResolvedValue(0);
  vi.mocked(claimNextQueuedJob).mockResolvedValue(null);
  vi.mocked(failJob).mockResolvedValue(undefined);
});

afterEach(async () => {
  await queue?.stop();
  queue = undefined;
});

describe('JobQueue', () => {
  it('resets orphaned jobs on start and returns the count', async () => {
    vi.mocked(resetOrphanedRunningJobs).mockResolvedValueOnce(3);
    queue = new JobQueue({
      connection: fakeConnection,
      pollIntervalMs: 20,
      runFullAuditJob: vi.fn().mockResolvedValue(undefined),
      runProspectingJob: vi.fn().mockResolvedValue(undefined),
    });

    const orphaned = await queue.start();
    expect(orphaned).toBe(3);
    expect(resetOrphanedRunningJobs).toHaveBeenCalledWith(fakeConnection);
  });

  it('runs a full-audit job with the full-audit runner', async () => {
    const job = fakeJob({ type: 'full-audit' });
    vi.mocked(claimNextQueuedJob).mockResolvedValueOnce(job).mockResolvedValue(null);
    const runFullAuditJob = vi.fn().mockResolvedValue(undefined);
    const runProspectingJob = vi.fn().mockResolvedValue(undefined);

    queue = new JobQueue({ connection: fakeConnection, pollIntervalMs: 20, runFullAuditJob, runProspectingJob });
    await queue.start();
    queue.notify();
    await sleep(50);

    expect(runFullAuditJob).toHaveBeenCalledTimes(1);
    expect(runFullAuditJob).toHaveBeenCalledWith(job, expect.objectContaining({ connection: fakeConnection }));
    expect(runProspectingJob).not.toHaveBeenCalled();
  });

  it('runs a prospecting job with the prospecting runner', async () => {
    const job = fakeJob({ type: 'prospecting' });
    vi.mocked(claimNextQueuedJob).mockResolvedValueOnce(job).mockResolvedValue(null);
    const runFullAuditJob = vi.fn().mockResolvedValue(undefined);
    const runProspectingJob = vi.fn().mockResolvedValue(undefined);

    queue = new JobQueue({ connection: fakeConnection, pollIntervalMs: 20, runFullAuditJob, runProspectingJob });
    await queue.start();
    queue.notify();
    await sleep(50);

    expect(runProspectingJob).toHaveBeenCalledTimes(1);
    expect(runFullAuditJob).not.toHaveBeenCalled();
  });

  it('does not claim a second job until a concurrency=1 slot frees up', async () => {
    const job1 = fakeJob({ jobId: 'job-1' });
    const job2 = fakeJob({ jobId: 'job-2' });
    vi.mocked(claimNextQueuedJob)
      .mockResolvedValueOnce(job1)
      .mockResolvedValueOnce(job2)
      .mockResolvedValue(null);

    let releaseJob1!: () => void;
    const job1Blocked = new Promise<void>((resolve) => {
      releaseJob1 = resolve;
    });
    const runFullAuditJob = vi.fn().mockImplementation(async (job: { jobId: string }) => {
      if (job.jobId === 'job-1') await job1Blocked;
    });

    queue = new JobQueue({
      connection: fakeConnection,
      concurrency: 1,
      pollIntervalMs: 20,
      runFullAuditJob,
      runProspectingJob: vi.fn(),
    });
    await queue.start();
    queue.notify();
    await sleep(50);

    expect(runFullAuditJob).toHaveBeenCalledTimes(1);
    expect(runFullAuditJob).toHaveBeenCalledWith(job1, expect.anything());

    releaseJob1();
    await sleep(80);

    expect(runFullAuditJob).toHaveBeenCalledTimes(2);
    expect(runFullAuditJob).toHaveBeenCalledWith(job2, expect.anything());
  });

  it('marks a job failed when its runner throws', async () => {
    const job = fakeJob({ jobId: 'job-boom' });
    vi.mocked(claimNextQueuedJob).mockResolvedValueOnce(job).mockResolvedValue(null);
    const runFullAuditJob = vi.fn().mockRejectedValue(new Error('boom'));

    queue = new JobQueue({
      connection: fakeConnection,
      pollIntervalMs: 20,
      runFullAuditJob,
      runProspectingJob: vi.fn(),
    });
    await queue.start();
    queue.notify();
    await sleep(50);

    expect(failJob).toHaveBeenCalledWith(fakeConnection, 'job-boom', 'boom');
  });

  it('stops claiming after stop()', async () => {
    queue = new JobQueue({
      connection: fakeConnection,
      pollIntervalMs: 20,
      runFullAuditJob: vi.fn(),
      runProspectingJob: vi.fn(),
    });
    await queue.start();
    await queue.stop();

    const callsAtStop = vi.mocked(claimNextQueuedJob).mock.calls.length;
    await sleep(60);
    expect(vi.mocked(claimNextQueuedJob).mock.calls.length).toBe(callsAtStop);
  });
});
