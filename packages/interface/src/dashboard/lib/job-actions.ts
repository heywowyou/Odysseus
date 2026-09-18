import type { JobStatus } from './api-types';

/** Action availability of one scan row, the single source both the audits
 *  table and the progress page render from. Stop is offered while the job
 *  may still run (queued, running). A running stop first becomes
 *  cancel-requested and is not terminal until the worker confirms it has
 *  stopped. Delete is refused for both running and cancel-requested work so
 *  the operator never deletes a document a worker may still be writing. */
export function canStop(status: JobStatus): boolean {
  return status === 'queued' || status === 'running';
}

export function canDelete(status: JobStatus): boolean {
  return status !== 'running' && status !== 'cancel-requested';
}
