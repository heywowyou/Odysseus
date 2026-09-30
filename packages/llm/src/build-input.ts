import {
  CRUX_CLS_POOR_RULE_ID,
  CRUX_INP_POOR_RULE_ID,
  CRUX_LCP_POOR_RULE_ID,
  isConfinedToThirdPartyFrame,
  isUnconfirmedRule,
  reportPopulation,
  type AuditManifest,
  type Finding,
  type ObligationAssessment,
  type ReportLanguage,
} from '@odysseus/core';
import { LLM_SEVERITY_FLOOR } from './constants.js';
import type { StructureInput, StructureThemeWithKey } from './structure-schema.js';
import type {
  TransactionalFlowStatus,
  TrustedRemediationInput,
  WritingInput,
  WritingPerformanceEvidence,
  WritingSiteContext,
  WritingSiteStats,
  WritingThemeInput,
} from './writing-schema.js';
import { selectProviderPhrase } from './provider-phrase-guard.js';
import {
  boundScannerText,
  MAX_FINDING_DESCRIPTION_CHARS_FOR_LLM,
  MAX_FINDING_TITLE_CHARS_FOR_LLM,
} from './untrusted-evidence.js';

export type SiteContextInput = StructureInput['siteContext'];

/** Filters findings to LLM_SEVERITY_FLOOR. This is the one place the
 *  severity filter happens; the returned array must be passed to
 *  buildStructureInput/buildWritingInput and to the guard functions in
 *  the retry loops, never the full unfiltered set to one and the
 *  filtered set to the other. See docs/rules/llm-layer-rules.md section 1. */
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
/** URLs are site-controlled scanner evidence just like titles and descriptions. */
export const MAX_PAGE_URL_CHARS_FOR_LLM = 200;

/** Plan 075 M5: findings about the whole origin that normalization attaches
 *  to the homepage only because every finding needs a page (normalize-crux.ts).
 *  Handing the model that page led it to write field data up as the
 *  homepage's; the model sees no page for them, so the finding reads as the
 *  site's. The report and the ranking still read finding.pageUrls itself. */
const SITE_SCOPED_RULE_IDS: ReadonlySet<string> = new Set([
  CRUX_LCP_POOR_RULE_ID,
  CRUX_CLS_POOR_RULE_ID,
  CRUX_INP_POOR_RULE_ID,
]);

/** The bounded copy of a finding every model input carries: the analysis
 *  passes here, and the report-quality roles' evidence (issue #548). */
