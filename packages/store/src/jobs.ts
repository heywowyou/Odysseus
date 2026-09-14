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
  type JobPrescanScoringOutcome,
  type JobProgress,
  type JobRunIdentity,
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
 *  so two worker slots racing to dequeue never claim the same job twice.
 *  workerRevision is diagnostic build-provenance (issue: worker/job
 *  provenance), stamped here rather than at completion because the same
 *  process runs the job start to finish; the caller passes its own build
 *  identity rather than this package reaching into scanner/config to
 *  resolve it itself. */
export async function claimNextQueuedJob(
  connection: Connection,
  options: { workerRevision?: string } = {},
): Promise<JobDocument | null> {
  const JobModel = createJobModel(connection);
  const claimedAt = new Date();
  return JobModel.findOneAndUpdate(
    { status: 'queued' },
    {
      $set: {
        status: 'running',
        startedAt: claimedAt,
        lastHeartbeatAt: claimedAt,
        ...(options.workerRevision !== undefined ? { workerRevision: options.workerRevision } : {}),
      },
    },
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

/** Plan 035 (issue #124): create-or-return the audit run's stable identity
 *  (JobRunIdentity in job.schema.ts). Two workers racing to run the same
 *  job, or a re-claim after a crash, must converge on one identity, never
 *  mint a second: the findOneAndUpdate filter matches only a document that
 *  has no runIdentity yet, so exactly one racing caller's $set can apply
 *  and every other caller falls through to reading the winner's stamp. */
export async function ensureJobRunIdentity(
  connection: Connection,
  jobId: string,
): Promise<JobRunIdentity> {
  const JobModel = createJobModel(connection);
  const minted = await JobModel.findOneAndUpdate(
    { jobId, runIdentity: { $exists: false } },
    { $set: { runIdentity: { startedAt: new Date(), auditId: randomUUID() } } },
    { returnDocument: 'after' },
  ).lean<JobDocument>();
  if (minted?.runIdentity) return minted.runIdentity;
  const existing = await JobModel.findOne({ jobId }).lean<JobDocument>();
  if (!existing?.runIdentity) {
    throw new Error(`ensureJobRunIdentity: job ${jobId} has no document to stamp an identity on`);
  }
  return existing.runIdentity;
}

/** Progress writes are fire-and-forget, so a straggler write can land after
 *  the job has already finished; the filter excludes every terminal status
 *  so a late write can neither regress a finished job's phase nor refresh
 *  its heartbeat. Only queued or running jobs still receive progress. */
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
    { jobId, status: { $nin: ['cancelled', 'complete', 'failed', 'needs-input'] } },
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
  prescanScoringOutcome?: JobPrescanScoringOutcome;
}

export async function completeJob(
  connection: Connection,
  jobId: string,
  patch: CompleteJobPatch = {},
): Promise<void> {
  const JobModel = createJobModel(connection);
  await JobModel.updateOne(
    { jobId, status: { $ne: 'cancelled' } },
    { $set: { status: 'complete', phase: 'complete', finishedAt: new Date(), ...patch } },
  );
}

export async function failJob(connection: Connection, jobId: string, error: string): Promise<void> {
  const JobModel = createJobModel(connection);
  await JobModel.updateOne(
    { jobId, status: { $ne: 'cancelled' } },
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
    { jobId, status: { $ne: 'cancelled' } },
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

/** The fields GET /api/scans maps into its per-row summary. The job
 *  document's urlResults / ingestionResults / outreachBatchResults
 *  arrays (job.schema.ts) are excluded: the poll runs every 5 seconds
 *  per open dashboard tab and never reads them. */
export type JobSummaryFields = Pick<
  JobDocument,
  | 'jobId'
  | 'type'
  | 'status'
  | 'phase'
  | 'siteUrl'
  | 'urls'
  | 'createdAt'
  | 'finishedAt'
  | 'auditId'
  | 'auditIds'
  | 'needsReview'
> & {
  /** Plan 042 slice 4: the outreach candidate a prospecting job works
   *  for, projected out of options for the audits list's hotel link. */
  outreachCandidateId?: string;
};

export async function listJobs(connection: Connection, limit = 200): Promise<JobSummaryFields[]> {
  const JobModel = createJobModel(connection);
  // A dotted-path projection ('options.outreachCandidateId': 1) returns a
  // nested { options: { outreachCandidateId } }, not a flattened top-level
  // field - lean() does not collapse it, whatever JobSummaryFields' cast
  // claims. Project the whole options subdocument and flatten it here so
  // the field this type actually promises is the field callers get.
  const docs = await JobModel.find(
    {},
    {
      jobId: 1,
      type: 1,
      status: 1,
      phase: 1,
      siteUrl: 1,
      urls: 1,
      createdAt: 1,
      finishedAt: 1,
      auditId: 1,
      auditIds: 1,
      needsReview: 1,
      'options.outreachCandidateId': 1,
    },
  )
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<
      (Omit<JobSummaryFields, 'outreachCandidateId'> & {
        options?: { outreachCandidateId?: string };
      })[]
    >();
  return docs.map(({ options, ...rest }) => ({
    ...rest,
    ...(options?.outreachCandidateId !== undefined
      ? { outreachCandidateId: options.outreachCandidateId }
      : {}),
  }));
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
 *  position rather than requeuing it to the back. Returns the number reset.
 *
 *  includeFreshHeartbeats drops the staleness guard and requeues every
 *  'running' job. It exists for JobQueue.start() in the single-container
 *  deployment: the app container was just recreated, so no worker can own
 *  any running job, and a heartbeat written by the previous container
 *  (issue #124: restart sooner than ORPHANED_JOB_TIMEOUT_MS after the kill)
 *  would otherwise wedge the job as 'running' forever, recoverable only by
 *  another restart past the timeout. The stale-only default stays correct
 *  for any future multi-worker caller, where a live worker may legitimately
 *  hold a fresh-heartbeat job. */
export async function resetOrphanedRunningJobs(
  connection: Connection,
  now = new Date(),
  options?: { includeFreshHeartbeats?: boolean },
): Promise<number> {
  const JobModel = createJobModel(connection);
  const staleBefore = new Date(now.getTime() - ORPHANED_JOB_TIMEOUT_MS);
  const result = await JobModel.updateMany(
    {
      status: 'running',
      ...(options?.includeFreshHeartbeats
        ? {}
        : {
            $or: [
              { lastHeartbeatAt: { $lt: staleBefore } },
              { lastHeartbeatAt: { $exists: false }, startedAt: { $lt: staleBefore } },
            ],
          }),
    },
    {
      $set: { status: 'queued', orphaned: true },
      $unset: { startedAt: '', lastHeartbeatAt: '' },
    },
  );
  return result.modifiedCount;
}
