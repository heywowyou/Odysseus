/**
 * Read/write helpers around the `jobs` collection. store was write-only
 * until this milestone (persist-audit.ts, persist-analysis.ts,
 * persist-report.ts); these follow the same business-logic-shaped-helper
 * pattern rather than leaving raw Mongoose query construction to callers,
 * so a future schema change to Job has one place to update.
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import {
  createJobModel,
  type JobDocument,
  type JobDocumentFields,
  type JobNeedsInputField,
  type JobOptionsSnapshot,
  type JobPhase,
  type JobProgress,
  type JobType,
  type OutreachBatchResult,
  type ProspectIngestionResult,
  type UrlResult,
} from './schemas/job.schema.js';

export interface NewJobInput {
  type: JobType;
  siteUrl?: string;
  urls?: string[];
  options: JobOptionsSnapshot;
}

export async function createJob(connection: Connection, input: NewJobInput): Promise<JobDocument> {
  const JobModel = createJobModel(connection);
  const doc: JobDocumentFields = {
    jobId: randomUUID(),
    type: input.type,
    status: 'queued',
    phase: 'queued',
    options: input.options,
    createdAt: new Date(),
    progress: {},
    ...(input.siteUrl !== undefined ? { siteUrl: input.siteUrl } : {}),
    ...(input.urls !== undefined ? { urls: input.urls } : {}),
  };
  await JobModel.create(doc);
  return doc;
}

/** Atomic claim: the oldest queued job is marked running in one operation,
 *  so two worker slots racing to dequeue never claim the same job twice. */
export async function claimNextQueuedJob(connection: Connection): Promise<JobDocument | null> {
  const JobModel = createJobModel(connection);
  const claimedAt = new Date();
  return JobModel.findOneAndUpdate(
    { status: 'queued' },
    { $set: { status: 'running', startedAt: claimedAt, lastHeartbeatAt: claimedAt } },
    { sort: { createdAt: 1 }, returnDocument: 'after' },
  ).lean<JobDocument>();
}

export interface JobProgressPatch {
  phase?: JobPhase;
  progress?: Partial<JobProgress>;
  /** Not part of JobProgress (it's a top-level Job field, one entry per
   *  URL in a prospecting batch), but updated on the same cadence as
   *  progress during a prospecting job's run, so it travels through this
   *  same patch helper rather than a second single-purpose function. */
  urlResults?: UrlResult[];
  /** Same reasoning as urlResults above, for prospect-ingestion jobs:
   *  one entry per candidate in the current batch only. */
  ingestionResults?: ProspectIngestionResult[];
  /** Same reasoning again, for outreach-draft-batch and
   *  outreach-followup-batch jobs: one entry per item in the current
   *  batch only. */
  outreachBatchResults?: OutreachBatchResult[];
  /** Written as soon as the audit stage resolves, well before completeJob
   *  runs, so a later report-stage failure still leaves the dashboard able
   *  to link the job to its persisted audit (rowTarget in
   *  dashboard/routes/audits-model.ts reads this field regardless of job
   *  status). */
  auditId?: string;
}

export async function updateJobProgress(
  connection: Connection,
  jobId: string,
  patch: JobProgressPatch,
): Promise<void> {
  const JobModel = createJobModel(connection);
  const $set: Record<string, unknown> = {};
  if (patch.phase !== undefined) $set['phase'] = patch.phase;
  if (patch.progress?.crawl !== undefined) $set['progress.crawl'] = patch.progress.crawl;
  if (patch.progress?.scan !== undefined) $set['progress.scan'] = patch.progress.scan;
  if (patch.progress?.contentScan !== undefined)
    $set['progress.contentScan'] = patch.progress.contentScan;
  if (patch.progress?.lighthouse !== undefined)
    $set['progress.lighthouse'] = patch.progress.lighthouse;
  if (patch.progress?.continuationGuard !== undefined)
    $set['progress.continuationGuard'] = patch.progress.continuationGuard;
  if (patch.progress?.ingestion !== undefined)
    $set['progress.ingestion'] = patch.progress.ingestion;
  if (patch.progress?.message !== undefined) $set['progress.message'] = patch.progress.message;
  if (patch.urlResults !== undefined) $set['urlResults'] = patch.urlResults;
  if (patch.ingestionResults !== undefined) $set['ingestionResults'] = patch.ingestionResults;
  if (patch.outreachBatchResults !== undefined)
    $set['outreachBatchResults'] = patch.outreachBatchResults;
  if (patch.auditId !== undefined) $set['auditId'] = patch.auditId;
  if (Object.keys($set).length === 0) return;
  await JobModel.updateOne(
    { jobId, status: 'running' },
    { $set: { ...$set, lastHeartbeatAt: new Date() } },
  );
}

export interface CompleteJobPatch {
  auditId?: string;
  auditIds?: string[];
  urlResults?: UrlResult[];
  ingestionResults?: ProspectIngestionResult[];
  outreachBatchResults?: OutreachBatchResult[];
  needsReview?: string;
}

