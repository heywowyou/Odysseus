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
  'report-fr',
  'complete',
] as const;

/** English phases older jobs still carry from before full audits became
 *  French-only (Plan 067). No longer written, but they sit after the
 *  lighthouse pass, so the progress bars treat them like the French ones. */
export const LEGACY_ENGLISH_PHASES = ['analyze-en', 'report-en'] as const;

/** Phases the dashboard has copy for that are not positions in the
 *  full-audit sequence: the prospecting phase, the terminal failure
 *  phase, and the legacy English phases. */
export const DASHBOARD_ONLY_PHASES = ['scanning', 'failed', ...LEGACY_ENGLISH_PHASES] as const;
