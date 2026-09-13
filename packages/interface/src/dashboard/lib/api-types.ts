export type JobStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled' | 'needs-input';
/** Job types the dashboard can be asked to display. 'outreach-full-scan'
 *  is the prospect-linked full scan the hub starts; it is a display
 *  union only, the API names are never respelled. */
export type JobType = 'full-audit' | 'prospecting' | 'hotel-prescan' | 'outreach-full-scan';

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
  /** Plan 042 slice 4: the hotel a prospect-linked job works for, and
   *  its display name. The name is absent when the candidate no longer
   *  resolves; the id alone is still the hub link's target. */
  outreachCandidateId?: string;
  outreachCandidateName?: string;
}

/** Response of POST /api/scans. */
export interface ScanCreated {
  jobId: string;
}

/** The four sources GET /api/todo composes into one table (plan 045 stage
 *  3.3). `action` is a stable code, never ready-made text, so FR/EN copy
 *  stays in the client's own i18n table (aTraiter.actions). */
export type TodoRowKind = 'draft' | 'reply' | 'hotel' | 'audit';
export type TodoRowAction =
  | 'review-draft'
  | 'review-reply'
  | 'review-hotel'
  | 'confirm-identity'
  | 'generate-pdfs'
  | 'approve-pair';

/** One row of GET /api/todo (routes/todo.ts). Field names are the API's
 *  persisted contract, not UI vocabulary; never respell them. */
export interface TodoRow {
  kind: TodoRowKind;
  subject: string;
  action: TodoRowAction;
  href: string;
  since: string | null;
}

/** Response of GET /api/todo. */
export interface TodoPage {
  rows: TodoRow[];
}

/** Progress counters of GET /api/scans/:jobId (the Job document's progress
 *  sub-document, store's job.schema.ts). Only the fields the live progress
 *  page reads; the ingestion counters belong to prospect-ingestion jobs,
 *  which this page does not render. */
export interface ScanJobProgress {
  crawl?: { visited: number; target: number; etaMs?: number };
  scan?: { scanned: number; target: number; etaMs?: number };
  contentScan?: { completed: number; target: number; etaMs?: number };
  lighthouse?: { completed: number; target: number; etaMs?: number };
  continuationGuard?: { omittedUrlCount: number; omittedFamilyCount: number };
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
 *  phase without dashboard copy renders as its raw value.
 *
 *  siteUrl and createdAt are served by the same route (it sends the job
 *  document verbatim) and are read here so the progress page can name the
 *  site it is scanning; both stay optional because a prospecting job has a
 *  URL list rather than one site. */
export interface ScanJobDetail {
  jobId: string;
  type: JobType;
  status: JobStatus;
  phase: string;
  siteUrl?: string;
  createdAt?: string;
  auditId?: string;
  auditIds?: string[];
  urlResults?: ScanUrlResult[];
  progress: ScanJobProgress;
  error?: string;
  /** Issue #73: present only when status is 'needs-input' - which detected
   *  identity fields the D8 report gate is waiting to have confirmed. */
  needsInputFields?: ScanJobNeedsInputField[];
}

export interface ScanJobNeedsInputField {
  field: string;
  value: string;
}
