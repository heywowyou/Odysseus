import { createHash } from 'node:crypto';
import type { JobDocument, JobType } from '@odysseus/store';
import type { ActionCapability, CapabilityBlockReason } from './contract.js';

/**
 * Plan 061 §8-9: server-derived action capabilities for legacy queue-backed
 * scan jobs. The same function computes the capability shown in a read and
 * the capability rechecked at command time, so a button's state and the
 * mutation's guard cannot disagree.
 *
 * A state token is a digest of exactly the inputs that decide the action.
 * A change to one of them changes the token; an unrelated field (progress,
 * heartbeat) does not, so a poll tick never invalidates a click.
 */

/** Runners that check the cancellation registry at safe boundaries. */
const STOPPABLE_RUNNING_TYPES: ReadonlySet<JobType> = new Set([
  'full-audit',
  'quick-check',
  'prospecting-audit',
  'prospecting',
  'outreach-full-scan',
]);

export interface JobCapabilityInputs {
  job: Pick<JobDocument, 'jobId' | 'type' | 'status' | 'auditId' | 'auditIds'>;
  /** Process-local: the job's runner is still executing in this process.
   *  Retained as a delete input only during the plan-061 migration period. */
  inFlight: boolean;
  /** Process-local report-production lock for any of the job's audits. */
  reportProductionInFlight: boolean;
}

function token(action: string, parts: readonly unknown[]): string {
  return createHash('sha256')
    .update(JSON.stringify([action, ...parts]))
    .digest('base64url')
    .slice(0, 22);
}

/** The audit links the list and detail reads both carry, so a capability
 *  computed from a list row and one recomputed from the full row agree. */
function jobAuditIds(job: JobCapabilityInputs['job']): string[] {
  const ids = new Set<string>();
  if (job.auditId !== undefined) ids.add(job.auditId);
  for (const id of job.auditIds ?? []) ids.add(id);
  return [...ids].sort();
}

function blocked(
  stateToken: string,
  reasonCode: CapabilityBlockReason,
  workId?: string,
): ActionCapability {
  return {
    state: 'blocked',
    stateToken,
    reasonCode,
    ...(workId === undefined ? {} : { blockingRef: { workId } }),
  };
}

export function cancelJobCapability({ job }: JobCapabilityInputs): ActionCapability {
  const stateToken = token('cancel', [job.jobId, job.type, job.status]);
  switch (job.status) {
    case 'queued':
      return { state: 'available', stateToken, consequenceCode: 'removes-from-queue' };
    case 'running':
      return STOPPABLE_RUNNING_TYPES.has(job.type)
        ? { state: 'available', stateToken, consequenceCode: 'stops-at-safe-boundary' }
        : blocked(stateToken, 'not-stoppable');
    case 'cancel-requested':
      return blocked(stateToken, 'cancel-already-requested');
    default:
      return blocked(stateToken, 'already-terminal');
  }
}

export function deleteJobCapability(inputs: JobCapabilityInputs): ActionCapability {
  const { job, inFlight, reportProductionInFlight } = inputs;
  const auditIds = jobAuditIds(job);
  const stateToken = token('delete', [
    job.jobId,
    job.status,
    inFlight,
    reportProductionInFlight,
    auditIds,
  ]);
  if (job.status === 'running' || job.status === 'cancel-requested') {
    return blocked(stateToken, 'work-running', job.jobId);
  }
  // A stopped job's document can be terminal while its pipeline is still
  // letting go at the next stage boundary.
  if (inFlight) return blocked(stateToken, 'work-finishing', job.jobId);
  if (reportProductionInFlight) return blocked(stateToken, 'report-production-in-flight');
  return {
    state: 'available',
    stateToken,
    consequenceCode:
      job.status === 'queued' || auditIds.length === 0 ? 'deletes-history-only' : 'deletes-audits',
  };
}

export interface JobCapabilities {
  cancel: ActionCapability;
  delete: ActionCapability;
}

export function jobCapabilities(inputs: JobCapabilityInputs): JobCapabilities {
  return { cancel: cancelJobCapability(inputs), delete: deleteJobCapability(inputs) };
}
