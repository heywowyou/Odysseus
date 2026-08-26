import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  claimNextQueuedJob,
  completeJob,
  createJob,
  failJob,
  getJob,
  listJobs,
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

  it('resetOrphanedRunningJobs requeues running jobs, preserving createdAt', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://f.example/',
      options: {},
    });
    const claimed = await claimNextQueuedJob(connection!);
    // Drain any other queued jobs left by earlier tests so `claimed` is deterministic.
    expect(claimed?.status).toBe('running');

    const before = await getJob(connection!, claimed!.jobId);
    const resetCount = await resetOrphanedRunningJobs(connection!);
    expect(resetCount).toBeGreaterThanOrEqual(1);

    const after = await getJob(connection!, claimed!.jobId);
    expect(after?.status).toBe('queued');
    expect(after?.orphaned).toBe(true);
    expect(new Date(after!.createdAt).getTime()).toBe(new Date(before!.createdAt).getTime());
    void job;
  });
});
