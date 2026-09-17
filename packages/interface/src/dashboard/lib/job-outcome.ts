import type { JobStatus } from './api-types';

/** Issue #386: a failed Full Scan whose audit was saved did not fail as a
 *  scan. Its site was crawled, checked and stored; only writing the report
 *  or producing the PDFs stopped. The audits list, its KPIs and filter, and
 *  the progress page all read this one classifier so they cannot disagree
 *  (the #380 principle). */
export type DisplayJobStatus = JobStatus | 'report-issue';

/** Which report step failed. 'unknown' is a legacy row failed before the
 *  job kept its failed phase. */
export type ReportFailureStage = 'writing' | 'pdf' | 'unknown';

export interface JobOutcomeFields {
  type: string;
  status: JobStatus;
  auditId?: string | undefined;
  failedPhase?: string | undefined;
}

const WRITING_PHASES: readonly string[] = ['analyze-fr', 'analyze-en'];
const PDF_PHASES: readonly string[] = ['report-fr', 'report-en'];

/** The report step a failed job stopped in, or null when the job is not a
 *  report-stage failure. Structural only, never a match on error text (the
 *  #382 rule): the kept phase decides, and a legacy failed full-audit row
 *  without one counts when it carries its auditId, which the runner writes
 *  only after the audit is saved. */
export function reportFailureStage(job: JobOutcomeFields): ReportFailureStage | null {
  if (job.status !== 'failed') return null;
  if (job.failedPhase !== undefined) {
    if (WRITING_PHASES.includes(job.failedPhase)) return 'writing';
    if (PDF_PHASES.includes(job.failedPhase)) return 'pdf';
    return null;
  }
  return job.type === 'full-audit' && job.auditId !== undefined ? 'unknown' : null;
}

export function displayJobStatus(
  job: JobOutcomeFields & { awaitsInput?: boolean | undefined },
): DisplayJobStatus {
  // Issue #382: a legacy failed row written with typed input fields.
  if (job.status === 'failed' && job.awaitsInput === true) return 'needs-input';
  if (reportFailureStage(job) !== null) return 'report-issue';
  return job.status;
}
