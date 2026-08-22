/**
 * Milestone 9b. `docs/llm-layer-rules.md` section 10 and CLAUDE.md rule 6
 * describe two cost gates as already-decided policy - decided
 * 2026-08-03, "do not remove either gate" - but neither the scoring
 * function nor either predicate existed anywhere in the codebase before
 * this milestone (confirmed via `git log -S`: the symbol names only ever
 * appeared in doc commits). This file is that first real implementation,
 * not a refactor of an existing one.
 *
 * Both gates reuse SEVERITY_ORDER as the weight rather than inventing a
 * second scale, and both score distinct findings, not occurrences -
 * occurrences are already collapsed per finding by the normalization
 * layer (`docs/normalization-rules.md` section 2), so counting findings
 * avoids double-counting one template-driven issue that recurs across a
 * site.
 *
 * Pure and synchronous, no I/O - callable offline exactly like
 * `assessObligations` and `selectReferenceStats`.
 */

import type { Finding } from '../types/findings.js';
import { SEVERITY_ORDER } from '../normalize/severity.js';

/** Sum of SEVERITY_ORDER weight across distinct findings. Not itself
 *  gated on anything - both predicates below read from this and from the
 *  raw findings list independently, since the gates key on counts and
 *  thresholds the sum alone can't reconstruct (e.g. "fewer than 5
 *  moderate findings" needs the moderate count, not the weighted sum). */
export function computeBrokennessScore(findings: readonly Finding[]): number {
  return findings.reduce((sum, finding) => sum + SEVERITY_ORDER[finding.severity], 0);
}

/** Audit fallback gate (docs/llm-layer-rules.md section 10). A paying
 *  client always receives a report regardless of findings volume; this
 *  only decides whether the report's content comes from an LLM call or a
 *  static "no significant issues found" template. Skip the LLM (this
 *  returns true - "eligible to fall back") only when both hold: no
 *  finding at critical or serious severity, and fewer than 5 moderate
 *  findings total. Deliberately conservative - expected to trigger
 *  rarely, since a paying full-audit client is unlikely to have an
 *  unusually clean site. This exists mainly as a safety net, not a cost
 *  optimization; the LLM cost of a full-audit call is small next to the
 *  audit's own price. */
export function isAuditFallbackEligible(findings: readonly Finding[]): boolean {
  const hasCriticalOrSerious = findings.some(
    (finding) => finding.severity === 'critical' || finding.severity === 'serious',
  );
  if (hasCriticalOrSerious) return false;
  const moderateCount = findings.filter((finding) => finding.severity === 'moderate').length;
  return moderateCount < 5;
}

/** Prospecting worthiness gate (docs/llm-layer-rules.md section 10).
 *  Decides whether a scanned prospect is worth an LLM call at all - the
 *  single-sentence hook and, once milestone 9c exists, the personalized
 *  outreach email. Intentionally stricter than the audit fallback gate: a
 *  prospect with only moderate or minor findings is not compelling cold
 *  outreach evidence, whereas a paying client gets a report regardless.
 *  Worthy (call the LLM) when at least one holds: at least one critical
 *  finding, at least two serious findings, or any page with render-diff
 *  missingPercent at 50 or above (the existing 'serious' floor
 *  `severityFromRenderDiff` already uses).
 *
 *  `renderDiffMissingPercents` is passed separately rather than derived
 *  from `findings` because a render-diff percentage is a per-page
 *  manifest fact, not itself a Finding - the caller (which already has
 *  the manifest) supplies exactly the values this predicate needs,
 *  matching the same "caller resolves, this function only decides"
 *  split `estimateRevenueImpact` uses for a client's turnover. */
export function isProspectingWorthy(
  findings: readonly Finding[],
  renderDiffMissingPercents: readonly number[] = [],
): boolean {
  const criticalCount = findings.filter((finding) => finding.severity === 'critical').length;
  if (criticalCount >= 1) return true;
  const seriousCount = findings.filter((finding) => finding.severity === 'serious').length;
  if (seriousCount >= 2) return true;
  return renderDiffMissingPercents.some((percent) => percent >= 50);
}
