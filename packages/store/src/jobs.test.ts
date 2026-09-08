import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cancelJob,
  cancelQueuedJobs,
  claimNextQueuedJob,
  completeJob,
  createJob,
  deleteJob,
  failJob,
  getJob,
  listJobs,
  ORPHANED_JOB_TIMEOUT_MS,
  resetOrphanedRunningJobs,
  updateJobProgress,
} from './jobs.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

// No dropDatabase here: persist-audit.test.ts already owns dropping the
// shared odysseus_test database in its afterAll. A second concurrent
// dropper races against other Docker-gated test files still mid-run
// against the same database. Unique jobIds (randomUUID) and per-test
// auditId/dedupeKey values keep this file's assertions valid without
// needing exclusive ownership of the database's lifecycle.
afterAll(async () => {
  if (connection) await connection.close();
});

/** Drains every currently-queued job by claiming and completing it, so
 *  ordering-sensitive assertions ("claims the *oldest* queued job") are
 *  never defeated by a leftover queued document from an earlier test run
 *  against this same shared, never-dropped database. */
async function drainQueue(): Promise<void> {
  for (;;) {
    const job = await claimNextQueuedJob(connection!);
    if (!job) return;
    await completeJob(connection!, job.jobId);
  }
}

beforeAll(async () => {
  if (mongoAvailable) await drainQueue();
});

