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
  type JobOptionsSnapshot,
  type JobPhase,
  type JobProgress,
  type JobType,
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
  return JobModel.findOneAndUpdate(
    { status: 'queued' },
    { $set: { status: 'running', startedAt: new Date() } },
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
  if (patch.progress?.message !== undefined) $set['progress.message'] = patch.progress.message;
  if (patch.urlResults !== undefined) $set['urlResults'] = patch.urlResults;
  if (Object.keys($set).length === 0) return;
  await JobModel.updateOne({ jobId }, { $set });
}

export interface CompleteJobPatch {
  auditId?: string;
  auditIds?: string[];
  urlResults?: UrlResult[];
}

export async function completeJob(
  connection: Connection,
  jobId: string,
  patch: CompleteJobPatch = {},
): Promise<void> {
  const JobModel = createJobModel(connection);
  await JobModel.updateOne(
    { jobId },
    { $set: { status: 'complete', phase: 'complete', finishedAt: new Date(), ...patch } },
  );
}

export async function failJob(connection: Connection, jobId: string, error: string): Promise<void> {
  const JobModel = createJobModel(connection);
  await JobModel.updateOne(
    { jobId },
    { $set: { status: 'failed', phase: 'failed', finishedAt: new Date(), error } },
  );
}

export async function listJobs(connection: Connection, limit = 200): Promise<JobDocument[]> {
  const JobModel = createJobModel(connection);
  return JobModel.find().sort({ createdAt: -1 }).limit(limit).lean<JobDocument[]>();
}

export async function getJob(connection: Connection, jobId: string): Promise<JobDocument | null> {
  const JobModel = createJobModel(connection);
  return JobModel.findOne({ jobId }).lean<JobDocument>();
}

/** Called once at server startup, before the worker loop starts. A job
 *  stuck at status 'running' after an unclean shutdown has nothing
 *  actually running it; reset it to 'queued' so the queue picks it back
 *  up. createdAt is untouched, so claimNextQueuedJob's createdAt-ascending
 *  sort naturally restores it to its original FIFO position rather than
 *  requeuing it to the back. Returns the number of jobs reset. */
export async function resetOrphanedRunningJobs(connection: Connection): Promise<number> {
  const JobModel = createJobModel(connection);
  const result = await JobModel.updateMany(
    { status: 'running' },
    { $set: { status: 'queued', orphaned: true }, $unset: { startedAt: '' } },
  );
  return result.modifiedCount;
}
