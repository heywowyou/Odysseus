/**
 * Durable scan-queue order and the race-safe operator reorder (plan 061 §6).
 *
 * Only `queued` jobs take part. Their order is the ascending `queueOrder`
 * (then `_id`, a deterministic tie-break that only a legacy row can need),
 * which survives restart and deploy. A reorder permutes the existing
 * `queueOrder` values among the queued jobs it names, so it never rewrites
 * history rows and a job enqueued meanwhile keeps its place at the back.
 */

import { createHash } from 'node:crypto';
import type { Connection } from 'mongoose';
import { createJobModel, type JobDocument } from './schemas/job.schema.js';
import { SCAN_QUEUE_STATE_ID, createJobQueueStateModel } from './schemas/job-queue-state.schema.js';

/** The claim and every queue read use this one order. */
export const QUEUE_CLAIM_SORT = { queueOrder: 1, createdAt: 1, _id: 1 } as const;

/** Upper bound on one queue read: a batch is at most 50 sites and an
 *  overnight run is 5 to 10, so this is far above real use while keeping the
 *  poll bounded. A longer queue is reported as truncated, never reordered. */
const MAX_QUEUE_READ = 500;

/** Reserves the next unique queue position. */
export async function nextQueueOrder(connection: Connection): Promise<number> {
  const QueueState = createJobQueueStateModel(connection);
  const state = await QueueState.findOneAndUpdate(
    { _id: SCAN_QUEUE_STATE_ID },
    { $inc: { nextOrder: 1 }, $setOnInsert: { reorderSeq: 0 } },
    { upsert: true, returnDocument: 'after' },
  ).lean();
  return state!.nextOrder;
}

async function readReorderSeq(connection: Connection): Promise<number> {
  const state = await createJobQueueStateModel(connection).findById(SCAN_QUEUE_STATE_ID).lean();
  return state?.reorderSeq ?? 0;
}

/**
 * Gives every queued job that predates durable ordering a position, in the
 * order the old createdAt claim would have taken it. Called once at worker
 * start, before the first claim. Returns the number of rows backfilled.
 */
export async function backfillQueueOrder(connection: Connection): Promise<number> {
  const JobModel = createJobModel(connection);
  const legacy = await JobModel.find(
    { status: 'queued', queueOrder: { $exists: false } },
    { jobId: 1, _id: 1 },
  )
    .sort({ createdAt: 1, _id: 1 })
    .lean<{ jobId: string }[]>();
  let backfilled = 0;
  for (const row of legacy) {
    const queueOrder = await nextQueueOrder(connection);
    const result = await JobModel.updateOne(
      { jobId: row.jobId, queueOrder: { $exists: false } },
      { $set: { queueOrder } },
    );
    backfilled += result.modifiedCount;
  }
  return backfilled;
}

export type QueuedJobRow = Pick<
  JobDocument,
  'jobId' | 'type' | 'siteUrl' | 'createdAt' | 'options' | 'queueOrder'
>;

export interface ScanQueueSnapshot {
  /** Opaque token committing to the queued membership, its order and the
   *  last applied reorder. Any change to one of them changes the token. */
  queueRevision: string;
  /** Queued jobs, next-to-run first. */
  jobs: QueuedJobRow[];
  truncated: boolean;
}

function queueRevisionOf(reorderSeq: number, jobIds: readonly string[]): string {
  return createHash('sha256')
    .update(JSON.stringify([reorderSeq, jobIds]))
    .digest('base64url')
    .slice(0, 22);
}

export async function readScanQueue(connection: Connection): Promise<ScanQueueSnapshot> {
  const reorderSeq = await readReorderSeq(connection);
  const rows = await createJobModel(connection)
    .find(
      { status: 'queued' },
      { jobId: 1, type: 1, siteUrl: 1, createdAt: 1, options: 1, queueOrder: 1, _id: 0 },
    )
    .sort(QUEUE_CLAIM_SORT)
    .limit(MAX_QUEUE_READ + 1)
    .lean<QueuedJobRow[]>();
  const truncated = rows.length > MAX_QUEUE_READ;
  const jobs = truncated ? rows.slice(0, MAX_QUEUE_READ) : rows;
  return {
    queueRevision: queueRevisionOf(
      reorderSeq,
      jobs.map((job) => job.jobId),
    ),
    jobs,
    truncated,
  };
}

export type QueueReorderResult =
  | { outcome: 'reordered'; snapshot: ScanQueueSnapshot }
  | { outcome: 'state-changed'; snapshot: ScanQueueSnapshot }
  | { outcome: 'invalid-order'; snapshot: ScanQueueSnapshot };

/**
 * Applies an operator reorder of the waiting scans.
 *
 * The request names the revision it was computed from and the complete new
 * order of the queued jobs. The server reloads the queue, refuses a stale
 * revision, then takes the reorder slot with a conditional increment of
 * `reorderSeq`: of two tabs submitting against the same revision exactly one
 * wins and the other gets `state-changed`. A job claimed or cancelled between
 * that check and the write keeps its state, because every write is
 * conditional on the job still being queued.
 */
export async function reorderScanQueue(
  connection: Connection,
  input: { expectedRevision: string; orderedJobIds: readonly string[] },
): Promise<QueueReorderResult> {
  const seenSeq = await readReorderSeq(connection);
  const current = await readScanQueue(connection);
  if (current.truncated) return { outcome: 'invalid-order', snapshot: current };
  if (current.queueRevision !== input.expectedRevision) {
    return { outcome: 'state-changed', snapshot: current };
  }
  const currentIds = current.jobs.map((job) => job.jobId);
  const requested = [...input.orderedJobIds];
  if (
    requested.length !== currentIds.length ||
    new Set(requested).size !== requested.length ||
    !requested.every((jobId) => currentIds.includes(jobId))
  ) {
    return { outcome: 'invalid-order', snapshot: current };
  }
  const positions = current.jobs
    .map((job) => job.queueOrder)
    .filter((order): order is number => order !== undefined)
    .sort((a, b) => a - b);
  if (positions.length !== requested.length) {
    // Only possible before the startup backfill ran; refuse rather than guess.
    return { outcome: 'invalid-order', snapshot: current };
  }

  const QueueState = createJobQueueStateModel(connection);
  const taken = await QueueState.findOneAndUpdate(
    { _id: SCAN_QUEUE_STATE_ID, reorderSeq: seenSeq },
    { $inc: { reorderSeq: 1 }, $setOnInsert: { nextOrder: 0 } },
    { upsert: seenSeq === 0, returnDocument: 'after' },
  )
    .lean()
    .catch((error: unknown) => {
      // An upsert racing another upsert on the same _id loses on the
      // duplicate key: that is exactly a concurrent reorder winning.
      if ((error as { code?: unknown }).code === 11000) return null;
      throw error;
    });
  if (taken === null) {
    return { outcome: 'state-changed', snapshot: await readScanQueue(connection) };
  }

  await createJobModel(connection).bulkWrite(
    requested.map((jobId, index) => ({
      updateOne: {
        filter: { jobId, status: 'queued' },
        update: { $set: { queueOrder: positions[index]! } },
      },
    })),
    { ordered: true },
  );
  return { outcome: 'reordered', snapshot: await readScanQueue(connection) };
}
