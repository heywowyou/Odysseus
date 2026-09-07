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
import type { ProspectQualificationReason } from './prospect.schema.js';

export type JobType =
  | 'full-audit'
  | 'prospecting'
  | 'prospect-ingestion'
  | 'hotel-prescan'
  | 'outreach-draft-batch'
  | 'outreach-followup-batch';
export type JobStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled' | 'needs-input';
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
  | 'afnic-scan'
  | 'fetch-qualify'
  | 'prescanning'
  | 'drafting'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'needs-input';

export interface JobOptionsSnapshot {
  maxPages?: number;
  maxDepth?: number;
  delayMs?: number;
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
  /** prospect-ingestion jobs only: how many AFNIC candidates this batch
   *  targets. Absent falls back to DEFAULT_PROSPECT_BATCH_SIZE. */
  batchSize?: number;
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
  /** hotel-prescan jobs only (milestone 9c plan 004). Which slice of the
   *  catalogue this batch prescans, and at which rule versions, so a job
   *  document alone says what it did rather than depending on whatever the
   *  configured defaults happened to be when it ran. */
  resolutionVersion?: string;
  qualificationVersion?: string;
  prescanVersion?: string;
  /** Candidates in flight at once. Bounds browser work; it never shortens
   *  the delay between requests, which the shared per-origin lock and the
   *  crawl delay enforce independently. */
  concurrency?: number;
  /** Prescan candidates already measured at this prescan version. Absent
   *  means the default skip, which is what makes a re-run of an interrupted
   *  batch continue rather than start over. */
  rescan?: boolean;
  /** One named registrable domain to prescan. Recorded on the job so the
   *  document itself says which site was authorized, rather than leaving
   *  that to be inferred from whichever candidate happened to sort first. */
  domain?: string;
  /** outreach-draft-batch and outreach-followup-batch jobs only (milestone
   *  9c plan 030): maximum drafts/follow-ups this batch prepares, the same
   *  bound the CLI's own `--limit` has always used. */
  limit?: number;
  /** outreach-draft-batch jobs only. Follow-up drafts read the thread's own
   *  stored language instead - there is nothing to override. */
  language?: 'fr' | 'en';
}

export interface JobProgressCrawl {
  visited: number;
  target: number;
  effectiveDelayMs?: number;
  etaMs?: number;
}

export interface JobProgressScan {
  scanned: number;
  target: number;
  etaMs?: number;
}

export interface JobProgressAnalysisStage {
  completed: number;
  target: number;
  etaMs?: number;
}

export interface JobProgressContinuationGuard {
  omittedUrlCount: number;
  omittedFamilyCount: number;
}

/** prospect-ingestion jobs only: one bounded batch's worth of progress
 *  counters, never the cumulative total across every batch ever run - see
 *  ingestionResults below for why the same "one batch, not the whole
 *  AFNIC file" scoping applies. */
export interface JobProgressIngestion {
  afnicRowsScanned: number;
  candidatesFiltered: number;
  candidatesFetched: number;
  candidatesQualified: number;
  target: number;
  etaMs?: number;
}

export interface JobProgress {
  crawl?: JobProgressCrawl;
  scan?: JobProgressScan;
  contentScan?: JobProgressAnalysisStage;
  lighthouse?: JobProgressAnalysisStage;
  continuationGuard?: JobProgressContinuationGuard;
  ingestion?: JobProgressIngestion;
  message?: string;
}

export type UrlResultStatus = 'pending' | 'scanning' | 'complete' | 'skipped-non-html' | 'error';

export interface UrlResult {
  url: string;
  status: UrlResultStatus;
  auditId?: string;
  error?: string;
}

export type ProspectIngestionResultStatus =
  'pending' | 'fetching' | 'no-siren' | 'qualified' | 'not-qualified' | 'error';

/** One entry per candidate in the *current batch only* (default 2,000,
 *  ~100-200 bytes each), never one entry per AFNIC row ever seen - a job
 *  document only ever represents one bounded batch, the same
 *  boundedness urlResults already relies on for a prospecting job's URL
 *  list, so this never risks Mongo's 16MB document limit regardless of
 *  how many total AFNIC rows exist. */
