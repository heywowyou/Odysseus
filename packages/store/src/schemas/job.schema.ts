/**
 * Mongoose schema for the `jobs` collection. This is the queue's entity,
 * introduced in milestone 7: a queued-but-not-started or still-running
 * scan has no document in `audits` yet (that collection has no status
 * field by design, see audit.schema.ts), so Job is the superset the
 * interface's history log and progress view actually read from. Once a
 * full-audit job's scan/normalize/persist stage completes, `auditId`
 * points into the unchanged `audits`/`findings`/`analyses`/`reports`
 * collections; this schema never duplicates or reshapes their content.
 */

import { Schema, type Connection, type Model } from 'mongoose';
export type JobType =
  | 'full-audit'
  | 'quick-check'
  | 'prospecting-audit'
  | 'prospecting'
  | 'outreach-draft-batch'
  | 'outreach-followup-batch'
  | 'outreach-full-scan';
export const JOB_STATUSES = [
  'queued',
  'running',
  'cancel-requested',
  'complete',
  'failed',
  'cancelled',
  'needs-input',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** A stop request is not terminal until its worker reaches a boundary: all
 * three statuses can still write audit data and must block conflicting work. */
export const JOB_STATUS_POLICY: Record<JobStatus, { canStillWrite: boolean }> = {
  queued: { canStillWrite: true },
  running: { canStillWrite: true },
  'cancel-requested': { canStillWrite: true },
  complete: { canStillWrite: false },
  failed: { canStillWrite: false },
  cancelled: { canStillWrite: false },
  'needs-input': { canStillWrite: false },
};
export const JOB_STATUSES_CAN_STILL_WRITE = JOB_STATUSES.filter(
  (status) => JOB_STATUS_POLICY[status].canStillWrite,
);
export const JOB_STATUSES_SHOWN_AS_ACTIVE = JOB_STATUSES_CAN_STILL_WRITE;
export type JobPhase =
  | 'queued'
  | 'crawl'
  | 'scan'
  | 'content-scan'
  | 'select-performance'
  | 'lighthouse'
  | 'normalize'
  | 'analyze-fr'
  | 'analyze-en'
  | 'report-fr'
  | 'report-en'
  | 'scanning'
  | 'drafting'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'needs-input';

export interface JobOptionsSnapshot {
  /** Durable prospect hub link. */
  prospectId?: string;
  scanType?: 'quick-check' | 'prospecting-audit';
  maxPages?: number;
  maxDepth?: number;
  delayMs?: number;
  /** Full-audit jobs only (issue #111): how many pages this job's scan
   *  phase may process at once. The audit stage clamps it down to the
   *  configured SCAN_CONCURRENCY, and delayMs up to the configured
   *  CRAWL_DELAY_MS, so a per-job pacing option can only ever reduce the
   *  load a crawl puts on a site, never raise it past production config
   *  or robots.txt. The applied values are what the audit's config
   *  snapshot records. */
  scanConcurrency?: number;
  /** Checksum-validated by the route handler before a job is ever
   *  created (see the manual-SIREN milestone) - full-audit jobs only,
   *  never read for a prospecting job. */
  siren?: string;
  /** Manual override of the hasTransactionalFlow site signal (see the
   *  manual site-signal override milestone), same "full-audit jobs only"
   *  scope as siren above. Absent means "let the detector decide", not
   *  false - false must be an explicit operator assertion. */
  transactionalFlow?: boolean;
  transactionalFlowReason?: string;
  /** Manual-input-layer milestone, pre-scan fields (full-audit jobs only):
   *  changing any of these invalidates a crawl already run, which is why
   *  they live here rather than on the audit record - see
   *  AuditManualFields in @odysseus/core for the pre-report counterpart. */
  /** Extra absolute URLs force-enqueued at depth 0 alongside the start
   *  URL, e.g. a page the crawler's own link discovery never reaches. */
  seeds?: string[];
  /** Glob patterns; a matching URL is never enqueued. Validated at the
   *  route boundary (routes/scans.ts), same as siren above. */
  exclusions?: string[];
  /** A known off-domain booking destination (see transactional-flow.ts's
   *  delegated-booking-redirect check) - short-circuits that check to
   *  'single-property' instead of re-guessing from page content. */
  bookingEngineUrl?: string;
  /** Optional target domain used for a prospect-scoped scan. */
  domain?: string;
  /** outreach-draft-batch and outreach-followup-batch jobs only (milestone
   *  9c plan 030): maximum drafts/follow-ups this batch prepares, the same
   *  bound the CLI's own `--limit` has always used. */
  limit?: number;
  /** outreach-draft-batch jobs only. Follow-up drafts read the thread's own
   *  stored language instead - there is nothing to override. */
  language?: 'fr' | 'en';
}

/** Issue #223: `etaCalculatedAt` names the instant `etaMs` was computed,
 *  so a client polling less often than pages complete can age the
 *  displayed countdown down between polls instead of showing the same
 *  frozen snapshot for the whole interval. Absent whenever etaMs is. */
export interface JobProgressCrawl {
  visited: number;
  target: number;
  effectiveDelayMs?: number;
  etaMs?: number;
  etaCalculatedAt?: Date;
}

export interface JobProgressScan {
  scanned: number;
  target: number;
  etaMs?: number;
  etaCalculatedAt?: Date;
}

export interface JobProgressAnalysisStage {
  completed: number;
  target: number;
  etaMs?: number;
  etaCalculatedAt?: Date;
  requestStartCount?: number;
  currentDelayMs?: number;
}

export interface JobProgressContinuationGuard {
  omittedUrlCount: number;
  omittedFamilyCount: number;
}

/** Issue #393: navigated crawl URLs that are not content-checked, by reason. */
export interface JobProgressCrawlExclusions {
  discoveryOnly: number;
  externalRedirect: number;
  nonHtml: number;
  httpError: number;
  blocked: number;
  error: number;
}

export interface JobProgressPushbackEvent {
  pageUrl: string;
  kind: 'rate-limit' | 'bot-challenge' | 'origin-transient';
  fetcher: 'crawl' | 'render' | 'lighthouse' | 'canonical';
  occurredAt: string;
  status?: number;
  retryAfterMs?: number;
  retryAfterCapped?: boolean;
  delayMs?: number;
  atMaxDelay?: boolean;
}

export interface JobProgressPacingRecoveryEvent {
  delayMs: number;
  occurredAt: string;
}

/** A full audit whose site's server is busy with another audit: it gave
 *  its queue slot back and is waiting (JobQueue.acquireServer). */
export interface JobProgressServerWait {
  waiting: boolean;
  since?: string;
}

export interface JobProgress {
  crawl?: JobProgressCrawl;
  scan?: JobProgressScan;
  contentScan?: JobProgressAnalysisStage;
  lighthouse?: JobProgressAnalysisStage;
  continuationGuard?: JobProgressContinuationGuard;
  crawlExclusions?: JobProgressCrawlExclusions;
  pushbackEvents?: JobProgressPushbackEvent[];
  pacingRecoveryEvents?: JobProgressPacingRecoveryEvent[];
  serverWait?: JobProgressServerWait;
  message?: string;
}

export type UrlResultStatus = 'pending' | 'scanning' | 'complete' | 'skipped-non-html' | 'error';

export interface UrlResult {
  url: string;
  status: UrlResultStatus;
  auditId?: string;
  error?: string;
}

/** One entry per item in the current draft batch. */
export interface OutreachBatchResult {
  id: string;
  created: boolean;
  refusal?: string;
}

/** Plan 035 (issue #124): the audit run's stable identity, stamped once by
 *  ensureJobRunIdentity and reused by every orphan re-claim. */
export interface JobRunIdentity {
  startedAt: Date;
  auditId: string;
}

export interface JobDocumentFields {
  jobId: string;
  type: JobType;
  status: JobStatus;
  phase: JobPhase;
  siteUrl?: string;
  urls?: string[];
  options: JobOptionsSnapshot;
  createdAt: Date;
  startedAt?: Date;
  /** The audit run's stable identity across orphan re-claims, distinct
   *  from the per-claim startedAt above (which resetOrphanedRunningJobs
   *  unsets on every requeue). runIdentity.startedAt is what buildAuditDir
   *  receives, which is what keeps the audit directory (keyed by hostname
   *  plus this timestamp) stable, so the per-page results already streamed
   *  to disk (writePagesAsScanned) stay reusable when a crashed full-audit
   *  job is re-claimed (issue #124). Written once, never re-minted: two
   *  workers racing, or a re-claim after a crash, must converge on one
   *  identity. */
  runIdentity?: JobRunIdentity;
  /** Updated whenever a running job reports progress. Startup recovery only
   *  requeues jobs whose worker has been silent past the orphan timeout. */
  lastHeartbeatAt?: Date;
  finishedAt?: Date;
  auditId?: string;
  auditIds?: string[];
  urlResults?: UrlResult[];
  outreachBatchResults?: OutreachBatchResult[];
  progress: JobProgress;
  error?: string;
  /** Issue #386: the phase a failed job was running when it failed.
   *  failJob overwrites `phase` with 'failed', so without this nothing
   *  could tell a crawl failure from a report-writing or PDF failure on a
   *  job whose audit was already saved. Absent on rows failed before it
   *  existed. */
  failedPhase?: JobPhase;
  orphaned?: boolean;
  /** P0.1 (2026-08-21 La Corniche feedback pass): a completed full-audit
   *  job whose report advertises a pillar (performance) it has zero data
   *  for must not look identical to a genuinely complete one in the
   *  dashboard. Set when hasMeasuredCoreWebVitals(manifest) is false at
   *  completion; absent (not a boolean) so a normal complete job's JSON
   *  shape is unchanged. Status stays 'complete' - the audit and its
   *  report did generate - this only flags that one advertised section
   *  came back empty and the report itself explains why. */
  needsReview?: string;
  /** Issue #73: set when the pipeline stopped deliberately on the D8
   *  identity-confirmation gate (packages/report's
   *  ReportIdentityUnconfirmedError) rather than crashing. status/phase
   *  are 'needs-input' whenever this is present, so the dashboard can
   *  link straight to the awaited fields instead of reading the error
   *  string. */
  needsInputFields?: JobNeedsInputField[];
  /** The prospect scan slot this job took at creation, e.g.
   *  `<prospectId>:complete-crawl`. A unique index makes the insert itself
   *  refuse a second job for the same slot, which a read-then-insert launch
   *  check cannot. It stays on the row after the job ends; createJob frees
   *  it from a finished holder when a new job needs the slot. */
  activeSlot?: string;
  /** Plan 061 §6: the job's durable position in the scan queue, unique and
   *  assigned from the queue-state counter at enqueue (or by the startup
   *  backfill for a row queued before the field existed). The claim takes
   *  the lowest queued value; an operator reorder permutes the values among
   *  the queued jobs only. Kept after the claim, so a job requeued by
   *  restart recovery returns to its original place. */
  queueOrder?: number;
  /** Diagnostic only, not artifact provenance: the build revision of the
   *  worker that claimed this job, stamped by claimNextQueuedJob so a
   *  surprising result can be checked against a stale worker rather than
   *  a stale dashboard/server. No attempt history exists on this model, so
   *  a re-claim after a crash overwrites this with the re-claiming
   *  worker's revision - the field always answers "which worker most
   *  recently ran this", never a full history. */
  workerRevision?: string;
  /** Plan 059 step 22: minted afresh by every claim and cleared when the job
   *  is requeued, so a worker can tell whether it still holds the job it
   *  started. A superseded worker's claim id no longer matches. */
  claimId?: string;
}

export interface JobNeedsInputField {
  field: 'nomCommercial' | 'raisonSociale';
  value: string;
}

export type JobDocument = JobDocumentFields;

const jobOptionsSchema = new Schema(
  {
    prospectId: { type: String },
    scanType: { type: String, enum: ['quick-check', 'prospecting-audit'] },
    maxPages: { type: Number },
    maxDepth: { type: Number },
    delayMs: { type: Number },
    scanConcurrency: { type: Number },
    siren: { type: String },
    transactionalFlow: { type: Boolean },
    transactionalFlowReason: { type: String },
    seeds: { type: [String] },
    exclusions: { type: [String] },
    bookingEngineUrl: { type: String },
    domain: { type: String },
    limit: { type: Number },
    language: { type: String, enum: ['fr', 'en'] },
  },
  { _id: false },
);

const jobProgressCrawlSchema = new Schema(
  {
    visited: { type: Number, required: true },
    target: { type: Number, required: true },
    effectiveDelayMs: { type: Number },
    etaMs: { type: Number },
    etaCalculatedAt: { type: Date },
  },
  { _id: false },
);

const jobProgressScanSchema = new Schema(
  {
    scanned: { type: Number, required: true },
    target: { type: Number, required: true },
    etaMs: { type: Number },
    etaCalculatedAt: { type: Date },
  },
  { _id: false },
);

const jobProgressAnalysisStageSchema = new Schema(
  {
    completed: { type: Number, required: true },
    target: { type: Number, required: true },
    etaMs: { type: Number },
    etaCalculatedAt: { type: Date },
    requestStartCount: { type: Number },
    currentDelayMs: { type: Number },
  },
  { _id: false },
);

const jobProgressContinuationGuardSchema = new Schema(
  {
    omittedUrlCount: { type: Number, required: true },
    omittedFamilyCount: { type: Number, required: true },
  },
  { _id: false },
);

const jobProgressCrawlExclusionsSchema = new Schema(
  {
    discoveryOnly: { type: Number, required: true },
    externalRedirect: { type: Number, required: true },
    nonHtml: { type: Number, required: true },
    httpError: { type: Number, required: true },
    blocked: { type: Number, required: true },
    error: { type: Number, required: true },
  },
  { _id: false },
);

const jobProgressPushbackEventSchema = new Schema(
  {
    pageUrl: { type: String, required: true },
    kind: {
      type: String,
      enum: ['rate-limit', 'bot-challenge', 'origin-transient'],
      required: true,
    },
    fetcher: {
      type: String,
      enum: ['crawl', 'render', 'lighthouse', 'canonical'],
      required: true,
    },
    occurredAt: { type: String, required: true },
    status: { type: Number },
    retryAfterMs: { type: Number },
    retryAfterCapped: { type: Boolean },
    delayMs: { type: Number },
    atMaxDelay: { type: Boolean },
  },
  { _id: false },
);

const jobProgressPacingRecoveryEventSchema = new Schema(
  {
    delayMs: { type: Number, required: true },
    occurredAt: { type: String, required: true },
  },
  { _id: false },
);

const jobProgressSchema = new Schema(
  {
    crawl: { type: jobProgressCrawlSchema },
    scan: { type: jobProgressScanSchema },
    contentScan: { type: jobProgressAnalysisStageSchema },
    lighthouse: { type: jobProgressAnalysisStageSchema },
    continuationGuard: { type: jobProgressContinuationGuardSchema },
    crawlExclusions: { type: jobProgressCrawlExclusionsSchema },
    pushbackEvents: { type: [jobProgressPushbackEventSchema] },
    pacingRecoveryEvents: { type: [jobProgressPacingRecoveryEventSchema] },
    serverWait: {
      type: new Schema(
        { waiting: { type: Boolean, required: true }, since: { type: String } },
        { _id: false },
      ),
    },
    message: { type: String },
  },
  { _id: false },
);

const urlResultSchema = new Schema(
  {
    url: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'scanning', 'complete', 'skipped-non-html', 'error'],
    },
    auditId: { type: String },
    error: { type: String },
  },
  { _id: false },
);

