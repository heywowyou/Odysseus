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
