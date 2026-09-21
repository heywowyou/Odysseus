import type { AuditPass, AuditPassCoverage, PageAnalysisCoverage } from '@odysseus/core';
import { CHECK_SCOPE_REGISTRY, type CheckExecutionOutcome } from './check-scope-coverage.js';
import { FULL_AUDIT_PLANNER_VERSION, type PageAuditDecision } from './full-audit-plan.js';

type CheckOutcomes = Readonly<Partial<Record<string, CheckExecutionOutcome>>>;

function deriveCompositePass(
  pass: Exclude<AuditPass, 'lighthouse'>,
  checkOutcomes: CheckOutcomes,
): AuditPassCoverage {
  const entries = CHECK_SCOPE_REGISTRY.filter(
    (entry) => entry.pass === pass && entry.scope !== 'site',
  );
  const applicable = entries.flatMap((entry) => {
    const outcome = checkOutcomes[entry.id];
    return outcome === undefined || outcome === 'not-applicable' ? [] : [{ id: entry.id, outcome }];
  });
  const failedCheckIds = applicable
    .filter((entry) => entry.outcome === 'failed')
    .map((entry) => entry.id)
    .sort();
  const completedCount = applicable.filter((entry) => entry.outcome === 'completed').length;

  if (failedCheckIds.length === 0 && completedCount > 0) {
    return { outcome: 'completed' };
  }
  if (failedCheckIds.length > 0 && completedCount > 0) {
    return { outcome: 'partial', failedCheckIds };
  }
  return {
    outcome: 'failed',
    ...(failedCheckIds.length > 0 ? { failedCheckIds } : {}),
  };
}

export interface DerivePageAnalysisCoverageInput {
  decision: PageAuditDecision;
  checkOutcomes: CheckOutcomes;
  lighthouseSelected: boolean;
  lighthouseOutcome?: Exclude<CheckExecutionOutcome, 'not-applicable'>;
}

/** Collapses explicit scanner-check outcomes into the bounded persisted
 * pass record. Site-scoped checks do not gate an individual page's rendered
 * outcome; their detailed results remain attached to the homepage artifact. */
export function derivePageAnalysisCoverage(
  input: DerivePageAnalysisCoverageInput,
): PageAnalysisCoverage {
  let lighthouse: AuditPassCoverage;
  if (!input.lighthouseSelected) {
    lighthouse = { outcome: 'not-planned' };
  } else if (input.lighthouseOutcome === 'completed') {
    lighthouse = { outcome: 'completed' };
  } else {
    lighthouse = { outcome: 'failed', failedCheckIds: ['lighthouse'] };
  }

  return {
    plannerVersion: FULL_AUDIT_PLANNER_VERSION,
    role: input.decision.role,
    confidence: input.decision.confidence,
    ...(input.decision.templateFamilyId !== undefined
      ? { templateFamilyId: input.decision.templateFamilyId }
      : {}),
    reasonCodes: [...input.decision.reasonCodes],
    passes: {
      rendered: deriveCompositePass('rendered', input.checkOutcomes),
      axe: deriveCompositePass('axe', input.checkOutcomes),
      extended: deriveCompositePass('extended', input.checkOutcomes),
      lighthouse,
    },
  };
}
