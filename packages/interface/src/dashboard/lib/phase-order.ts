import {
  DASHBOARD_ONLY_PHASES,
  FULL_AUDIT_PHASE_PIPELINE,
} from '../fixtures/full-audit-phase-order.js';

/** Every phase the dashboard has operator copy for. Order is not
 *  significant here (consumers use membership); the copy table is
 *  DashboardStrings['progress']['phaseLabels']. */
export const PHASE_KEYS = [...FULL_AUDIT_PHASE_PIPELINE, ...DASHBOARD_ONLY_PHASES] as const;

export type ProgressPhase = (typeof PHASE_KEYS)[number];

/** Everything strictly after 'content-scan' in the pipeline order pins the
 *  content bar; ditto 'lighthouse' for the lighthouse bar. Derived, not
 *  hand-listed, so an inserted phase can no longer leave the bars at 0.
 *  Typed as string sets because callers test raw job.phase strings against
 *  them: a phase without dashboard copy still needs a bar decision. */
export const AFTER_CONTENT_PHASES: ReadonlySet<string> = new Set(
  FULL_AUDIT_PHASE_PIPELINE.slice(FULL_AUDIT_PHASE_PIPELINE.indexOf('content-scan') + 1),
);

export const AFTER_LIGHTHOUSE_PHASES: ReadonlySet<string> = new Set(
  FULL_AUDIT_PHASE_PIPELINE.slice(FULL_AUDIT_PHASE_PIPELINE.indexOf('lighthouse') + 1),
);
