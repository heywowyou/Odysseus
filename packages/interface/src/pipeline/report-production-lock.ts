/**
 * One in-process lock per audit for report production. Writing regeneration
 * and makeReportReady both renormalize the same audit directory and record
 * writing candidates, so either one running excludes the other. In memory on
 * purpose (trade-off 62): a restart forgets the run instead of stranding a
 * persisted lock. The API is synchronous so a caller can check and take the
 * lock with no await in between (issue #143).
 */

export type ReportProductionRun = 'writing' | 'report-ready' | 'job';

const runs = new Map<string, ReportProductionRun>();

/** Takes the audit's lock for this run, or returns false when any report
 *  production already holds it. */
export function tryAcquireReportProduction(auditId: string, run: ReportProductionRun): boolean {
  if (runs.has(auditId)) return false;
  runs.set(auditId, run);
  return true;
}

/** Frees the lock only when this run holds it, so a failure path of one
 *  producer can never release the other's run. Idempotent. */
export function releaseReportProduction(auditId: string, run: ReportProductionRun): void {
  if (runs.get(auditId) === run) runs.delete(auditId);
}

export function isReportProductionInFlight(auditId: string): boolean {
  return runs.has(auditId);
}

/** Lets a caller skip loading audits when nothing is being produced. */
export function isAnyReportProductionInFlight(): boolean {
  return runs.size > 0;
}

export function isWritingRegenerationInFlight(auditId: string): boolean {
  return runs.get(auditId) === 'writing';
}
