import type { JobDocument, JobStatus } from '@odysseus/store';

/**
 * Plan 060 §5.3: the server is the semantic boundary for scan state, so the
 * display classification the Audits list and the progress page show is
 * computed here, from the same persisted facts the routes already load, and
 * shipped as stable codes. The browser only translates these codes and never
 * re-derives them from raw fields (plan 060 §16, verification matrix).
 *
 * The closed set, with exactly the semantics the dashboard's former
 * client-side classifier applied (issues #382, #386, #389):
 *
 * - `queued` / `running` / `cancel-requested` / `complete` / `failed` /
 *   `cancelled` / `needs-input`: the job's own run state, verbatim;
 * - `needs-input`: a failed job that carries typed operator-input fields -
 *   its blocked work is confirmation, not debugging;
 * - `report-issue`: the scan itself succeeded, only its client report is
 *   broken - a failed job whose failed phase is a report phase, a legacy
 *   failed full-audit row carrying its auditId (the runner writes that link
 *   only after the audit is saved), or a complete job whose reports are no
 *   longer ready (a failed regeneration lives on the audit, not the job).
 */
export type ScanOutcomeCode = JobStatus | 'report-issue';

/** Which report step a `report-issue` failure stopped in. `unknown` is a
 *  legacy row failed before the job kept its failed phase. */
export type ScanReportFailureStage = 'writing' | 'pdf' | 'unknown';

const WRITING_PHASES: readonly NonNullable<JobDocument['failedPhase']>[] = [
  'analyze-fr',
  'analyze-en',
];
const PDF_PHASES: readonly NonNullable<JobDocument['failedPhase']>[] = ['report-fr', 'report-en'];

/** The report step a failed job stopped in, or null when the job is not a
 *  report-stage failure. Structural only, never a match on error text (the
 *  #382 rule): the kept phase decides, and a legacy failed full-audit row
 *  without one counts when it carries its auditId. */
export function reportFailureStageOf(job: {
  status: JobDocument['status'];
  type: JobDocument['type'];
  auditId?: string | undefined;
  failedPhase?: JobDocument['failedPhase'] | undefined;
}): ScanReportFailureStage | null {
  if (job.status !== 'failed') return null;
  if (job.failedPhase !== undefined) {
    if (WRITING_PHASES.includes(job.failedPhase)) return 'writing';
    if (PDF_PHASES.includes(job.failedPhase)) return 'pdf';
    return null;
  }
  return job.type === 'full-audit' && job.auditId !== undefined ? 'unknown' : null;
}

export interface ScanOutcomeFacts {
  type: JobDocument['type'];
  status: JobDocument['status'];
  auditId?: string;
  failedPhase?: JobDocument['failedPhase'];
  /** Typed operator-input fields exist on the job (issue #382). */
  awaitsInput?: boolean;
  /** The route's own unready-report verdict for a completed row (issue #389). */
  reportNotReady?: boolean;
}

/** The display code a row presents, computed where the truth lives. Same
 *  classification for every list-like and per-job read, so the Audits list,
 *  its KPIs and filter, and the progress page cannot disagree (the #380
 *  principle). */
export function scanOutcomeCode(facts: ScanOutcomeFacts): ScanOutcomeCode {
  if (facts.status === 'failed' && facts.awaitsInput === true) return 'needs-input';
  if (reportFailureStageOf(facts) !== null) return 'report-issue';
  if (facts.status === 'complete' && facts.reportNotReady === true) return 'report-issue';
  return facts.status;
}
