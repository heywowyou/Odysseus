import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { backfillQueueOrder, readScanQueue, reorderScanQueue } from './job-queue-order.js';
import {
  cancelJob,
  claimNextQueuedJob,
  createJob,
  getJob,
  resetOrphanedRunningJobs,
} from './jobs.js';
import { createJobModel } from './schemas/job.schema.js';
import { createJobQueueStateModel } from './schemas/job-queue-state.schema.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('job_queue_order'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

async function enqueue(site: string): Promise<string> {
  const job = await createJob(connection!, {
    type: 'full-audit',
    siteUrl: `https://${site}/`,
    options: {},
  });
  return job.jobId;
}

async function queuedIds(): Promise<string[]> {
  return (await readScanQueue(connection!)).jobs.map((job) => job.jobId);
}

describe.skipIf(!available)('durable scan queue order', () => {
  beforeEach(async () => {
    await createJobModel(connection!).deleteMany({});
    await createJobQueueStateModel(connection!).deleteMany({});
  });

  it('gives each enqueued job a unique increasing position, also under concurrent inserts', async () => {
    const ids = await Promise.all(
      Array.from({ length: 12 }, (_, index) => enqueue(`site-${index}.example`)),
    );
    const orders = await Promise.all(
      ids.map(async (jobId) => (await getJob(connection!, jobId))!.queueOrder),
    );
    expect(orders.every((order) => typeof order === 'number')).toBe(true);
    expect(new Set(orders).size).toBe(ids.length);
  });

  it('keeps a batch in reviewed order and claims it in that order', async () => {
    const ids: string[] = [];
    for (const site of ['c.example', 'a.example', 'b.example']) ids.push(await enqueue(site));
    expect(await queuedIds()).toEqual(ids);
    const claimed: (string | undefined)[] = [];
    for (let index = 0; index < 3; index++) {
      claimed.push((await claimNextQueuedJob(connection!))?.jobId);
    }
    expect(claimed).toEqual(ids);
  });

  it('returns a job requeued by restart recovery to its original place', async () => {
    const first = await enqueue('first.example');
    const second = await enqueue('second.example');
    expect((await claimNextQueuedJob(connection!))?.jobId).toBe(first);
    await resetOrphanedRunningJobs(connection!, new Date(), { includeFreshHeartbeats: true });
    expect(await queuedIds()).toEqual([first, second]);
  });

  it('backfills legacy queued rows in createdAt order, behind nothing it did not know', async () => {
    const JobModel = createJobModel(connection!);
    const later = await enqueue('later.example');
    const earlier = await enqueue('earlier.example');
    await JobModel.updateOne(
      { jobId: later },
      { $unset: { queueOrder: '' }, $set: { createdAt: new Date('2026-09-01T11:00:00Z') } },
    );
    await JobModel.updateOne(
      { jobId: earlier },
      { $unset: { queueOrder: '' }, $set: { createdAt: new Date('2026-09-01T10:00:00Z') } },
    );
    expect(await backfillQueueOrder(connection!)).toBe(2);
    expect(await backfillQueueOrder(connection!)).toBe(0);
    expect(await queuedIds()).toEqual([earlier, later]);
  });

  it('applies a reorder against the current revision and claims in the new order', async () => {
    const [a, b, c] = [
      await enqueue('a.example'),
      await enqueue('b.example'),
      await enqueue('c.example'),
    ];
    const before = await readScanQueue(connection!);
    const result = await reorderScanQueue(connection!, {
      expectedRevision: before.queueRevision,
      orderedJobIds: [c, a, b],
    });
    expect(result.outcome).toBe('reordered');
    expect(result.snapshot.jobs.map((job) => job.jobId)).toEqual([c, a, b]);
    expect(result.snapshot.queueRevision).not.toBe(before.queueRevision);
    expect((await claimNextQueuedJob(connection!))?.jobId).toBe(c);
  });

  it('lets exactly one of two tabs reordering the same revision win', async () => {
    const [a, b, c] = [
      await enqueue('a.example'),
      await enqueue('b.example'),
      await enqueue('c.example'),
    ];
    const { queueRevision } = await readScanQueue(connection!);
    const results = await Promise.all([
      reorderScanQueue(connection!, { expectedRevision: queueRevision, orderedJobIds: [c, b, a] }),
      reorderScanQueue(connection!, { expectedRevision: queueRevision, orderedJobIds: [b, a, c] }),
    ]);
    const outcomes = results.map((result) => result.outcome).sort();
    expect(outcomes).toEqual(['reordered', 'state-changed']);
    const winner = results.find((result) => result.outcome === 'reordered')!;
    expect(await queuedIds()).toEqual(winner.snapshot.jobs.map((job) => job.jobId));
  });

  it('refuses a stale revision after membership changed', async () => {
    const a = await enqueue('a.example');
    const b = await enqueue('b.example');
    const { queueRevision } = await readScanQueue(connection!);
    await cancelJob(connection!, a, 'removed from queue');
    const result = await reorderScanQueue(connection!, {
      expectedRevision: queueRevision,
      orderedJobIds: [b, a],
    });
    expect(result.outcome).toBe('state-changed');
    expect(result.snapshot.jobs.map((job) => job.jobId)).toEqual([b]);
  });

  it('refuses an order that is not a permutation of the queued jobs', async () => {
    const a = await enqueue('a.example');
    const b = await enqueue('b.example');
    const { queueRevision } = await readScanQueue(connection!);
    for (const orderedJobIds of [[a], [a, a], [a, b, 'unknown'], [a, 'unknown']]) {
      const result = await reorderScanQueue(connection!, {
        expectedRevision: queueRevision,
        orderedJobIds,
      });
      expect(result.outcome).toBe('invalid-order');
    }
    expect(await queuedIds()).toEqual([a, b]);
  });

  it('never re-queues a job claimed after the reorder check', async () => {
    const a = await enqueue('a.example');
    const b = await enqueue('b.example');
    const { queueRevision } = await readScanQueue(connection!);
    const [claimed, result] = await Promise.all([
      claimNextQueuedJob(connection!),
      reorderScanQueue(connection!, { expectedRevision: queueRevision, orderedJobIds: [b, a] }),
    ]);
    expect(claimed).not.toBeNull();
    expect((await getJob(connection!, claimed!.jobId))?.status).toBe('running');
    expect(['reordered', 'state-changed']).toContain(result.outcome);
  });

  it('keeps a job enqueued during a reorder at the back', async () => {
    const a = await enqueue('a.example');
    const b = await enqueue('b.example');
    const { queueRevision } = await readScanQueue(connection!);
    const [late, result] = await Promise.all([
      enqueue('late.example'),
      reorderScanQueue(connection!, { expectedRevision: queueRevision, orderedJobIds: [b, a] }),
    ]);
    const ids = await queuedIds();
    expect(ids.at(-1)).toBe(late);
    if (result.outcome === 'reordered') expect(ids.slice(0, 2)).toEqual([b, a]);
  });
});
