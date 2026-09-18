import type { ReportQualityRole } from '@odysseus/core';
import { REPORT_MODEL_PROFILES } from './report-model-profiles.js';

/**
 * Plan 058 §6.1: the model-profile matrix and this benchmark manifest are
 * release artifacts. Every production profile names one corpus approval here,
 * and that approval must be `current` before a quality-approved bundle may be
 * promoted to production. A quality run is not production-promotable merely
 * because a model string is configured.
 *
 * An approval becomes `current` only when the mandatory saved-corpus benchmark
 * (Plan 058 §19) has been rerun after the last profile, model, reasoning,
 * prompt, or schema change, with the outcome recorded in the committed
 * benchmark artifact named by `artifactRef`. Any such change reopens the
 * approval as `stale` (or re-enters `pending`) until the corpus is rerun.
 */
export interface ReportProfileBenchmarkApproval {
  benchmarkApprovalId: string;
  corpusId: string;
  corpusVersion: string;
  status: 'current' | 'pending' | 'stale';
  /** When the corpus run that produced this approval finished (ISO 8601). */
  ranAt?: string;
  /** Committed artifact recording the run's outcomes (never client prose). */
  artifactRef?: string;
  notes?: string;
}

export const REPORT_PROFILE_BENCHMARK_MANIFEST = {
  '058-saved-corpus-2026-09': {
    benchmarkApprovalId: '058-saved-corpus-2026-09',
    corpusId: 'plan-058-saved-corpus',
    corpusVersion: '2026-09',
    status: 'pending',
    notes:
      'Awaiting the mandatory saved-corpus benchmark run (Plan 058 §19/§23), ' +
      'including Hôtel Point France. Production promotion stays blocked while ' +
      'this approval is not current.',
  },
} satisfies Record<string, ReportProfileBenchmarkApproval>;

export class ReportProfileBenchmarkNotCurrentError extends Error {
  constructor(
    pending: { benchmarkApprovalId: string; roles: ReportQualityRole[]; status: string }[],
  ) {
    super(
      'Plan 058 production promotion is blocked: model-profile benchmark ' +
        'approvals are not current — ' +
        pending
          .map(
            (entry) =>
              `${entry.benchmarkApprovalId} (${entry.status}; roles: ${entry.roles.join(', ')})`,
          )
          .join('; '),
    );
    this.name = 'ReportProfileBenchmarkNotCurrentError';
  }
}

/** Returns every manifest approval that is not `current`, together with the
 *  roles whose profiles depend on it. Empty when production promotion is
 *  allowed. */
export function findStaleReportProfileBenchmarks(
  manifest: Record<string, ReportProfileBenchmarkApproval> = REPORT_PROFILE_BENCHMARK_MANIFEST,
): { benchmarkApprovalId: string; roles: ReportQualityRole[]; status: string }[] {
  const byApproval = new Map<string, ReportQualityRole[]>();
  for (const profile of Object.values(REPORT_MODEL_PROFILES)) {
    const roles = byApproval.get(profile.benchmarkApprovalId) ?? [];
    roles.push(profile.role);
    byApproval.set(profile.benchmarkApprovalId, roles);
  }
  const stale: { benchmarkApprovalId: string; roles: ReportQualityRole[]; status: string }[] = [];
  for (const [approvalId, roles] of byApproval) {
    const approval = manifest[approvalId];
    if (!approval || approval.status !== 'current') {
      stale.push({ benchmarkApprovalId: approvalId, roles, status: approval?.status ?? 'missing' });
    }
  }
  return stale;
}

/** Fail-closed preflight for the production promotion boundary: refuses while
 *  any role's corpus approval is pending, stale, or missing from the
 *  manifest. */
export function assertProductionProfileBenchmarksCurrent(
  manifest: Record<string, ReportProfileBenchmarkApproval> = REPORT_PROFILE_BENCHMARK_MANIFEST,
): void {
  const stale = findStaleReportProfileBenchmarks(manifest);
  if (stale.length > 0) throw new ReportProfileBenchmarkNotCurrentError(stale);
}