export interface ProspectIngestionResult {
  domain: string;
  status: ProspectIngestionResultStatus;
  siren?: string;
  reasons?: ProspectQualificationReason[];
  error?: string;
}

/** One entry per item in the current outreach-draft-batch or
 *  outreach-followup-batch job only, same bounded-batch reasoning as
 *  ProspectIngestionResult above. `id` is a candidateId for a draft batch
 *  and a threadId for a follow-up batch - the two job types never mix, so
 *  one shared shape is enough rather than two near-identical ones. */
export interface OutreachBatchResult {
  id: string;
  created: boolean;
  refusal?: string;
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
  finishedAt?: Date;
  auditId?: string;
  auditIds?: string[];
  urlResults?: UrlResult[];
  ingestionResults?: ProspectIngestionResult[];
  outreachBatchResults?: OutreachBatchResult[];
  progress: JobProgress;
  error?: string;
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
}

export interface JobNeedsInputField {
  field: 'nomCommercial' | 'raisonSociale';
  value: string;
}

export type JobDocument = JobDocumentFields;

const jobOptionsSchema = new Schema(
  {
    maxPages: { type: Number },
    maxDepth: { type: Number },
    delayMs: { type: Number },
    siren: { type: String },
    transactionalFlow: { type: Boolean },
    transactionalFlowReason: { type: String },
    batchSize: { type: Number },
    seeds: { type: [String] },
    exclusions: { type: [String] },
    bookingEngineUrl: { type: String },
    resolutionVersion: { type: String },
    qualificationVersion: { type: String },
    prescanVersion: { type: String },
    concurrency: { type: Number },
    rescan: { type: Boolean },
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
  },
  { _id: false },
);

const jobProgressScanSchema = new Schema(
  {
    scanned: { type: Number, required: true },
    target: { type: Number, required: true },
    etaMs: { type: Number },
  },
  { _id: false },
);

const jobProgressAnalysisStageSchema = new Schema(
  {
    completed: { type: Number, required: true },
    target: { type: Number, required: true },
    etaMs: { type: Number },
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

const jobProgressIngestionSchema = new Schema(
  {
    afnicRowsScanned: { type: Number, required: true },
    candidatesFiltered: { type: Number, required: true },
    candidatesFetched: { type: Number, required: true },
    candidatesQualified: { type: Number, required: true },
    target: { type: Number, required: true },
    etaMs: { type: Number },
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
    ingestion: { type: jobProgressIngestionSchema },
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

const jobIngestionResultSchema = new Schema(
  {
    domain: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'fetching', 'no-siren', 'qualified', 'not-qualified', 'error'],
    },
    siren: { type: String },
    reasons: {
      type: [String],
      enum: [
        'no-siren-extracted',
        'siren-not-in-qualifying-sirene-set',
        'domain-suppressed',
        'no-qualifying-contact-address',
      ],
    },
    error: { type: String },
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

const jobSchema = new Schema<JobDocument>(
  {
    jobId: { type: String, required: true, unique: true },
    type: {
      type: String,
      required: true,
      enum: [
        'full-audit',
        'prospecting',
        'prospect-ingestion',
        'hotel-prescan',
        'outreach-draft-batch',
        'outreach-followup-batch',
      ],
    },
    status: {
      type: String,
      required: true,
      enum: ['queued', 'running', 'complete', 'failed', 'cancelled', 'needs-input'],
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
        'afnic-scan',
        'fetch-qualify',
        'prescanning',
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
    finishedAt: { type: Date },
    auditId: { type: String },
    auditIds: { type: [String] },
    urlResults: { type: [urlResultSchema] },
    ingestionResults: { type: [jobIngestionResultSchema] },
    outreachBatchResults: { type: [outreachBatchResultSchema] },
    progress: { type: jobProgressSchema, required: true, default: {} },
    error: { type: String },
    orphaned: { type: Boolean },
    needsReview: { type: String },
    needsInputFields: { type: [jobNeedsInputFieldSchema] },
  },
  { collection: 'jobs' },
);

jobSchema.index({ status: 1, createdAt: 1 });
jobSchema.index({ createdAt: -1 });

export function createJobModel(connection: Connection): Model<JobDocument> {
  return connection.models['Job'] ?? connection.model<JobDocument>('Job', jobSchema);
}