export function toLlmFindingShape(finding: Finding): StructureInput['findings'][number] {
  return {
    findingId: finding.findingId,
    source: finding.source,
    ruleId: finding.ruleId,
    category: finding.category,
    severity: finding.severity,
    wcagCriteria: finding.wcagCriteria,
    title: boundScannerText(finding.title, MAX_FINDING_TITLE_CHARS_FOR_LLM),
    description: boundScannerText(finding.description, MAX_FINDING_DESCRIPTION_CHARS_FOR_LLM),
    pageUrls: (SITE_SCOPED_RULE_IDS.has(finding.ruleId) ? [] : finding.pageUrls)
      .slice(0, MAX_PAGE_URLS_FOR_LLM)
      .map((url) => boundScannerText(url, MAX_PAGE_URL_CHARS_FOR_LLM)),
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
  siteContext: WritingSiteContext,
  language: ReportLanguage,
  siteStats: WritingSiteStats,
  performanceEvidence: WritingPerformanceEvidence,
  trustedRemediationsByTheme: Readonly<Record<string, readonly TrustedRemediationInput[]>>,
  transactionalFlowStatus: TransactionalFlowStatus = 'unknown',
  /** Stable per-audit key (the auditId in the pipeline) that decides which
   *  approved provider phrasing this report uses. Omitted by fixtures and
   *  offline tooling, which then all resolve to the first phrase. */
  providerPhraseSeed?: string,
  obligationStatus: ObligationAssessment['status'] | 'unknown' = 'unknown',
  /** Plan 068: deterministic client-relevant evidence limitations. */
  summaryLimitations: readonly string[] = [],
): WritingInput {
  const byId = new Map(filteredFindings.map((f) => [f.findingId, f]));

  const themes: WritingThemeInput[] = structureThemes.map((theme) => {
    const themeFindings = theme.findingIds.map((id) => {
      const finding = byId.get(id);
      if (!finding) {
        throw new Error(
          `odysseus analyze: structure pass theme ${theme.themeKey} references unknown findingId "${id}". ` +
            'The structure document may be stale relative to the current findings.json - try --regenerate-structure.',
        );
      }
      return finding;
    });
    // Q1 (plan 075): a finding wholly inside an embedded frame never reaches
    // a priority card (the report's buildRenderedPriorities drops it), so a
    // theme that mixes such findings with the site's own shows the client
    // only the site's own, and the writer describes that same set. Given
    // both, it located a site-wide link-name priority on the one page that
    // embeds a booking frame, the only place the frame's findings were.
    // A theme made only of frame findings keeps them: it has nothing else
    // to describe and never becomes a card.
    // Trade-off 124 (issue #543): an unconfirmed rule's finding never
    // reaches a priority card either, so the writer does not describe it.
    const siteFindings = themeFindings.filter(
      (finding) => !isConfinedToThirdPartyFrame(finding) && !isUnconfirmedRule(finding.ruleId),
    );
    return {
      themeKey: theme.themeKey,
      category: theme.category,
      findings: (siteFindings.length > 0 ? siteFindings : themeFindings).map(toLlmFindingShape),
      trustedRemediations: [...(trustedRemediationsByTheme[theme.themeKey] ?? [])],
    };
  });

  return {
    language,
    siteContext,
    themes,
    siteStats,
    performanceEvidence,
    summaryEvidence: {
      siteStats,
      rankedThemes: structureThemes
        .map((theme) => ({
          themeKey: theme.themeKey,
          category: theme.category,
          priorityRank: theme.priorityRank,
        }))
        .sort((a, b) => a.priorityRank - b.priorityRank),
      categoriesPresent: [
        ...new Set(
          filteredFindings
            .filter((finding) => !isUnconfirmedRule(finding.ruleId))
            .map((finding) => finding.category),
        ),
      ].sort(),
      performance: performanceEvidence,
      obligationStatus,
      limitations: [
        ...new Set([
          ...(performanceEvidence.fieldDataAvailable ? [] : ['real-user-performance-unavailable']),
          ...summaryLimitations,
        ]),
      ].sort(),
    },
    transactionalFlowStatus,
    providerPhrase: selectProviderPhrase(language, providerPhraseSeed),
  };
}

/** Deterministic counts for the writing pass's executiveSummary to cite,
 *  computed from the audit's unfiltered findings (not the severity- and
 *  diversion-filtered set the model otherwise sees), so the summary
 *  reports the true scope of the scan. See docs/archive/report-v2-refactor.md
 *  B10. pagesScanned counts visited pages only, matching the crawled-page
 *  count structure-ranking.ts uses for the site-wide accessibility floor. */
export function computeSiteStats(
  allFindings: readonly Finding[],
  manifest: AuditManifest,
): WritingSiteStats {
  // Issue #543: the report's primary population (core's reportPopulation),
  // the one its totals and statistics tiles count, so the model is never
  // shown a total the PDF contradicts. Frame-confined, unlinked-sitemap
  // and unconfirmed-rule findings stay out, as they do on the tiles.
  const counted = reportPopulation(manifest, allFindings).primary;
  const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const finding of counted) bySeverity[finding.severity]++;

  return {
    pagesScanned: manifest.pages.filter((page) => page.status === 'visited').length,
    totalFindings: counted.length,
    ...bySeverity,
  };
}

/** Minimal fallback site context, used when no --context file is passed.
 *  Placeholder values are chosen so the model can recognize them as
 *  absent rather than as real input; the system prompts instruct the
 *  model to say so rather than invent a business type or primary goal.
 *  See docs/rules/llm-layer-rules.md section 4. */
export function buildFallbackSiteContext(): SiteContextInput {
  return {
    businessType: 'unknown (no intake context provided)',
    primaryGoal: 'unknown (no intake context provided)',
    languagesServed: [],
    targetMarkets: [],
  };
}
