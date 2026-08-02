/**
 * Finding ID assignment.
 *
 * Sort by severity descending, then dedupeKey ascending, then assign
 * f001, f002, and so on. Short and sequential because the LLM layer (M5)
 * must echo these back exactly, and the hallucination guard rejects the
 * whole response over one wrong character.
 *
 * findingId is stable only within one audit. Re-normalizing the same
 * artifacts with the same input yields the same IDs (the ordering is
 * deterministic), but a finding's ID is not comparable across two
 * different audits of the same site: two audits can order their findings
 * differently as the underlying issues change. Cross-run identity is
 * dedupeKey, not findingId. Cross-run comparison is Milestone 10.
 */

import { SEVERITY_ORDER } from './severity.js';
import type { Finding } from '../types/findings.js';

export function assignFindingIds(
  findings: readonly Omit<Finding, 'findingId'>[],
): Finding[] {
  const sorted = [...findings].sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.dedupeKey < b.dedupeKey ? -1 : a.dedupeKey > b.dedupeKey ? 1 : 0;
  });

  const digits = Math.max(3, String(sorted.length).length);

  return sorted.map((finding, index) => ({
    ...finding,
    findingId: `f${String(index + 1).padStart(digits, '0')}`,
  }));
}