export async function completeJob(
  connection: Connection,
  jobId: string,
  patch: CompleteJobPatch = {},
): Promise<void> {
  const JobModel = createJobModel(connection);
  await JobModel.updateOne(
    { jobId, status: { $in: ['queued', 'running'] } },
    { $set: { status: 'complete', phase: 'complete', finishedAt: new Date(), ...patch } },
  );
}

export async function failJob(connection: Connection, jobId: string, error: string): Promise<void> {
  const JobModel = createJobModel(connection);
  await JobModel.updateOne(
    { jobId, status: { $in: ['queued', 'running'] } },
    { $set: { status: 'failed', phase: 'failed', finishedAt: new Date(), error } },
  );
}

/** Issue #73: the pipeline stopped deliberately on the D8 identity-
 *  confirmation gate, not a crash - a distinct terminal status from
 *  'failed' so the dashboard can tell "needs thirty seconds of data
 *  entry" apart from "needs debugging" and link straight to the awaited
 *  fields instead of the operator parsing an error string. */
export async function markJobNeedsInput(
  connection: Connection,
  jobId: string,
  fields: JobNeedsInputField[],
  error: string,
): Promise<void> {
  const JobModel = createJobModel(connection);
  await JobModel.updateOne(
    { jobId, status: { $in: ['queued', 'running'] } },
    {
      $set: {
        status: 'needs-input',
        phase: 'needs-input',
        finishedAt: new Date(),
        error,
        needsInputFields: fields,
      },
    },
  );
}

/** Operator stop request, written immediately so the dashboard reflects it
 *  and the claim filter (status 'queued') can never pick the job up again.
 *  A running job's runner learns about the stop through the interface
 *  package's in-process registry and throws at the next page boundary; the
 *  terminal write is idempotent against this one because it only matches
 *  documents still queued or running. Returns false when the job was
 *  already terminal, so the route layer can answer 409 instead of lying. */
export async function cancelJob(
  connection: Connection,
  jobId: string,
  error: string,
): Promise<boolean> {
  const JobModel = createJobModel(connection);
  const result = await JobModel.updateOne(
    { jobId, status: { $in: ['queued', 'running'] } },
    { $set: { status: 'cancelled', phase: 'cancelled', finishedAt: new Date(), error } },
  );
  return result.modifiedCount > 0;
}

/** Bulk operator clear of every queued job at once. Same semantics as
 *  cancelJob for each of them; running and terminal jobs are untouched. */
export async function cancelQueuedJobs(connection: Connection, error: string): Promise<number> {
  const JobModel = createJobModel(connection);
  const result = await JobModel.updateMany(
    { status: 'queued' },
    { $set: { status: 'cancelled', phase: 'cancelled', finishedAt: new Date(), error } },
  );
  return result.modifiedCount;
}

/** Removes one job document outright (audits-page delete). Callers decide
 *  whether the job's linked audits are cascaded first; this only unlinks
 *  the queue history row itself. */
export async function deleteJob(connection: Connection, jobId: string): Promise<boolean> {
  const JobModel = createJobModel(connection);
  const result = await JobModel.deleteOne({ jobId });
  return result.deletedCount > 0;
}

export async function listJobs(connection: Connection, limit = 200): Promise<JobDocument[]> {
  const JobModel = createJobModel(connection);
  return JobModel.find().sort({ createdAt: -1 }).limit(limit).lean<JobDocument[]>();
}

export async function getJob(connection: Connection, jobId: string): Promise<JobDocument | null> {
  const JobModel = createJobModel(connection);
  return JobModel.findOne({ jobId }).lean<JobDocument>();
}

/** A worker that has not reported progress for this long is treated as
 *  stopped. The bound exceeds one hotel's three-page prescan timeout, so a
 *  slow but live browser is never reclaimed by a second worker. */
export const ORPHANED_JOB_TIMEOUT_MS = 10 * 60 * 1000;

/** Called once at server startup, before the worker loop starts. A job that
 *  has been silent past ORPHANED_JOB_TIMEOUT_MS was left running by an
 *  unclean shutdown, so reset it to 'queued'. A fresh heartbeat means a live
 *  worker owns it and must never be reclaimed. createdAt is untouched, so
 *  claimNextQueuedJob's createdAt-ascending sort restores the original FIFO
 *  position rather than requeuing it to the back. Returns the number reset. */
export async function resetOrphanedRunningJobs(
  connection: Connection,
  now = new Date(),
): Promise<number> {
  const JobModel = createJobModel(connection);
  const staleBefore = new Date(now.getTime() - ORPHANED_JOB_TIMEOUT_MS);
  const result = await JobModel.updateMany(
    {
      status: 'running',
      $or: [
        { lastHeartbeatAt: { $lt: staleBefore } },
        { lastHeartbeatAt: { $exists: false }, startedAt: { $lt: staleBefore } },
      ],
    },
    {
      $set: { status: 'queued', orphaned: true },
      $unset: { startedAt: '', lastHeartbeatAt: '' },
    },
  );
  return result.modifiedCount;
}
