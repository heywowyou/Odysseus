/**
 * The single document that makes scan-queue order durable (plan 061 §6).
 *
 * `nextOrder` hands every enqueued job a unique, monotonically increasing
 * `queueOrder`, so the claim order no longer depends on `createdAt` and a
 * restart or redeploy cannot silently reorder an overnight batch.
 * `reorderSeq` advances on every applied operator reorder: it is part of the
 * queue revision, and its conditional increment is what makes two tabs
 * reordering the same queue unable to both win.
 */

import { Schema, type Connection, type Model } from 'mongoose';

export const SCAN_QUEUE_STATE_ID = 'scan-queue';

export interface JobQueueStateDocument {
  _id: string;
  nextOrder: number;
  reorderSeq: number;
}

const jobQueueStateSchema = new Schema<JobQueueStateDocument>(
  {
    _id: { type: String, required: true },
    nextOrder: { type: Number, required: true, default: 0 },
    reorderSeq: { type: Number, required: true, default: 0 },
  },
  { collection: 'job_queue_state', versionKey: false },
);

export function createJobQueueStateModel(connection: Connection): Model<JobQueueStateDocument> {
  return (
    connection.models['JobQueueState'] ??
    connection.model<JobQueueStateDocument>('JobQueueState', jobQueueStateSchema)
  );
}
