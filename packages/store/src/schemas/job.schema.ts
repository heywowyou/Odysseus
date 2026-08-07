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

export type JobType = 'full-audit' | 'prospecting';
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

export interface JobProgress {
  crawl?: JobProgressCrawl;
  scan?: JobProgressScan;
  message?: string;
}

export type UrlResultStatus = 'pending' | 'scanning' | 'complete' | 'skipped-non-html' | 'error';

export interface UrlResult {
  url: string;
  status: UrlResultStatus;
  auditId?: string;
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
  progress: JobProgress;
  error?: string;
  orphaned?: boolean;
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

const jobProgressSchema = new Schema(
  {
    crawl: { type: jobProgressCrawlSchema },
    scan: { type: jobProgressScanSchema },
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

const jobSchema = new Schema<JobDocument>(
  {
    jobId: { type: String, required: true, unique: true },
    type: { type: String, required: true, enum: ['full-audit', 'prospecting'] },
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
    progress: { type: jobProgressSchema, required: true, default: {} },
    error: { type: String },
    orphaned: { type: Boolean },
  },
  { collection: 'jobs' },
);

jobSchema.index({ status: 1, createdAt: 1 });
jobSchema.index({ createdAt: -1 });

export function createJobModel(connection: Connection): Model<JobDocument> {
  return connection.models['Job'] ?? connection.model<JobDocument>('Job', jobSchema);
}
