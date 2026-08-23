import type { AuditManifest, Finding, ReportLanguage } from '@odysseus/core';
import { LLM_SEVERITY_FLOOR } from './constants.js';
import type { StructureInput, StructureThemeWithKey } from './structure-schema.js';
import type { WritingInput, WritingSiteStats, WritingThemeInput } from './writing-schema.js';

export type SiteContextInput = StructureInput['siteContext'];

/** Filters findings to LLM_SEVERITY_FLOOR. This is the one place the
 *  severity filter happens; the returned array must be passed to
 *  buildStructureInput/buildWritingInput and to the guard functions in
 *  the retry loops, never the full unfiltered set to one and the
 *  filtered set to the other. See docs/llm-layer-rules.md section 1. */
export function filterFindingsForLlm(findings: readonly Finding[]): Finding[] {
  return findings.filter((finding) => LLM_SEVERITY_FLOOR.includes(finding.severity));
}

/** A real lacoorniche.com audit (223 pages) had one site-wide finding
 *  with 200 pageUrls, and its structure-pass prompt blew past the
 *  model's 262144-token context limit on every retry - confirmed by
 *  measuring the built input directly: pageUrls arrays alone were ~86%
 *  of the prompt's character count across the 639 findings that pass
 *  LLM_SEVERITY_FLOOR. Neither structure-prompt.ts nor writing-prompt.ts
 *  ever instructs the model to read or reason about individual page
 *  URLs (grouping/prioritizing/writing is by severity, category, and
 *  occurrences, not by which pages a defect appears on), and
 *  writing-prompt.ts explicitly forbids the model from citing any
 *  count derived from this data at all. occurrences (already a small
 *  integer, unaffected here) is the "how widespread" signal the model
 *  actually uses. A small capped sample is kept, not zero, only so a
 *  future prompt change has something to reference without a second
 *  wiring pass - it must stay capped, never grow back to the full list,
 *  or this bug recurs on the next large real site. The report's own
 *  page-URL rendering (findings-appendix.ts) is unaffected: it reads
 *  finding.pageUrls from findings.json directly, never this LLM-facing
 *  copy. */
export const MAX_PAGE_URLS_FOR_LLM = 3;

function toLlmFindingShape(finding: Finding): StructureInput['findings'][number] {
  return {
    findingId: finding.findingId,
    source: finding.source,
    ruleId: finding.ruleId,
    category: finding.category,
    severity: finding.severity,
    wcagCriteria: finding.wcagCriteria,
    title: finding.title,
    description: finding.description,
    pageUrls: finding.pageUrls.slice(0, MAX_PAGE_URLS_FOR_LLM),
    occurrences: finding.occurrences,
  };
}

export function buildStructureInput(
  filteredFindings: readonly Finding[],
  siteContext: SiteContextInput,
): StructureInput {
  return {
    siteContext,
    findings: filteredFindings.map(toLlmFindingShape),
  };
}

/** Builds the writing pass's input from the structure pass's themes: for
 *  each theme, the underlying finding records for its findingIds (the
 *  writing pass never sees findingIds themselves outside this - it
 *  writes about findings, it does not reference them by ID). Throws if a
 *  structure theme references a findingId no longer present in the
 *  current filtered findings - a stale structure document against a
 *  re-normalized findings.json, which must fail loudly rather than
 *  silently produce prose for a finding that may no longer exist. */
export function buildWritingInput(
  structureThemes: readonly StructureThemeWithKey[],
  filteredFindings: readonly Finding[],
  siteContext: SiteContextInput,
  language: ReportLanguage,
  siteStats: WritingSiteStats,
  dominantPerformanceMetric: 'lcp' | 'cls' | 'tbt' | null,
): WritingInput {
  const byId = new Map(filteredFindings.map((f) => [f.findingId, f]));

  const themes: WritingThemeInput[] = structureThemes.map((theme) => ({
    themeKey: theme.themeKey,
    category: theme.category,
    findings: theme.findingIds.map((id) => {
      const finding = byId.get(id);
      if (!finding) {
        throw new Error(
          `odysseus analyze: structure pass theme ${theme.themeKey} references unknown findingId "${id}". ` +
            'The structure document may be stale relative to the current findings.json - try --regenerate-structure.',
        );
      }
      return toLlmFindingShape(finding);
    }),
  }));

  return { language, siteContext, themes, siteStats, dominantPerformanceMetric };
}

/** Deterministic counts for the writing pass's executiveSummary to cite,
 *  computed from the audit's unfiltered findings (not the severity- and
 *  diversion-filtered set the model otherwise sees), so the summary
 *  reports the true scope of the scan. See docs/report-v2-refactor.md
 *  B10. pagesScanned counts visited pages only, matching the crawled-page
 *  count structure-ranking.ts uses for the site-wide accessibility floor. */
export function computeSiteStats(allFindings: readonly Finding[], manifest: AuditManifest): WritingSiteStats {
  const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const finding of allFindings) bySeverity[finding.severity]++;

  return {
    pagesScanned: manifest.pages.filter((page) => page.status === 'visited').length,
    totalFindings: allFindings.length,
    ...bySeverity,
  };
}

/** Minimal fallback site context, used when no --context file is passed.
 *  Placeholder values are chosen so the model can recognize them as
 *  absent rather than as real input; the system prompts instruct the
 *  model to say so rather than invent a business type or primary goal.
 *  See docs/llm-layer-rules.md section 4. */
export function buildFallbackSiteContext(): SiteContextInput {
  return {
    businessType: 'unknown (no intake context provided)',
    primaryGoal: 'unknown (no intake context provided)',
    languagesServed: [],
    targetMarkets: [],
  };
}
