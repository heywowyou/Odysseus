/** Mirror of the full-audit producer's ordered tuple
 *  (packages/interface/src/queue/pipeline/full-audit-phase-order.ts).
 *  The dashboard project reads no workspace packages, so the order is
 *  duplicated here by value and kept in step by
 *  packages/interface/src/queue/pipeline/phase-order.test.ts. */
export const FULL_AUDIT_PHASE_PIPELINE = [
  'queued',
  'crawl',
  'scan',
  'content-scan',
  'select-performance',
  'lighthouse',
  'normalize',
  'analyze-fr',
  'analyze-en',
  'report-fr',
  'report-en',
  'complete',
] as const;

/** Phases the dashboard has copy for that are not positions in the
 *  full-audit sequence: the prospecting phase, and the terminal failure
 *  phase. */
export const DASHBOARD_ONLY_PHASES = ['scanning', 'failed'] as const;
