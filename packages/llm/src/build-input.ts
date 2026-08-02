import type { Finding, LlmInput, ReportLanguage } from '@odysseus/core';
import { LLM_SEVERITY_FLOOR } from './constants.js';

export type SiteContextInput = LlmInput['siteContext'];

/** Filters findings to LLM_SEVERITY_FLOOR. This is the one place the
 *  severity filter happens; the returned array must be passed both to
 *  buildLlmInput (below) and to findInventedFindingIds /
 *  findUnreferencedFindingIds in the retry loop, never the full
 *  unfiltered set to one and the filtered set to the other. See
 *  docs/llm-layer-rules.md section 1. */
export function filterFindingsForLlm(findings: readonly Finding[]): Finding[] {
  return findings.filter((finding) => LLM_SEVERITY_FLOOR.includes(finding.severity));
}

export function buildLlmInput(
  filteredFindings: readonly Finding[],
  siteContext: SiteContextInput,
  language: ReportLanguage,
): LlmInput {
  return {
    language,
    siteContext,
    findings: filteredFindings.map((finding) => ({
      findingId: finding.findingId,
      source: finding.source,
      ruleId: finding.ruleId,
      category: finding.category,
      severity: finding.severity,
      wcagCriteria: finding.wcagCriteria,
      title: finding.title,
      description: finding.description,
      pageUrls: finding.pageUrls,
      occurrences: finding.occurrences,
    })),
  };
}

/** Minimal fallback site context, used when no --context file is passed.
 *  Placeholder values are chosen so the model can recognize them as
 *  absent rather than as real input; the system prompt (see prompt.ts)
 *  instructs the model to say in its `notes` field that minimal context
 *  was used, rather than invent a business type or primary goal. See
 *  docs/llm-layer-rules.md section 4. */
export function buildFallbackSiteContext(): SiteContextInput {
  return {
    businessType: 'unknown (no intake context provided)',
    primaryGoal: 'unknown (no intake context provided)',
    languagesServed: [],
    targetMarkets: [],
  };
}
