import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cancelJob,
  claimNextQueuedJob,
  completeJob,
  createJob,
  deleteJob,
  failJob,
  getJob,
  listJobs,
  markJobNeedsInput,
  resetOrphanedRunningJobs,
  updateJobProgress,
} from './jobs.js';
import { createJobModel } from './schemas/job.schema.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(scopedMongoTestUri('jobs_queue'));

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

const MINUTE = 60 * 1000;

async function queuedJob(createdAt: Date): Promise<string> {
  const job = await createJob(connection!, {
    type: 'full-audit',
    siteUrl: 'https://example.com/',
    options: {},
  });
  await createJobModel(connection!).updateOne({ jobId: job.jobId }, { $set: { createdAt } });
  return job.jobId;
}

describe.skipIf(!available)('job queue persistence', () => {
  beforeEach(async () => {
    await createJobModel(connection!).deleteMany({});
  });

  describe('deleteJob', () => {
    it('keeps a job the worker claimed when the delete excludes running jobs', async () => {
      const jobId = await queuedJob(new Date('2026-09-01T10:00:00Z'));
      const claimed = await claimNextQueuedJob(connection!, { workerRevision: 'rev-a' });
      expect(claimed?.jobId).toBe(jobId);

      await expect(deleteJob(connection!, jobId, { onlyIfStatusNot: ['running'] })).resolves.toBe(
        false,
      );
      expect(await getJob(connection!, jobId)).not.toBeNull();
    });
  });

  describe('claimNextQueuedJob', () => {
    it('hands parallel claims distinct jobs, oldest first', async () => {
      const oldest = await queuedJob(new Date('2026-09-01T10:00:00Z'));
      const newest = await queuedJob(new Date('2026-09-01T10:02:00Z'));
      const middle = await queuedJob(new Date('2026-09-01T10:01:00Z'));

      const claims = await Promise.all([
        claimNextQueuedJob(connection!, { workerRevision: 'rev-a' }),
        claimNextQueuedJob(connection!, { workerRevision: 'rev-a' }),
        claimNextQueuedJob(connection!, { workerRevision: 'rev-a' }),
        claimNextQueuedJob(connection!, { workerRevision: 'rev-a' }),
      ]);

      const claimedIds = claims.filter((job) => job !== null).map((job) => job.jobId);
      expect(new Set(claimedIds)).toEqual(new Set([oldest, middle, newest]));
      expect(claims.filter((job) => job === null)).toHaveLength(1);

      const stored = await getJob(connection!, oldest);
      expect(stored?.status).toBe('running');
      expect(stored?.workerRevision).toBe('rev-a');
      expect(stored?.lastHeartbeatAt).toBeInstanceOf(Date);
    });

    it('claims in createdAt order one at a time', async () => {
      const second = await queuedJob(new Date('2026-09-01T11:00:00Z'));
      const first = await queuedJob(new Date('2026-09-01T10:00:00Z'));
      expect((await claimNextQueuedJob(connection!))?.jobId).toBe(first);
      expect((await claimNextQueuedJob(connection!))?.jobId).toBe(second);
      expect(await claimNextQueuedJob(connection!)).toBeNull();
    });

    it('claims jobs created in the same millisecond in creation order', async () => {
      const sameInstant = new Date('2026-09-01T22:00:00Z');
      const ids: string[] = [];
      for (let index = 0; index < 5; index++) ids.push(await queuedJob(sameInstant));

      const claimed: (string | undefined)[] = [];
      for (let index = 0; index < 5; index++) {
        claimed.push((await claimNextQueuedJob(connection!))?.jobId);
      }
      expect(claimed).toEqual(ids);
    });

    it('moves on to the next queued job whatever the previous one ended as', async () => {
      const ids: string[] = [];
      for (let index = 0; index < 4; index++) {
        ids.push(await queuedJob(new Date(Date.UTC(2026, 8, 1, 22, index))));
      }
      const first = await claimNextQueuedJob(connection!);
      await failJob(connection!, first!.jobId, 'crawl failed');
      const second = await claimNextQueuedJob(connection!);
      await markJobNeedsInput(
        connection!,
        second!.jobId,
        [{ field: 'raisonSociale', value: 'x' }],
        'needs input',
      );
      const third = await claimNextQueuedJob(connection!);
      await cancelJob(connection!, third!.jobId, 'cancelled by operator');
      const fourth = await claimNextQueuedJob(connection!);

      expect([first, second, third, fourth].map((job) => job?.jobId)).toEqual(ids);
    });

    it('never claims a cancelled job', async () => {
      const jobId = await queuedJob(new Date());
      await cancelJob(connection!, jobId, 'cancelled by operator');
      expect(await claimNextQueuedJob(connection!)).toBeNull();
    });
  });

  describe('resetOrphanedRunningJobs', () => {
    const now = new Date('2026-09-16T12:00:00Z');

    async function runningJob(heartbeat: Date | undefined, startedAt: Date): Promise<string> {
      const jobId = await queuedJob(new Date('2026-09-16T09:00:00Z'));
      await createJobModel(connection!).updateOne(
        { jobId },
        {
          $set: {
            status: 'running',
            startedAt,
            ...(heartbeat !== undefined ? { lastHeartbeatAt: heartbeat } : {}),
          },
        },
      );
      return jobId;
    }

    it('requeues stale jobs and leaves fresh heartbeats alone', async () => {
      const stale = await runningJob(new Date(now.getTime() - 11 * MINUTE), now);
      const fresh = await runningJob(new Date(now.getTime() - MINUTE), now);
      const silentOld = await runningJob(undefined, new Date(now.getTime() - 11 * MINUTE));
      const silentNew = await runningJob(undefined, new Date(now.getTime() - MINUTE));

      expect(await resetOrphanedRunningJobs(connection!, now)).toBe(2);

      const staleDoc = await getJob(connection!, stale);
      expect(staleDoc?.status).toBe('queued');
      expect(staleDoc?.orphaned).toBe(true);
      expect(staleDoc?.startedAt).toBeUndefined();
      expect(staleDoc?.lastHeartbeatAt).toBeUndefined();
      expect((await getJob(connection!, silentOld))?.status).toBe('queued');
      expect((await getJob(connection!, fresh))?.status).toBe('running');
      expect((await getJob(connection!, silentNew))?.status).toBe('running');
    });

    it('requeues every running job when asked to include fresh heartbeats', async () => {
      const fresh = await runningJob(new Date(now.getTime() - MINUTE), now);
      const finished = await queuedJob(new Date());
      await completeJob(connection!, finished);

      expect(
        await resetOrphanedRunningJobs(connection!, now, { includeFreshHeartbeats: true }),
      ).toBe(1);
      expect((await getJob(connection!, fresh))?.status).toBe('queued');
      expect((await getJob(connection!, finished))?.status).toBe('complete');
    });

    it('puts a reset job back at its original queue position', async () => {
      const orphan = await runningJob(undefined, new Date(now.getTime() - 11 * MINUTE));
      await queuedJob(new Date('2026-09-16T10:00:00Z'));
      await resetOrphanedRunningJobs(connection!, now);
      expect((await claimNextQueuedJob(connection!))?.jobId).toBe(orphan);
    });
  });

  describe('updateJobProgress', () => {
    it.each([
      ['complete', (jobId: string) => completeJob(connection!, jobId)],
      ['failed', (jobId: string) => failJob(connection!, jobId, 'boom')],
      [
        'needs-input',
        (jobId: string) =>
          markJobNeedsInput(
            connection!,
            jobId,
            [{ field: 'raisonSociale', value: '' }],
            'needs identity',
          ),
      ],
    ])('does not touch a %s job', async (status, finish) => {
      const jobId = await queuedJob(new Date());
      await finish(jobId);
      const before = await getJob(connection!, jobId);

      await updateJobProgress(connection!, jobId, {
        phase: 'scan',
        progress: { message: 'late write' },
      });

      const after = await getJob(connection!, jobId);
      expect(after?.status).toBe(status);
      expect(after?.phase).toBe(before?.phase);
      expect(after?.progress?.message).toBeUndefined();
      expect(after?.lastHeartbeatAt).toEqual(before?.lastHeartbeatAt);
    });

    it('records progress and a heartbeat on a running job', async () => {
      await queuedJob(new Date());
      const claimed = await claimNextQueuedJob(connection!);
      await updateJobProgress(connection!, claimed!.jobId, {
        phase: 'scan',
        progress: { message: 'scanning' },
      });
      const stored = await getJob(connection!, claimed!.jobId);
      expect(stored?.phase).toBe('scan');
      expect(stored?.progress?.message).toBe('scanning');
    });
  });

  describe('listJobs', () => {
    it('flags only jobs that carry typed input fields as awaiting input (issue #382)', async () => {
      const gated = await queuedJob(new Date('2026-09-16T10:00:00Z'));
      await markJobNeedsInput(
        connection!,
        gated,
        [{ field: 'nomCommercial', value: 'Hotel' }],
        'confirm identity',
      );
      const renderFailure = await queuedJob(new Date('2026-09-16T11:00:00Z'));
      await updateJobProgress(connection!, renderFailure, { auditId: 'audit-render' });
      await failJob(connection!, renderFailure, 'Report generation aborted: render-lint');

      const byId = new Map((await listJobs(connection!)).map((job) => [job.jobId, job]));

      expect(byId.get(gated)).toMatchObject({ status: 'needs-input', awaitsInput: true });
      expect(byId.get(renderFailure)).toMatchObject({ status: 'failed', auditId: 'audit-render' });
      expect(byId.get(renderFailure)?.awaitsInput).toBeUndefined();
    });
  });

  describe('failJob', () => {
    it('keeps the phase that was running when the job failed (issue #386)', async () => {
      const jobId = await queuedJob(new Date('2026-09-17T10:00:00Z'));
      await claimNextQueuedJob(connection!);
      await updateJobProgress(connection!, jobId, { phase: 'report-fr', auditId: 'audit-pdf' });

      await failJob(connection!, jobId, '$not a field path: PDF gate refused');
      await failJob(connection!, jobId, 'second failure report');

      const job = await getJob(connection!, jobId);
      expect(job).toMatchObject({ status: 'failed', phase: 'failed', failedPhase: 'report-fr' });
      expect(job?.error).toBe('second failure report');
      expect((await listJobs(connection!))[0]).toMatchObject({ failedPhase: 'report-fr' });
    });

    it('stores an error text that starts with "$" verbatim', async () => {
      const jobId = await queuedJob(new Date('2026-09-17T10:00:00Z'));
      await failJob(connection!, jobId, '$phase');
      expect(await getJob(connection!, jobId)).toMatchObject({
        error: '$phase',
        failedPhase: 'queued',
      });
    });
  });

  describe('cancelJob', () => {
    it('cancels queued and running jobs', async () => {
      const queued = await queuedJob(new Date('2026-09-16T10:00:00Z'));
      const running = await queuedJob(new Date('2026-09-16T09:00:00Z'));
      await claimNextQueuedJob(connection!);

      expect(await cancelJob(connection!, queued, 'stop')).toBe(true);
      expect(await cancelJob(connection!, running, 'stop')).toBe(true);
      expect((await getJob(connection!, queued))?.status).toBe('cancelled');
      expect((await getJob(connection!, running))?.phase).toBe('cancelled');
    });

    it('refuses a job that already finished and leaves it as it was', async () => {
      const done = await queuedJob(new Date());
      await completeJob(connection!, done);
      const failed = await queuedJob(new Date());
      await failJob(connection!, failed, 'boom');

      expect(await cancelJob(connection!, done, 'stop')).toBe(false);
      expect(await cancelJob(connection!, failed, 'stop')).toBe(false);
      expect(await cancelJob(connection!, 'no-such-job', 'stop')).toBe(false);
      expect((await getJob(connection!, done))?.status).toBe('complete');
      expect((await getJob(connection!, failed))?.error).toBe('boom');
    });

    it('keeps a stopped job cancelled when the runner later reports an outcome', async () => {
      const jobId = await queuedJob(new Date());
      await claimNextQueuedJob(connection!);
      await cancelJob(connection!, jobId, 'stop');
      await completeJob(connection!, jobId);
      await failJob(connection!, jobId, 'boom');
      expect((await getJob(connection!, jobId))?.status).toBe('cancelled');
    });
  });
});
