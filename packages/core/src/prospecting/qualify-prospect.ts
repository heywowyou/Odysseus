/**
 * The prospect-qualification predicate. Deterministic, no LLM, same
 * architectural posture as ../compliance/assessObligations.ts: pure,
 * synchronous, handed already-resolved facts, and does only the
 * AND-of-conditions decision - it never itself reads the NAF allowlist,
 * the effectifs code table, or the suppression collection. That
 * resolution happens upstream (packages/interface's
 * run-prospect-ingestion-job.ts), the same way obligation-stage.ts
 * resolves a SIREN and calls assessObligations with a plain profile.
 *
 * Conditions 1-3 of docs/rules/prospect-qualification.md section 3
 * (etatAdministratif active, headcount >=10, NAF in the allowlist)
 * collapse into one check here - sireneMatch !== null - because the
 * Sirene index that produces SireneIndexEntry values is already filtered
 * to active + NAF-allowlisted + effectifs-qualifying rows by
 * construction (see packages/interface's sirene-stock-index.ts). NAF is
 * a recall filter narrowing which stock rows ever get indexed, never
 * evidence of "has a checkout" by itself - see naf-allowlist.ts's own
 * doc comment and docs/rules/prospect-qualification.md section 4.
 */

import type {
  ProspectQualificationInput,
  ProspectQualificationResult,
} from '../types/prospecting.js';

export function qualifyProspect(input: ProspectQualificationInput): ProspectQualificationResult {
  const reasons: ProspectQualificationResult['reasons'] = [];

  if (input.siren === null) {
    reasons.push('no-siren-extracted');
  }
  if (input.sireneMatch === null) {
    reasons.push('siren-not-in-qualifying-sirene-set');
  }
  if (input.domainSuppressed) {
    reasons.push('domain-suppressed');
  }
  if (input.contactAddress === null) {
    reasons.push('no-qualifying-contact-address');
  }

  return { qualified: reasons.length === 0, reasons };
}
