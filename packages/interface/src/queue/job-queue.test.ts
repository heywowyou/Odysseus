import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  claimNextQueuedJob: vi.fn(),
  failJob: vi.fn(),
  markJobNeedsInput: vi.fn(),
  resetOrphanedRunningJobs: vi.fn(),
  reconcileFailedAuditJobs: vi.fn(),
}));
vi.mock('../logger.js', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  claimNextQueuedJob,
  failJob,
  markJobNeedsInput,
  reconcileFailedAuditJobs,
  resetOrphanedRunningJobs,
} from '@odysseus/store';
import { ReportIdentityUnconfirmedError } from '@odysseus/report';
import { logger } from '../logger.js';
import { JobQueue } from './job-queue.js';

const fakeConnection = {} as never;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, timeoutMs = 1000, intervalMs = 5): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error('waitFor: condition was not met within the timeout');
    }
    await sleep(intervalMs);
  }
}

function fakeJob(
  overrides: Partial<{
    jobId: string;
    type: 'full-audit' | 'prospecting' | 'prospect-ingestion';
  }> = {},
) {
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
  vi.mocked(reconcileFailedAuditJobs).mockResolvedValue(0);
  vi.mocked(claimNextQueuedJob).mockResolvedValue(null);
  vi.mocked(failJob).mockResolvedValue(undefined);
  vi.mocked(markJobNeedsInput).mockResolvedValue(undefined);
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
      runners: {
        'full-audit': vi.fn().mockResolvedValue(undefined),
        prospecting: vi.fn().mockResolvedValue(undefined),
        'prospect-ingestion': vi.fn().mockResolvedValue(undefined),
        'hotel-prescan': vi.fn().mockResolvedValue(undefined),
        'outreach-draft-batch': vi.fn().mockResolvedValue(undefined),
        'outreach-followup-batch': vi.fn().mockResolvedValue(undefined),
      },
    });

    const orphaned = await queue.start();
    expect(orphaned).toBe(3);
    expect(resetOrphanedRunningJobs).toHaveBeenCalledWith(fakeConnection, expect.any(Date), {
      includeFreshHeartbeats: true,
    });
  });

  // Issue #56: a failed full-audit job whose audit was later completed
  // through a path the queue does not run (report regeneration, CLI) must
  // not stay listed as failed forever. The queue reconciles those rows
  // once per start.
  it('reconciles failed jobs against completed audits on start', async () => {
    vi.mocked(reconcileFailedAuditJobs).mockResolvedValueOnce(2);
    queue = new JobQueue({
      connection: fakeConnection,
      pollIntervalMs: 20,
      runners: {
        'full-audit': vi.fn().mockResolvedValue(undefined),
        prospecting: vi.fn().mockResolvedValue(undefined),
        'prospect-ingestion': vi.fn().mockResolvedValue(undefined),
        'hotel-prescan': vi.fn().mockResolvedValue(undefined),
        'outreach-draft-batch': vi.fn().mockResolvedValue(undefined),
        'outreach-followup-batch': vi.fn().mockResolvedValue(undefined),
      },
    });

    await queue.start();
    expect(reconcileFailedAuditJobs).toHaveBeenCalledWith(fakeConnection);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ reconciled: 2 }),
      expect.stringContaining('completed outside the queue'),
    );
  });

  it('still starts the claim loop when the reconciliation pass fails', async () => {
    vi.mocked(reconcileFailedAuditJobs).mockRejectedValueOnce(new Error('mongo hiccup'));
    const job = fakeJob({ jobId: 'job-after-reconcile-error' });
    vi.mocked(claimNextQueuedJob).mockResolvedValueOnce(job).mockResolvedValue(null);
    const runFullAuditJob = vi.fn().mockResolvedValue(undefined);

    queue = new JobQueue({
      connection: fakeConnection,
      pollIntervalMs: 20,
      runners: {
        'full-audit': runFullAuditJob,
        prospecting: vi.fn(),
        'prospect-ingestion': vi.fn(),
        'hotel-prescan': vi.fn(),
        'outreach-draft-batch': vi.fn(),
        'outreach-followup-batch': vi.fn(),
      },
    });
    await queue.start();
    queue.notify();
    await waitFor(() => runFullAuditJob.mock.calls.length >= 1);

    expect(logger.error).toHaveBeenCalled();
    expect(runFullAuditJob).toHaveBeenCalledTimes(1);
  });

  it('runs a full-audit job with the full-audit runner', async () => {
    const job = fakeJob({ type: 'full-audit' });
    vi.mocked(claimNextQueuedJob).mockResolvedValueOnce(job).mockResolvedValue(null);
    const runFullAuditJob = vi.fn().mockResolvedValue(undefined);
    const runProspectingJob = vi.fn().mockResolvedValue(undefined);
    const runProspectIngestionJob = vi.fn().mockResolvedValue(undefined);

    queue = new JobQueue({
      connection: fakeConnection,
      pollIntervalMs: 20,
      runners: {
        'full-audit': runFullAuditJob,
        prospecting: runProspectingJob,
        'prospect-ingestion': runProspectIngestionJob,
        'hotel-prescan': vi.fn().mockResolvedValue(undefined),
        'outreach-draft-batch': vi.fn().mockResolvedValue(undefined),
        'outreach-followup-batch': vi.fn().mockResolvedValue(undefined),
      },
    });
    await queue.start();
    queue.notify();
    await waitFor(() => runFullAuditJob.mock.calls.length >= 1);

    expect(runFullAuditJob).toHaveBeenCalledTimes(1);
    expect(runFullAuditJob).toHaveBeenCalledWith(
      job,
      expect.objectContaining({ connection: fakeConnection }),
    );
    expect(runProspectingJob).not.toHaveBeenCalled();
    expect(runProspectIngestionJob).not.toHaveBeenCalled();
  });

  it('runs a prospecting job with the prospecting runner', async () => {
    const job = fakeJob({ type: 'prospecting' });
    vi.mocked(claimNextQueuedJob).mockResolvedValueOnce(job).mockResolvedValue(null);
    const runFullAuditJob = vi.fn().mockResolvedValue(undefined);
    const runProspectingJob = vi.fn().mockResolvedValue(undefined);
    const runProspectIngestionJob = vi.fn().mockResolvedValue(undefined);

    queue = new JobQueue({
      connection: fakeConnection,
      pollIntervalMs: 20,
      runners: {
        'full-audit': runFullAuditJob,
        prospecting: runProspectingJob,
        'prospect-ingestion': runProspectIngestionJob,
        'hotel-prescan': vi.fn().mockResolvedValue(undefined),
        'outreach-draft-batch': vi.fn().mockResolvedValue(undefined),
        'outreach-followup-batch': vi.fn().mockResolvedValue(undefined),
      },
    });
    await queue.start();
    queue.notify();
    await waitFor(() => runProspectingJob.mock.calls.length >= 1);

    expect(runProspectingJob).toHaveBeenCalledTimes(1);
    expect(runFullAuditJob).not.toHaveBeenCalled();
    expect(runProspectIngestionJob).not.toHaveBeenCalled();
  });

  it('routes a prospect-ingestion job to its own runner, not the prospecting runner', async () => {
    const job = fakeJob({ type: 'prospect-ingestion' });
    vi.mocked(claimNextQueuedJob).mockResolvedValueOnce(job).mockResolvedValue(null);
    const runFullAuditJob = vi.fn().mockResolvedValue(undefined);
    const runProspectingJob = vi.fn().mockResolvedValue(undefined);
    const runProspectIngestionJob = vi.fn().mockResolvedValue(undefined);

    queue = new JobQueue({
      connection: fakeConnection,
      pollIntervalMs: 20,
      runners: {
        'full-audit': runFullAuditJob,
        prospecting: runProspectingJob,
        'prospect-ingestion': runProspectIngestionJob,
        'hotel-prescan': vi.fn().mockResolvedValue(undefined),
        'outreach-draft-batch': vi.fn().mockResolvedValue(undefined),
        'outreach-followup-batch': vi.fn().mockResolvedValue(undefined),
      },
    });
    await queue.start();
    queue.notify();
    await waitFor(() => runProspectIngestionJob.mock.calls.length >= 1);

    expect(runProspectIngestionJob).toHaveBeenCalledTimes(1);
    expect(runProspectIngestionJob).toHaveBeenCalledWith(
      job,
      expect.objectContaining({ connection: fakeConnection }),
    );
    expect(runFullAuditJob).not.toHaveBeenCalled();
    expect(runProspectingJob).not.toHaveBeenCalled();
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
      runners: {
        'full-audit': runFullAuditJob,
        prospecting: vi.fn(),
        'prospect-ingestion': vi.fn(),
        'hotel-prescan': vi.fn(),
        'outreach-draft-batch': vi.fn(),
        'outreach-followup-batch': vi.fn(),
      },
    });
    await queue.start();
    queue.notify();
    await waitFor(() => runFullAuditJob.mock.calls.length >= 1);

    expect(runFullAuditJob).toHaveBeenCalledTimes(1);
    expect(runFullAuditJob).toHaveBeenCalledWith(job1, expect.anything());

    releaseJob1();
    await waitFor(() => runFullAuditJob.mock.calls.length >= 2);

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
      runners: {
        'full-audit': runFullAuditJob,
        prospecting: vi.fn(),
        'prospect-ingestion': vi.fn(),
        'hotel-prescan': vi.fn(),
        'outreach-draft-batch': vi.fn(),
        'outreach-followup-batch': vi.fn(),
      },
    });
    await queue.start();
    queue.notify();
    await waitFor(() => vi.mocked(failJob).mock.calls.length >= 1);

    expect(failJob).toHaveBeenCalledWith(fakeConnection, 'job-boom', 'boom');
  });

  it('marks a job needs-input, not failed, when the report gate throws ReportIdentityUnconfirmedError', async () => {
    const job = fakeJob({ jobId: 'job-needs-input' });
    vi.mocked(claimNextQueuedJob).mockResolvedValueOnce(job).mockResolvedValue(null);
    const fields = [{ field: 'nomCommercial' as const, value: 'Site Officiel' }];
    const runFullAuditJob = vi
      .fn()
      .mockRejectedValue(new ReportIdentityUnconfirmedError(fields, 'confirm the fields'));

    queue = new JobQueue({
      connection: fakeConnection,
      pollIntervalMs: 20,
      runners: {
        'full-audit': runFullAuditJob,
        prospecting: vi.fn(),
        'prospect-ingestion': vi.fn(),
        'hotel-prescan': vi.fn(),
        'outreach-draft-batch': vi.fn(),
        'outreach-followup-batch': vi.fn(),
      },
    });
    await queue.start();
    queue.notify();
    await waitFor(() => vi.mocked(markJobNeedsInput).mock.calls.length >= 1);

    expect(markJobNeedsInput).toHaveBeenCalledWith(
      fakeConnection,
      'job-needs-input',
      fields,
      'confirm the fields',
    );
    expect(failJob).not.toHaveBeenCalled();
  });

  it('keeps polling after claimNextQueuedJob rejects once', async () => {
    const job = fakeJob({ jobId: 'job-after-error' });
    vi.mocked(claimNextQueuedJob)
      .mockRejectedValueOnce(new Error('transient Mongo error'))
      .mockResolvedValueOnce(job)
      .mockResolvedValue(null);
    const runFullAuditJob = vi.fn().mockResolvedValue(undefined);

    queue = new JobQueue({
      connection: fakeConnection,
      pollIntervalMs: 20,
      runners: {
        'full-audit': runFullAuditJob,
        prospecting: vi.fn(),
        'prospect-ingestion': vi.fn(),
        'hotel-prescan': vi.fn(),
        'outreach-draft-batch': vi.fn(),
        'outreach-followup-batch': vi.fn(),
      },
    });
    await queue.start();
    queue.notify();
    await waitFor(() => runFullAuditJob.mock.calls.length >= 1);

    expect(logger.error).toHaveBeenCalled();
    expect(runFullAuditJob).toHaveBeenCalledTimes(1);
    expect(runFullAuditJob).toHaveBeenCalledWith(job, expect.anything());
  });

  it('stops claiming after stop()', async () => {
    queue = new JobQueue({
      connection: fakeConnection,
      pollIntervalMs: 20,
      runners: {
        'full-audit': vi.fn(),
        prospecting: vi.fn(),
        'prospect-ingestion': vi.fn(),
        'hotel-prescan': vi.fn(),
        'outreach-draft-batch': vi.fn(),
        'outreach-followup-batch': vi.fn(),
      },
    });
    await queue.start();
    await queue.stop();

    const callsAtStop = vi.mocked(claimNextQueuedJob).mock.calls.length;
    await sleep(60);
    expect(vi.mocked(claimNextQueuedJob).mock.calls.length).toBe(callsAtStop);
  });
});
