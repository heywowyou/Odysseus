/**
 * Milestone 10 stage 1 qualification predicate for the benchmark cohort.
 * Same architectural posture as ../prospecting/qualify-prospect.ts (pure,
 * synchronous, handed already-resolved facts), and a deliberately separate
 * function rather than a reuse of qualifyProspect: the benchmark permission
 * record (docs/product/milestone-10-benchmark-permission-record.md section
 * 3) forbids contact-address discovery for this cohort, so this predicate
 * has no contact-address condition and must never grow one without a fresh
 * permission record.
 *
 * Conditions 1-3 of docs/rules/prospect-qualification.md section 3
 * (etatAdministratif active, headcount >=10, NAF in the targeted set)
 * collapse into sireneMatch !== null for the same reason qualify-prospect.ts
 * states: the Sirene index that produces SireneIndexEntry values is already
 * filtered to active + NAF-allowlisted + effectifs-qualifying rows by
 * construction. The benchmark's NAF filter is the division-47 extension
 * approved for this cohort only (permission record decision 2, option B),
 * not the outreach allowlist.
 */

import type { SireneIndexEntry } from '../types/prospecting.js';

export type BenchmarkQualificationFailureReason =
  'no-siren-extracted' | 'siren-not-in-qualifying-sirene-set' | 'domain-suppressed';

export interface BenchmarkQualificationInput {
  sireneMatch: SireneIndexEntry | null;
  siren: string | null;
  domainSuppressed: boolean;
}

export interface BenchmarkQualificationResult {
  qualified: boolean;
  /** Empty iff qualified. Accumulates every failing condition rather than
   *  short-circuiting on the first, matching qualifyProspect's reasoning. */
  reasons: BenchmarkQualificationFailureReason[];
}

export function qualifyBenchmarkCandidate(
  input: BenchmarkQualificationInput,
): BenchmarkQualificationResult {
  const reasons: BenchmarkQualificationResult['reasons'] = [];

  if (input.siren === null) {
    reasons.push('no-siren-extracted');
  }
  if (input.sireneMatch === null) {
    reasons.push('siren-not-in-qualifying-sirene-set');
  }
  if (input.domainSuppressed) {
    reasons.push('domain-suppressed');
  }

  return { qualified: reasons.length === 0, reasons };
}
