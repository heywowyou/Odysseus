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
  type JobRunIdentity,
  type JobStatus,
  type JobType,
  type OutreachBatchResult,
  type UrlResult,
} from './schemas/job.schema.js';

export interface NewJobInput {
  type: JobType;
  siteUrl?: string;
  urls?: string[];
  options: JobOptionsSnapshot;
}

/** Thrown by createJob when another unfinished job already holds the
 *  prospect scan slot the new job needs. */
export class ActiveJobSlotTakenError extends Error {
  constructor(readonly conflictingJobId: string) {
    super(`an unfinished job (${conflictingJobId}) already holds this prospect scan slot`);
    this.name = 'ActiveJobSlotTakenError';
  }
}

/** Issue #383: only work that can still execute holds a scan slot. A
 *  'needs-input' job is terminal - the runner has already thrown and
 *  returned - so it waits for a person, not for Chromium, and must not
 *  block a new scan of the same prospect. */
const UNFINISHED_JOB_STATUSES: JobStatus[] = ['queued', 'running'];

/** The per-prospect slot a new job occupies: one complete crawl (Full scan,
 *  or the historical prospecting-audit and outreach full-scan types) and
 *  one Quick Check at a time. Jobs with no prospect take no slot. */
function activeSlotForNewJob(input: NewJobInput): string | undefined {
  const prospectId = input.options.prospectId;
  if (prospectId === undefined) return undefined;
  switch (input.type) {
    case 'full-audit':
    case 'prospecting-audit':
    case 'outreach-full-scan':
      return `${prospectId}:complete-crawl`;
    case 'quick-check':
      return `${prospectId}:quick-check`;
    case 'prospecting':
      if (input.options.scanType === 'quick-check') return `${prospectId}:quick-check`;
      if (input.options.scanType === 'prospecting-audit') return `${prospectId}:complete-crawl`;
      return undefined;
    default:
      return undefined;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}

/** Inserts a queued job. A prospect scan takes its slot in the same insert,
 *  so two launches racing past the read-side conflict check cannot both
 *  create a job: the second insert fails on the unique slot and this throws
 *  ActiveJobSlotTakenError. A slot still held by a finished job is released
 *  and the insert retried. */
export async function createJob(connection: Connection, input: NewJobInput): Promise<JobDocument> {
  const JobModel = createJobModel(connection);
  const activeSlot = activeSlotForNewJob(input);
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
    ...(activeSlot !== undefined ? { activeSlot } : {}),
  };
  if (activeSlot === undefined) {
    await JobModel.create(doc);
    return doc;
  }
  await JobModel.init();
  for (let attempt = 0; ; attempt++) {
    try {
      await JobModel.create(doc);
      return doc;
    } catch (error) {
      if (!isDuplicateKeyError(error) || attempt >= 2) throw error;
    }
    const holder = await JobModel.findOne({ activeSlot })
      .select({ jobId: 1, status: 1, _id: 0 })
      .lean<{ jobId: string; status: string }>();
    if (holder !== null && UNFINISHED_JOB_STATUSES.includes(holder.status as JobStatus)) {
      throw new ActiveJobSlotTakenError(holder.jobId);
    }
    if (holder !== null) {
      await JobModel.updateOne(
        { jobId: holder.jobId, activeSlot, status: { $nin: UNFINISHED_JOB_STATUSES } },
        { $unset: { activeSlot: '' } },
      );
    }
  }
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
    // _id breaks createdAt ties: a batch submission creates its jobs within
    // the same millisecond, and ObjectIds generated in one process increase
    // in creation order, so submission order is still the processing order.
    { sort: { createdAt: 1, _id: 1 }, returnDocument: 'after' },
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
  if (patch.progress?.message !== undefined) $set['progress.message'] = patch.progress.message;
  if (patch.urlResults !== undefined) $set['urlResults'] = patch.urlResults;
  if (patch.outreachBatchResults !== undefined)
    $set['outreachBatchResults'] = patch.outreachBatchResults;
  if (patch.auditId !== undefined) $set['auditId'] = patch.auditId;
  if (Object.keys($set).length === 0) return;
  await JobModel.updateOne(
    { jobId, status: { $nin: ['cancelled', 'complete', 'failed', 'needs-input'] } },
    { $set: { ...$set, lastHeartbeatAt: new Date() } },
  );
  // The audit link is not progress: once the audit is persisted, the job
  // must point at it even when a stop already made the job terminal, or
  // deleting the stopped job would leave the audit behind with no owner.
  if (patch.auditId !== undefined) {
    await JobModel.updateOne({ jobId, status: 'cancelled' }, { $set: { auditId: patch.auditId } });
  }
}

export interface CompleteJobPatch {
  auditId?: string;
  auditIds?: string[];
  urlResults?: UrlResult[];
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
      // Issue #383: released in the same write, so a stopped job never
      // holds the prospect's scan slot. A historical needs-input holder that
      // predates this is released by createJob's retry instead.
      $unset: { activeSlot: '' },
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
 *  document's urlResults / outreachBatchResults
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
  prospectId?: string;
  /** Issue #382: the job carries typed fields an operator must confirm.
   *  True for every needs-input job, and for a legacy failed row that was
   *  written with the fields before needs-input existed. */
  awaitsInput?: boolean;
  scanType?: JobOptionsSnapshot['scanType'];
};

export async function listJobs(connection: Connection, limit = 200): Promise<JobSummaryFields[]> {
  const JobModel = createJobModel(connection);
  // A dotted-path projection ('options.prospectId': 1) returns a nested
  // { options: { prospectId } }, not a flattened top-level
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
      needsInputFields: 1,
      'options.prospectId': 1,
      'options.scanType': 1,
    },
  )
    // Same _id tiebreak as the claim, reversed: jobs of one batch share a
    // createdAt, and the list must still reflect their queue order.
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .lean<
      (Omit<JobSummaryFields, 'prospectId'> & {
        options?: {
          prospectId?: string;
          scanType?: JobOptionsSnapshot['scanType'];
        };
        needsInputFields?: JobDocument['needsInputFields'];
      })[]
    >();
  return docs.map(({ options, needsInputFields, ...rest }) => ({
    ...rest,
    ...((needsInputFields?.length ?? 0) > 0 ? { awaitsInput: true } : {}),
    ...(options?.prospectId !== undefined ? { prospectId: options.prospectId } : {}),
    ...(options?.scanType !== undefined ? { scanType: options.scanType } : {}),
  }));
}

export async function getJob(connection: Connection, jobId: string): Promise<JobDocument | null> {
  const JobModel = createJobModel(connection);
  return JobModel.findOne({ jobId }).lean<JobDocument>();
}

/** A worker that has not reported progress for this long is treated as
 *  stopped. The bound exceeds one hotel's three-page prescan timeout, so a
 *  slow but live browser is never reclaimed by a second worker. */
const ORPHANED_JOB_TIMEOUT_MS = 10 * 60 * 1000;

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
