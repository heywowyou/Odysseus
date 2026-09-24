/**
 * Plan 077: one document per applied retention run, so the dashboard can
 * show the last run's outcome and a failure stays visible after the process
 * that hit it has gone. Dry runs write nothing. Kept 90 days through the
 * same precomputed-`expiresAt` TTL pattern the outreach collections use.
 */

import { Schema, type Connection, type Model } from 'mongoose';

export const RETENTION_RUN_TTL_DAYS = 90;

export interface RetentionRunCounts {
  auditsDeleted: number;
  auditsSlimmed: number;
  reportsDeleted: number;
  analysesDeleted: number;
  structureFilesDeleted: number;
  qualityCandidateSetsDeleted: number;
  reportBundlesDeleted: number;
  auditsHeld: number;
}

export interface RetentionRunFailure {
  auditId: string;
  step: string;
  message: string;
}

export interface RetentionRunDocument {
  runId: string;
  trigger: 'sweeper' | 'cli';
  startedAt: Date;
  finishedAt: Date;
  counts: RetentionRunCounts;
  /** Remote bytes are the sizes of the local files whose bucket mirror was
   *  removed; the bucket port reports no object sizes. */
  bytesReclaimed: { local: number; remote: number };
  /** Includes objects that only lived in the bucket (quality candidates). */
  remoteObjectsDeleted: number;
  /** Set when the run refused as a whole (the per-run cap) and changed
   *  nothing. */
  refusal?: { reason: 'cap-exceeded'; auditsToDelete: number; auditsToSlim: number };
  failures: RetentionRunFailure[];
  expiresAt: Date;
}

const countsSchema = new Schema<RetentionRunCounts>(
  {
    auditsDeleted: { type: Number, required: true },
    auditsSlimmed: { type: Number, required: true },
    reportsDeleted: { type: Number, required: true },
    analysesDeleted: { type: Number, required: true },
    structureFilesDeleted: { type: Number, required: true },
    qualityCandidateSetsDeleted: { type: Number, required: true },
    reportBundlesDeleted: { type: Number, required: true },
    auditsHeld: { type: Number, required: true },
  },
  { _id: false },
);

const retentionRunSchema = new Schema<RetentionRunDocument>(
  {
    runId: { type: String, required: true },
    trigger: { type: String, required: true, enum: ['sweeper', 'cli'] },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    counts: { type: countsSchema, required: true },
    bytesReclaimed: {
      _id: false,
      type: {
        local: { type: Number, required: true },
        remote: { type: Number, required: true },
      },
      required: true,
    },
    remoteObjectsDeleted: { type: Number, required: true },
    refusal: {
      _id: false,
      type: {
        reason: { type: String, required: true, enum: ['cap-exceeded'] },
        auditsToDelete: { type: Number, required: true },
        auditsToSlim: { type: Number, required: true },
      },
    },
    failures: {
      type: [
        new Schema<RetentionRunFailure>(
          {
            auditId: { type: String, required: true },
            step: { type: String, required: true },
            message: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'retentionRuns' },
);
retentionRunSchema.index({ runId: 1 }, { unique: true });
retentionRunSchema.index({ startedAt: -1 });
retentionRunSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export function createRetentionRunModel(connection: Connection): Model<RetentionRunDocument> {
  return (
    connection.models['RetentionRun'] ??
    connection.model<RetentionRunDocument>('RetentionRun', retentionRunSchema)
  );
}
