import type { JobStatus } from './api-types';

/** Action availability of one scan row, the single source both the audits
 *  table and the progress page render from. Stop is offered while the job
 *  may still run (queued, running); the server marks the job cancelled and
 *  the stop takes effect at the end of the page in flight. Delete is
 *  refused only for a running job, which must be stopped first, so the
 *  operator never deletes a document the worker is still writing to. */
export function canStop(status: JobStatus): boolean {
  return status === 'queued' || status === 'running';
}

export function canDelete(status: JobStatus): boolean {
  return status !== 'running';
}
