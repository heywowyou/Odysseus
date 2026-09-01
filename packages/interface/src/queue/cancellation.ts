/**
 * Cooperative cancellation for running jobs. The queue and the HTTP
 * handlers share one process, so a stop request needs no database polling
 * loop: the cancel route registers the jobId here, and each runner checks
 * the registry at its natural page boundaries (the scan progress reporter
 * for full audits, the worker loop for prospecting). The job document is
 * marked 'cancelled' in the same request, so the dashboard reflects the
 * stop immediately; the registry only decides when the in-flight pipeline
 * work itself aborts.
 */

/** Thrown by a runner once its stop request is seen. The queue's own
 *  catch distinguishes this from a pipeline failure so a stopped scan is
 *  never recorded as 'failed'. */
export class JobCancelledError extends Error {
  constructor(jobId: string) {
    super(`odysseus interface: job ${jobId} was cancelled by the operator`);
    this.name = 'JobCancelledError';
  }
}

export class CancellationRegistry {
  private readonly requested = new Set<string>();

  request(jobId: string): void {
    this.requested.add(jobId);
  }

  isRequested(jobId: string): boolean {
    return this.requested.has(jobId);
  }

  forget(jobId: string): void {
    this.requested.delete(jobId);
  }
}
