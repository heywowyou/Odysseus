/**
 * Pure logic behind GET /api/todo (plan 045 stage 3.3): which of the
 * bounded recent jobs the audit row of the merged to-do table covers, and
 * which single action an audit still needs. Kept separate from todo.ts so
 * this can be unit-tested without a database, the same split the dashboard
 * side uses for its route models.
 */

import type { JobStatus } from '@odysseus/store';

/** Issue #90's own display rule, ported server-side from the dashboard's
 *  listStatus (audits-model.ts): a full-audit job that failed after its
 *  audit was persisted failed at the analysis or report stage, not the
 *  crawl, so it still needs an operator decision on the audit page. Only a
 *  job with a persisted audit can appear on the to-do table at all - a
 *  crawl failure with no audit belongs on the scans list, not here. */
export function isNeedsInputJob(job: { status: JobStatus; auditId?: string }): boolean {
  return job.status === 'needs-input' || (job.status === 'failed' && job.auditId !== undefined);
}

export type TodoAuditAction = 'confirm-identity' | 'generate-pdfs' | 'approve-pair';

/** The one action an audit still needs, in the order confirming unblocks
 *  the next: an unconfirmed identity field is worth surfacing on its own
 *  even though confirming it can auto-trigger PDF generation (plan 045
 *  slice 1.3), so a row here never asks for two things at once. Null means
 *  every known gate is already clear - the row does not belong on the
 *  table at all. */
export function auditTodoAction(input: {
  hasUnconfirmedIdentityFields: boolean;
  hasNoReportLanguages: boolean;
  hasNoApproval: boolean;
}): TodoAuditAction | null {
  if (input.hasUnconfirmedIdentityFields) return 'confirm-identity';
  if (input.hasNoReportLanguages) return 'generate-pdfs';
  if (input.hasNoApproval) return 'approve-pair';
  return null;
}