describe.skipIf(!mongoAvailable)('jobs', () => {
  it('creates a job with a generated jobId, queued status and phase', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://example.com/',
      options: { maxPages: 5 },
    });

    expect(job.jobId).toBeTruthy();
    expect(job.status).toBe('queued');
    expect(job.phase).toBe('queued');
    expect(job.siteUrl).toBe('https://example.com/');

    const fetched = await getJob(connection!, job.jobId);
    expect(fetched?.jobId).toBe(job.jobId);

    // Leaves nothing queued behind: later tests in this file assert
    // exact FIFO ordering among jobs they create themselves.
    await completeJob(connection!, job.jobId);
  });

  it('claims the oldest queued job atomically and marks it running', async () => {
    const first = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://a.example/',
      options: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://b.example/',
      options: {},
    });

    const claimed = await claimNextQueuedJob(connection!);
    expect(claimed?.jobId).toBe(first.jobId);
    expect(claimed?.status).toBe('running');
    expect(claimed?.startedAt).toBeInstanceOf(Date);
    expect(claimed?.lastHeartbeatAt).toBeInstanceOf(Date);

    const stored = await getJob(connection!, first.jobId);
    expect(stored?.status).toBe('running');
  });

  it('updates phase and progress fields independently', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://c.example/',
      options: {},
    });

    await updateJobProgress(connection!, job.jobId, {
      phase: 'crawl',
      progress: { crawl: { visited: 2, target: 10, effectiveDelayMs: 1000, etaMs: 8000 } },
    });

    const stored = await getJob(connection!, job.jobId);
    expect(stored?.phase).toBe('crawl');
    expect(stored?.progress.crawl).toEqual({
      visited: 2,
      target: 10,
      effectiveDelayMs: 1000,
      etaMs: 8000,
    });

    await updateJobProgress(connection!, job.jobId, {
      phase: 'lighthouse',
      progress: {
        contentScan: { completed: 10, target: 10, etaMs: 0 },
        lighthouse: { completed: 2, target: 3, etaMs: 5000 },
        continuationGuard: { omittedUrlCount: 4, omittedFamilyCount: 1 },
      },
    });

    const staged = await getJob(connection!, job.jobId);
    expect(staged?.phase).toBe('lighthouse');
    expect(staged?.progress.contentScan).toEqual({ completed: 10, target: 10, etaMs: 0 });
    expect(staged?.progress.lighthouse).toEqual({ completed: 2, target: 3, etaMs: 5000 });
    expect(staged?.progress.continuationGuard).toEqual({
      omittedUrlCount: 4,
      omittedFamilyCount: 1,
    });
  });

  it('completeJob sets status, phase, finishedAt and the auditId patch', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://d.example/',
      options: {},
    });
    await completeJob(connection!, job.jobId, { auditId: 'audit-123' });

    const stored = await getJob(connection!, job.jobId);
    expect(stored?.status).toBe('complete');
    expect(stored?.phase).toBe('complete');
    expect(stored?.finishedAt).toBeInstanceOf(Date);
    expect(stored?.auditId).toBe('audit-123');
  });

  it('keeps a job auditId set via updateJobProgress after a later failJob (#35)', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://f.example/',
      options: {},
    });

    await updateJobProgress(connection!, job.jobId, {
      phase: 'analyze-fr',
      auditId: 'audit-orphan-guard',
    });
    await failJob(connection!, job.jobId, 'report generation aborted');

    const stored = await getJob(connection!, job.jobId);
    expect(stored?.status).toBe('failed');
    expect(stored?.auditId).toBe('audit-orphan-guard');
  });

  it('failJob sets status, phase, finishedAt and the error message', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://e.example/',
      options: {},
    });
    await failJob(connection!, job.jobId, 'boom');

    const stored = await getJob(connection!, job.jobId);
    expect(stored?.status).toBe('failed');
    expect(stored?.phase).toBe('failed');
    expect(stored?.error).toBe('boom');
  });

  it('listJobs returns jobs newest first', async () => {
    const jobs = await listJobs(connection!, 500);
    const createdAts = jobs.map((j) => new Date(j.createdAt).getTime());
    const sorted = [...createdAts].sort((a, b) => b - a);
    expect(createdAts).toEqual(sorted);
  });

  it('resetOrphanedRunningJobs leaves a fresh job running and requeues a stale one, preserving createdAt', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://f.example/',
      options: {},
    });
    const claimed = await claimNextQueuedJob(connection!);
    // Drain any other queued jobs left by earlier tests so `claimed` is deterministic.
    expect(claimed?.status).toBe('running');

    const before = await getJob(connection!, claimed!.jobId);
    const freshNow = new Date(Date.now() + ORPHANED_JOB_TIMEOUT_MS - 1);
    await resetOrphanedRunningJobs(connection!, freshNow);

    const stillRunning = await getJob(connection!, claimed!.jobId);
    expect(stillRunning?.status).toBe('running');

    const resetCount = await resetOrphanedRunningJobs(
      connection!,
      new Date(freshNow.getTime() + 2),
    );
    expect(resetCount).toBeGreaterThanOrEqual(1);

    const after = await getJob(connection!, claimed!.jobId);
    expect(after?.status).toBe('queued');
    expect(after?.orphaned).toBe(true);
    expect(new Date(after!.createdAt).getTime()).toBe(new Date(before!.createdAt).getTime());
    void job;
  });

  it('cancelJob cancels a queued job so the claim filter never picks it up', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://g.example/',
      options: {},
    });

    const cancelled = await cancelJob(connection!, job.jobId, 'cancelled by operator');
    expect(cancelled).toBe(true);

    const stored = await getJob(connection!, job.jobId);
    expect(stored?.status).toBe('cancelled');
    expect(stored?.phase).toBe('cancelled');
    expect(stored?.finishedAt).toBeInstanceOf(Date);
    expect(stored?.error).toBe('cancelled by operator');

    // The cancelled job must never be claimable again, whatever else is
    // queued beside it: drain the queue and watch for its jobId.
    for (;;) {
      const claimed = await claimNextQueuedJob(connection!);
      if (!claimed) break;
      expect(claimed.jobId).not.toBe(job.jobId);
      await completeJob(connection!, claimed.jobId);
    }
    const requeued = await getJob(connection!, job.jobId);
    expect(requeued?.status).toBe('cancelled');
  });

  it('cancelJob reports false on an already terminal job instead of overwriting it', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://h.example/',
      options: {},
    });
    await completeJob(connection!, job.jobId);

    const cancelled = await cancelJob(connection!, job.jobId, 'late stop request');
    expect(cancelled).toBe(false);

    const stored = await getJob(connection!, job.jobId);
    expect(stored?.status).toBe('complete');
  });

  it('keeps an operator-cancelled job terminal when its old runner later finishes', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://completion-race.example/',
      options: {},
    });

    await cancelJob(connection!, job.jobId, 'cancelled by operator');
    await completeJob(connection!, job.jobId);
    await failJob(connection!, job.jobId, 'late worker error');

    const stored = await getJob(connection!, job.jobId);
    expect(stored?.status).toBe('cancelled');
    expect(stored?.phase).toBe('cancelled');
  });

  it('cancelJob cancels a running job (the runner notices through the registry)', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://i.example/',
      options: {},
    });
    await claimNextQueuedJob(connection!);

    const cancelled = await cancelJob(connection!, job.jobId, 'cancelled by operator');
    expect(cancelled).toBe(true);

    const stored = await getJob(connection!, job.jobId);
    expect(stored?.status).toBe('cancelled');
  });

  it('cancelQueuedJobs cancels every queued job and leaves running ones alone', async () => {
    // The running job must genuinely be running before the clear: it is
    // created first and claimed while it is the only queued document, so
    // the claim cannot hit one of the queued jobs created below.
    const running = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://l.example/',
      options: {},
    });
    const claimed = await claimNextQueuedJob(connection!);
    expect(claimed?.jobId).toBe(running.jobId);

    const queuedA = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://j.example/',
      options: {},
    });
    const queuedB = await createJob(connection!, {
      type: 'prospecting',
      urls: ['https://k.example/'],
      options: {},
    });

    const clearedCount = await cancelQueuedJobs(connection!, 'queue cleared by operator');
    expect(clearedCount).toBeGreaterThanOrEqual(2);

    expect((await getJob(connection!, queuedA.jobId))?.status).toBe('cancelled');
    expect((await getJob(connection!, queuedB.jobId))?.status).toBe('cancelled');
    // The running job keeps its status: a stop request for it goes through
    // cancelJob, which matches queued-or-running documents.
    expect((await getJob(connection!, running.jobId))?.status).toBe('running');
    await completeJob(connection!, running.jobId);
  });

  it('deleteJob removes the document and reports whether it existed', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://m.example/',
      options: {},
    });
    expect(await deleteJob(connection!, job.jobId)).toBe(true);
    expect(await getJob(connection!, job.jobId)).toBeNull();
    expect(await deleteJob(connection!, job.jobId)).toBe(false);
  });
});
