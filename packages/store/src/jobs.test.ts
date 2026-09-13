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
  markJobNeedsInput,
  ORPHANED_JOB_TIMEOUT_MS,
  resetOrphanedRunningJobs,
  updateJobProgress,
} from './jobs.js';
import { createJobModel } from './schemas/job.schema.js';
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

  it('persists the approved candidate scope of a limit-bound prescan job', async () => {
    const job = await createJob(connection!, {
      type: 'hotel-prescan',
      options: {
        resolutionVersion: 'rv1',
        qualificationVersion: 'qv1',
        prescanVersion: 'pv1',
        maxPages: 2,
        prescanCandidateIds: ['candidate-a', 'candidate-b'],
      },
    });

    expect((await getJob(connection!, job.jobId))?.options.prescanCandidateIds).toEqual([
      'candidate-a',
      'candidate-b',
    ]);
    await completeJob(connection!, job.jobId);
  });

  // Issue #202: Mongoose defaults an unset array-typed path to [], so a
  // domain-scoped prescan job (which deliberately carries no candidate list)
  // persisted one anyway. The runner read it back, scoped its query to
  // `candidateId: { $in: [] }`, matched nothing, and completed in under a
  // second reporting "0 hotels prescanned, 0 failed" with no error. The
  // distinction this asserts is between an absent scope and an empty one.
  it('leaves an unset prescan candidate scope absent rather than storing an empty list', async () => {
    const job = await createJob(connection!, {
      type: 'hotel-prescan',
      options: {
        resolutionVersion: 'rv1',
        qualificationVersion: 'qv1',
        prescanVersion: 'pv1',
        domain: 'hotel.example',
        maxPages: 1,
      },
    });

    expect((await getJob(connection!, job.jobId))?.options.prescanCandidateIds).toBeUndefined();
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

  it('stamps the claiming worker revision when provided, and omits it otherwise', async () => {
    const withRevision = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://revision-a.example/',
      options: {},
    });
    const claimed = await claimNextQueuedJob(connection!, { workerRevision: 'deadbee' });
    expect(claimed?.jobId).toBe(withRevision.jobId);
    expect(claimed?.workerRevision).toBe('deadbee');

    const withoutRevision = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://revision-b.example/',
      options: {},
    });
    const claimedWithout = await claimNextQueuedJob(connection!);
    expect(claimedWithout?.jobId).toBe(withoutRevision.jobId);
    expect(claimedWithout?.workerRevision).toBeUndefined();
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

  it('updateJobProgress cannot regress a completed job or refresh its heartbeat', async () => {
    // A fire-and-forget progress write from a straggler runner can land
    // after completeJob; it must not flip the finished row back to a mid
    // pipeline phase or make an ended job look alive again.
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://progress-immunity-complete.example/',
      options: {},
    });
    await claimNextQueuedJob(connection!);
    await completeJob(connection!, job.jobId);

    const finished = await getJob(connection!, job.jobId);
    expect(finished?.status).toBe('complete');

    await updateJobProgress(connection!, job.jobId, {
      phase: 'crawl',
      progress: { crawl: { visited: 1, target: 2, effectiveDelayMs: 0 } },
    });

    const after = await getJob(connection!, job.jobId);
    expect(after?.status).toBe('complete');
    expect(after?.phase).toBe('complete');
    expect(after?.progress.crawl).toBeUndefined();
    expect(after?.lastHeartbeatAt).toEqual(finished?.lastHeartbeatAt);
  });

  it('updateJobProgress cannot regress a needs-input job or refresh its heartbeat', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://progress-immunity-needs-input.example/',
      options: {},
    });
    await claimNextQueuedJob(connection!);
    await markJobNeedsInput(
      connection!,
      job.jobId,
      [{ field: 'nomCommercial', value: '' }],
      'awaiting operator',
    );

    const staged = await getJob(connection!, job.jobId);
    expect(staged?.status).toBe('needs-input');

    await updateJobProgress(connection!, job.jobId, {
      phase: 'crawl',
      progress: { crawl: { visited: 1, target: 2, effectiveDelayMs: 0 } },
    });

    const after = await getJob(connection!, job.jobId);
    expect(after?.status).toBe('needs-input');
    expect(after?.phase).toBe('needs-input');
    expect(after?.progress.crawl).toBeUndefined();
    expect(after?.lastHeartbeatAt).toEqual(staged?.lastHeartbeatAt);
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

  it('listJobs keeps the summary fields and projects away the heavy result arrays', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://projection.example/',
      options: {},
    });
    await createJobModel(connection!).updateOne(
      { jobId: job.jobId },
      { $set: { urlResults: [{ url: 'https://projection.example/page', status: 'complete' }] } },
    );

    const rows = await listJobs(connection!, 10);
    const row = rows.find((candidate) => candidate.jobId === job.jobId);
    expect(row).toBeDefined();
    expect(row?.status).toBe('queued');
    expect(row?.siteUrl).toBe('https://projection.example/');
    expect(row?.createdAt).toBeInstanceOf(Date);
    // The dashboard poll maps only the summary fields, so the per-page and
    // per-batch arrays travel through every 5-second response for nothing.
    expect(row).not.toHaveProperty('urlResults');
    expect(row).not.toHaveProperty('ingestionResults');
    expect(row).not.toHaveProperty('outreachBatchResults');

    await completeJob(connection!, job.jobId);
  });

  it('resetOrphanedRunningJobs leaves a fresh job running and requeues a stale one, preserving createdAt', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://f.example/',
      options: {},
    });
    const claimedAt = new Date();
    await createJobModel(connection!).updateOne(
      { jobId: job.jobId },
      { $set: { status: 'running', startedAt: claimedAt, lastHeartbeatAt: claimedAt } },
    );

    const before = await getJob(connection!, job.jobId);
    const freshNow = new Date(claimedAt.getTime() + ORPHANED_JOB_TIMEOUT_MS - 1000);
    await resetOrphanedRunningJobs(connection!, freshNow);

    const stillRunning = await getJob(connection!, job.jobId);
    expect(stillRunning?.status).toBe('running');

    const resetCount = await resetOrphanedRunningJobs(
      connection!,
      new Date(freshNow.getTime() + 2000),
    );
    expect(resetCount).toBeGreaterThanOrEqual(1);

    const after = await getJob(connection!, job.jobId);
    expect(after?.status).toBe('queued');
    expect(after?.orphaned).toBe(true);
    expect(new Date(after!.createdAt).getTime()).toBe(new Date(before!.createdAt).getTime());
  });

  it('resetOrphanedRunningJobs with includeFreshHeartbeats requeues a fresh-heartbeat running job (#124)', async () => {
    // Production is a single app container: after a fast bounce the fresh
    // container sees a heartbeat written seconds before by the container
    // that no longer exists, so the default staleness guard would leave
    // the job 'running' forever.
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://orphan-fresh.example/',
      options: {},
    });
    const claimedAt = new Date();
    await createJobModel(connection!).updateOne(
      { jobId: job.jobId },
      { $set: { status: 'running', startedAt: claimedAt, lastHeartbeatAt: claimedAt } },
    );

    const before = await getJob(connection!, job.jobId);
    const resetCount = await resetOrphanedRunningJobs(connection!, new Date(), {
      includeFreshHeartbeats: true,
    });
    expect(resetCount).toBeGreaterThanOrEqual(1);

    const after = await getJob(connection!, job.jobId);
    expect(after?.status).toBe('queued');
    expect(after?.orphaned).toBe(true);
    expect(after?.startedAt).toBeUndefined();
    expect(after?.lastHeartbeatAt).toBeUndefined();
    expect(new Date(after!.createdAt).getTime()).toBe(new Date(before!.createdAt).getTime());
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