const jobNeedsInputFieldSchema = new Schema(
  {
    field: { type: String, required: true, enum: ['nomCommercial', 'raisonSociale'] },
    value: { type: String, required: true },
  },
  { _id: false },
);

const outreachBatchResultSchema = new Schema(
  {
    id: { type: String, required: true },
    created: { type: Boolean, required: true },
    refusal: { type: String },
  },
  { _id: false },
);

const jobRunIdentitySchema = new Schema(
  {
    startedAt: { type: Date, required: true },
    auditId: { type: String, required: true },
  },
  { _id: false },
);

const jobSchema = new Schema<JobDocument>(
  {
    jobId: { type: String, required: true, unique: true },
    type: {
      type: String,
      required: true,
      enum: [
        'full-audit',
        'quick-check',
        'prospecting-audit',
        'prospecting',
        'outreach-draft-batch',
        'outreach-followup-batch',
        'outreach-full-scan',
      ],
    },
    status: {
      type: String,
      required: true,
      enum: [
        'queued',
        'running',
        'cancel-requested',
        'complete',
        'failed',
        'cancelled',
        'needs-input',
      ],
    },
    phase: {
      type: String,
      required: true,
      enum: [
        'queued',
        'crawl',
        'scan',
        'content-scan',
        'select-performance',
        'lighthouse',
        'normalize',
        'analyze-fr',
        'analyze-en',
        'report-fr',
        'report-en',
        'scanning',
        'drafting',
        'complete',
        'failed',
        'cancelled',
        'needs-input',
      ],
    },
    siteUrl: { type: String },
    urls: { type: [String] },
    options: { type: jobOptionsSchema, required: true, default: {} },
    createdAt: { type: Date, required: true },
    startedAt: { type: Date },
    runIdentity: { type: jobRunIdentitySchema },
    lastHeartbeatAt: { type: Date },
    finishedAt: { type: Date },
    auditId: { type: String },
    auditIds: { type: [String] },
    urlResults: { type: [urlResultSchema] },
    outreachBatchResults: { type: [outreachBatchResultSchema] },
    progress: { type: jobProgressSchema, required: true, default: {} },
    error: { type: String },
    failedPhase: { type: String },
    orphaned: { type: Boolean },
    needsReview: { type: String },
    needsInputFields: { type: [jobNeedsInputFieldSchema] },
    workerRevision: { type: String },
    claimId: { type: String },
    activeSlot: { type: String },
    queueOrder: { type: Number },
  },
  { collection: 'jobs' },
);

jobSchema.index({ status: 1, createdAt: 1 });
jobSchema.index({ status: 1, queueOrder: 1, _id: 1 });
jobSchema.index({ createdAt: -1 });
jobSchema.index({ 'options.prospectId': 1, createdAt: -1 });
// The prospect hub and deletion scopes also reach jobs through the audits
// they produced; without these the `$or` on audit links scans the collection.
jobSchema.index({ auditId: 1 }, { sparse: true });
jobSchema.index({ auditIds: 1 }, { sparse: true });
jobSchema.index(
  { activeSlot: 1 },
  { unique: true, partialFilterExpression: { activeSlot: { $exists: true } } },
);

export function createJobModel(connection: Connection): Model<JobDocument> {
  return connection.models['Job'] ?? connection.model<JobDocument>('Job', jobSchema);
}
