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

export type JobType = 'full-audit' | 'prospecting' | 'prospect-ingestion';
export type JobStatus = 'queued' | 'running' | 'complete' | 'failed';
export type JobPhase =
  | 'queued'
  | 'crawl'
  | 'scan'
  | 'normalize'
  | 'analyze-fr'
  | 'analyze-en'
  | 'report-fr'
  | 'report-en'
  | 'scanning'
  | 'afnic-scan'
  | 'fetch-qualify'
  | 'complete'
  | 'failed';

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

export type ProspectIngestionResultStatus = 'pending' | 'fetching' | 'no-siren' | 'qualified' | 'not-qualified' | 'error';

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

const jobSchema = new Schema<JobDocument>(
  {
    jobId: { type: String, required: true, unique: true },
    type: { type: String, required: true, enum: ['full-audit', 'prospecting', 'prospect-ingestion'] },
    status: { type: String, required: true, enum: ['queued', 'running', 'complete', 'failed'] },
    phase: {
      type: String,
      required: true,
      enum: [
        'queued',
        'crawl',
        'scan',
        'normalize',
        'analyze-fr',
        'analyze-en',
        'report-fr',
        'report-en',
        'scanning',
        'afnic-scan',
        'fetch-qualify',
        'complete',
        'failed',
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
    progress: { type: jobProgressSchema, required: true, default: {} },
    error: { type: String },
    orphaned: { type: Boolean },
    needsReview: { type: String },
  },
  { collection: 'jobs' },
);

jobSchema.index({ status: 1, createdAt: 1 });
jobSchema.index({ createdAt: -1 });

export function createJobModel(connection: Connection): Model<JobDocument> {
  return connection.models['Job'] ?? connection.model<JobDocument>('Job', jobSchema);
}
