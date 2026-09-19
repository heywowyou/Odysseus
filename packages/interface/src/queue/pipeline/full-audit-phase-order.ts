import type { JobPhase } from '@odysseus/store';

/** The full-audit pipeline's phases in execution order. The runner writes
 *  them via run-full-audit-job.ts and queue/report-progress.ts; the job is
 *  created 'queued' in @odysseus/store and completed via completeJob. Kept
 *  in step with the dashboard's copy by
 *  packages/interface/src/queue/pipeline/phase-order.test.ts. */
export const FULL_AUDIT_PHASE_ORDER = [
  'queued',
  'crawl',
  'scan',
  'content-scan',
  'select-performance',
  'lighthouse',
  'normalize',
  'analyze-fr',
  'report-fr',
  'complete',
] as const satisfies readonly JobPhase[];
