/**
 * Issue #219: one typed answer to "what can the operator do right now for
 * this prospect", computed from the same plans/gates the write routes
 * already use (planOutreachFullScan, planProspectJobLaunch) plus the
 * already-composed detail view - never a second, competing rule.
 *
 * Before this module, `hub-model.ts`'s hubPrimaryAction inferred the
 * create-first-email / prepare-follow-up / record-outcome states purely
 * from nullable thread/preview fields on the client, with no server
 * confirmation that the corresponding POST route would actually accept the
 * action. This file gives the GET response a `actions` field so the button
 * and the route it fires are never allowed to disagree.
 */

import type { ProspectActiveJob, ProspectActiveJobKind } from '../active-jobs.js';
import type { OperatorProspectDetail } from './prospect-detail.js';

export type ProspectHubActionability =
  | { state: 'available' }
  | { state: 'running'; jobId: string }
  | { state: 'blocked'; reason: string }
  | { state: 'complete' };

export interface ProspectHubActions {
  refreshProspect: ProspectHubActionability;
  runQuickCheck: ProspectHubActionability;
  runProspectingAudit: ProspectHubActionability;
  runFullAudit: ProspectHubActionability;
  publishPreview: ProspectHubActionability;
  createFirstEmail: ProspectHubActionability;
  createFollowUp: ProspectHubActionability;
  recordOutcome: ProspectHubActionability;
}

/** Same rule as the dashboard's canGenerateFollowUp
 *  (dashboard/routes/prospects-model.ts): a follow-up is only offered right
 *  after touch 1 or touch 2 was sent, with the sequence still open.
 *  Duplicated here (not imported) because store must not depend on
 *  interface; the rule is a five-line pure predicate, not a gate with side
 *  effects, so the duplication carries none of the drift risk the job
 *  conflict rules did before #220. */
function canGenerateFollowUp(threadState: string): boolean {
  return threadState === 'e1-sent' || threadState === 'e2-sent';
}

function runningJob(
  activeJobs: readonly ProspectActiveJob[],
  kind: ProspectActiveJobKind,
): ProspectHubActionability | null {
  const job = activeJobs.find((candidate) => candidate.kind === kind);
  return job === undefined ? null : { state: 'running', jobId: job.jobId };
}

export interface ComputeHubActionsInput {
  detail: OperatorProspectDetail;
  /** Every job #220's projection currently sees for this candidate. */
  activeJobs: readonly ProspectActiveJob[];
  /** The same object GET/POST outreach/full-scan already compute via
   *  planOutreachFullScan, or undefined if that plan could not be computed
   *  (fails closed to 'blocked', never silently 'available'). */
  outreachScanPlan:
    { refused: string; conflictingJobId?: string } | { refused?: undefined } | undefined;
  /** The same object GET/POST full-audit already compute via
   *  planFullAudit/planProspectJobLaunch. */
  fullAuditPlan: { canStart: true } | { canStart: false; refusal: string } | undefined;
  /** The same object GET/POST /prescan already compute via planQuickCheck
   *  - not qualification-independent: unlike planFullAudit, this refuses
   *  'not-qualified'/'qualification-not-current' too, matching
   *  listCandidatesToPrescan's own filter, or undefined if not computed. */
  quickCheckPlan: { canStart: true } | { canStart: false; refusal: string } | undefined;
  /** Whether the candidate has a linked outreach audit (getOutreachAuditStatus
   *  .audit !== null) - not part of OperatorProspectDetail, composed
   *  separately by the route, same as activeJobs. */
  hasAudit: boolean;
}

/** Fails closed: any input that was not actually computed (an optional
 *  sub-read that failed, or a caller that forgot to pass it) reads as
 *  blocked, never as silently available (issue #219 regression
 *  requirement 8). */
export function computeHubActions(input: ComputeHubActionsInput): ProspectHubActions {
  const { detail, activeJobs, outreachScanPlan, fullAuditPlan, quickCheckPlan, hasAudit } = input;

  const freshnessNeedsWork =
    detail.qualificationFreshness.state === 'missing' ||
    detail.qualificationFreshness.state === 'stale' ||
    detail.prescanFreshness.state === 'missing' ||
    detail.prescanFreshness.state === 'stale' ||
    detail.scoreFreshness.state === 'missing' ||
    detail.scoreFreshness.state === 'stale';
  const refreshProspect: ProspectHubActionability = freshnessNeedsWork
    ? { state: 'available' }
    : { state: 'complete' };

  const runQuickCheck: ProspectHubActionability =
    runningJob(activeJobs, 'quick-check') ??
    (quickCheckPlan === undefined
      ? { state: 'blocked', reason: 'unknown' }
      : quickCheckPlan.canStart
        ? { state: 'available' }
        : { state: 'blocked', reason: quickCheckPlan.refusal });

  const runProspectingAudit: ProspectHubActionability =
    runningJob(activeJobs, 'prospecting-audit') ??
    (outreachScanPlan === undefined
      ? { state: 'blocked', reason: 'unknown' }
      : outreachScanPlan.refused === undefined
        ? { state: 'available' }
        : { state: 'blocked', reason: outreachScanPlan.refused });

  const runFullAudit: ProspectHubActionability =
    runningJob(activeJobs, 'full-audit') ??
    (fullAuditPlan === undefined
      ? { state: 'blocked', reason: 'unknown' }
      : fullAuditPlan.canStart
        ? { state: 'available' }
        : { state: 'blocked', reason: fullAuditPlan.refusal });

  return {
    refreshProspect,
    runQuickCheck,
    runProspectingAudit,
    runFullAudit,
    publishPreview: publishPreviewActionability(detail, hasAudit),
    createFirstEmail: createFirstEmailActionability(detail, hasAudit),
    createFollowUp: createFollowUpActionability(detail),
    recordOutcome: recordOutcomeActionability(detail),
  };
}

/** No dedicated publish route exists yet: publishing happens bundled into
 *  createFirstEmail (plan 045 section 1.7). This mirrors that same
 *  condition rather than inventing a second one, and reports 'complete'
 *  once a live preview already exists. */
function publishPreviewActionability(
  detail: OperatorProspectDetail,
  hasAudit: boolean,
): ProspectHubActionability {
  if (!hasAudit) return { state: 'blocked', reason: 'no-audit' };
  if (detail.preview !== null && detail.preview.status === 'live') return { state: 'complete' };
  return { state: 'available' };
}

function createFirstEmailActionability(
  detail: OperatorProspectDetail,
  hasAudit: boolean,
): ProspectHubActionability {
  if (detail.thread !== null) return { state: 'complete' };
  if (!hasAudit) return { state: 'blocked', reason: 'no-audit' };
  return { state: 'available' };
}

function createFollowUpActionability(detail: OperatorProspectDetail): ProspectHubActionability {
  if (detail.thread === null) return { state: 'blocked', reason: 'no-thread' };
  if (canGenerateFollowUp(detail.thread.state)) return { state: 'available' };
  return { state: 'blocked', reason: 'wrong-thread-state' };
}

function recordOutcomeActionability(detail: OperatorProspectDetail): ProspectHubActionability {
  if (detail.thread === null) return { state: 'blocked', reason: 'no-thread' };
  if (detail.thread.currentOutcome !== null) return { state: 'complete' };
  if (detail.thread.state === 'replied' || detail.thread.needsReview !== null) {
    return { state: 'available' };
  }
  return { state: 'blocked', reason: 'no-reply-yet' };
}
