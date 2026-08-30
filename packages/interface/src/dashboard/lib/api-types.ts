export type JobStatus = 'queued' | 'running' | 'complete' | 'failed';
export type JobType = 'full-audit' | 'prospecting';

export interface SeverityRollup {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
}

/** One row of GET /api/scans (routes/scans.ts). Field names are the API's
 *  persisted contract, not UI vocabulary; never respell them. */
export interface ScanSummary {
  jobId: string;
  type: JobType;
  status: JobStatus;
  phase: string;
  siteUrl?: string;
  urls?: string[];
  createdAt: string;
  finishedAt?: string;
  auditId?: string;
  auditIds?: string[];
  severityRollup?: SeverityRollup;
  needsReview?: boolean;
}

/** Response of POST /api/scans. */
export interface ScanCreated {
  jobId: string;
}

/** Progress counters of GET /api/scans/:jobId (the Job document's progress
 *  sub-document, store's job.schema.ts). Only the fields the live progress
 *  page reads; the ingestion counters belong to prospect-ingestion jobs,
 *  which this page does not render. */
export interface ScanJobProgress {
  crawl?: { visited: number; target: number; etaMs?: number };
  scan?: { scanned: number; target: number; etaMs?: number };
  message?: string;
}

/** One per-URL row of a prospecting job (store's UrlResult). status stays
 *  a plain string so a worker status the page does not know degrades to a
 *  neutral in-flight badge instead of breaking the page. */
export interface ScanUrlResult {
  url: string;
  status: string;
  auditId?: string;
  error?: string;
}

/** Response of GET /api/scans/:jobId: the full job document (store's
 *  getJob, served verbatim by routes/scans.ts), narrowed to the fields the
 *  live progress page reads. phase stays a plain string so a pipeline
 *  phase without dashboard copy renders as its raw value. */
export interface ScanJobDetail {
  jobId: string;
  type: JobType;
  status: JobStatus;
  phase: string;
  auditId?: string;
  auditIds?: string[];
  urlResults?: ScanUrlResult[];
  progress: ScanJobProgress;
  error?: string;
}
