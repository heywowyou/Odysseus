/**
 * Manual-input-layer milestone: resolves the lcen-mentions-legales-
 * missing finding when the operator has personally confirmed where the
 * SIREN/RCS/TVA is actually displayed on the site
 * (AuditManualFields.sirenSourceUrl), separate from whether we know the
 * SIREN at all (AuditManualFields.siren / ObligationAssessment's own
 * sirenSource, see methodology.ts's renderSirenProvenanceNote). A manual
 * siren alone must never suppress this finding - it only resolves when
 * sirenSourceUrl is filled, per CLAUDE.md's manual-input-layer rule 2.
 *
 * Deliberately not built on packages/llm's partitionFindings: that
 * function's contract is scan-derived exclusion (wrapper pages,
 * noindex-legal-page URL patterns), decided from the manifest alone,
 * before the LLM ever sees the finding. This is the opposite kind of
 * exclusion - an operator confirming a fact the scanner's regex
 * extraction missed, decided at report-render time, well after the LLM
 * pass. Called once from render-html.ts (the document-wide assembly
 * point, same as the citedStatIds Set) so findings-appendix.ts and
 * methodology.ts's siren-provenance note see the identical resolved/
 * unresolved decision, never two independently-computed answers.
 */

import { LCEN_MENTIONS_LEGALES_RULE_ID, type Finding } from '@odysseus/core';

export interface LcenResolution {
  /** findings with lcen-mentions-legales-missing removed when resolved,
   *  otherwise the input array unchanged (same reference, no copy). */
  findings: Finding[];
  /** Present only when the finding was actually suppressed - a
   *  sirenSourceUrl supplied for an audit that never had this finding in
   *  the first place resolves nothing, since there is nothing to cite. */
  resolvedSirenSourceUrl?: string;
}

export function resolveLcenFinding(findings: Finding[], sirenSourceUrl: string | undefined): LcenResolution {
  if (!sirenSourceUrl) return { findings };

  const hasLcenFinding = findings.some((finding) => finding.ruleId === LCEN_MENTIONS_LEGALES_RULE_ID);
  if (!hasLcenFinding) return { findings };

  return {
    findings: findings.filter((finding) => finding.ruleId !== LCEN_MENTIONS_LEGALES_RULE_ID),
    resolvedSirenSourceUrl: sirenSourceUrl,
  };
}
