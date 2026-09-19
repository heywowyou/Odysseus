import { z } from 'zod';
import type {
  FindingCategory,
  HotelCatalogueWritingSiteContext,
  ObligationAssessment,
  LlmInput,
  ReportLanguage,
} from '@odysseus/core';

/** Plan 067: concise prose is valid; the schema prevents padding rather than
 * forcing it. */
export const MIN_BUSINESS_IMPACT_SENTENCES = 1;
export const MAX_BUSINESS_IMPACT_SENTENCES = 4;
export const MIN_RECOMMENDED_ACTIONS = 1;
export const MAX_RECOMMENDED_ACTIONS = 4;

/** Rough sentence count: splits on ./!/? followed by whitespace or end of
 *  string. Doesn't parse abbreviations, but businessImpact is short,
 *  plain-language prose by construction, so this schema guard's job is
 *  to reject an over-long paragraph, not to parse grammar precisely. */
function countSentences(value: string): number {
  const matches = value.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return matches ? matches.filter((sentence) => sentence.trim().length > 0).length : 0;
}

const businessImpactSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      const count = countSentences(value);
      return count >= MIN_BUSINESS_IMPACT_SENTENCES && count <= MAX_BUSINESS_IMPACT_SENTENCES;
    },
    {
      message: `businessImpact must be between ${MIN_BUSINESS_IMPACT_SENTENCES} and ${MAX_BUSINESS_IMPACT_SENTENCES} sentences`,
    },
  );

/** New, non-locked schema. Deliberately has no findingIds, effort,
 *  impact, priorityRank, category, quickWins, or overallRisk field at
 *  all - those are decided by the structure pass and are not optional-
 *  and-ignored here, they do not exist in this schema, which removes a
 *  whole class of potential hallucination rather than guarding against
 *  it. See docs/rules/llm-layer-rules.md section 9.
 *
 *  legalRelevance is also absent as of docs/archive/report-v2-refactor.md 4.3:
 *  it is now built entirely in code (legal-relevance.ts) from
 *  deterministic wcagCriteria data during merge, not written by the
 *  model - "the model chooses no part of this sentence." */
export const writingThemeSchema = z
  .object({
    themeKey: z.string().min(1),
    title: z.string().min(1),
    businessImpact: businessImpactSchema,
    recommendedActions: z
      .array(z.string())
      .min(MIN_RECOMMENDED_ACTIONS)
      .max(MAX_RECOMMENDED_ACTIONS),
  })
  .strict();

export const writingPassOutputSchema = z
  .object({
    themes: z.array(writingThemeSchema).min(1).max(20),
    executiveSummary: z.string().min(1),
    notes: z.string(),
  })
  .strict();

export type WritingTheme = z.infer<typeof writingThemeSchema>;
export type WritingPassOutput = z.infer<typeof writingPassOutputSchema>;

/** What the writing pass is shown for one theme: its correlation key,
 *  its category (context for tone, even though legalRelevance is no
 *  longer written by the model), and the underlying finding records it
 *  needs to write from. */
export interface TrustedRemediationInput {
  ruleId: string;
  guidance: string;
}

export interface WritingThemeInput {
  themeKey: string;
  category: FindingCategory;
  /** Plan 067: only findings assigned to this theme. */
  findings: LlmInput['findings'];
  /** Reviewed deterministic remediation copy from the report registry only. */
  trustedRemediations: TrustedRemediationInput[];
}

/** Deterministic counts the executive summary must cite verbatim rather
 *  than estimate, per docs/archive/report-v2-refactor.md B10/4.3. Computed once
 *  from the audit's unfiltered findings, not the severity-filtered set
 *  the model otherwise sees, so the summary reports the true scope. */
export interface WritingSiteStats {
  pagesScanned: number;
  totalFindings: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
}

/** The deterministic transactional-flow determination shared with the
 * report's legal section. It is context for prose only: the writing pass
 * cannot change it, and its output is rejected when it claims the opposite. */
export type TransactionalFlowStatus = 'present' | 'absent' | 'inconclusive' | 'unknown';

/** Plan 029 lever F: llm-side widening of the site context with the
 *  concrete, non-financial facts plan 027 named (property type, city,
 *  sector). The room count was removed on 2026-09-10 and must not come
 *  back: the executiveSummary digit guard rejects any digit, so a
 *  model-visible count is a guaranteed retry hazard. Deliberately local
 *  to this package: the shared
 *  `LlmInput['siteContext']` shape in core is a locked contract, and no
 *  caller outside this package's tests populates the new fields yet -
 *  wiring them from the intake data at call time is a separate plan
 *  (plans/029-writing-pass-open-levers.md step 3). All are optional;
 *  when they are absent the writing prompt is byte-identical to the
 *  pre-plan-029 text and `fallbackNote` behaves exactly as before.
 *  A type intersection, not an interface extending the indexed access:
 *  interfaces cannot carry members out of `LlmInput['siteContext']`. */
export type WritingSiteContext = LlmInput['siteContext'] & HotelCatalogueWritingSiteContext;

export type WritingPerformanceMetric = 'lcp' | 'cls' | 'inp' | 'tbt';
export type WritingPerformanceSource = 'field' | 'lab';
export type WritingPerformanceRating = 'good' | 'mid' | 'poor';

export interface WritingPerformanceObservation {
  metric: WritingPerformanceMetric;
  source: WritingPerformanceSource;
  value: number;
  rating: WritingPerformanceRating;
}

export interface WritingPerformanceDiscordance {
  /** Authoritative real-user observation used to interpret the lab signal.
   * For TBT, INP is the corresponding field responsiveness metric. */
  field: WritingPerformanceObservation;
  /** Laboratory observation that materially disagrees with the field signal. */
  lab: WritingPerformanceObservation;
  /** Plan 067: the deterministic layer, not Luna, decides that this lab
   * value is non-representative for recommendation purposes. */
  labNonRepresentativeForRecommendations: true;
}

export interface WritingPerformanceEvidence {
  fieldDataAvailable: boolean;
  observations: WritingPerformanceObservation[];
  /** Material field-versus-lab disagreements, already reconciled in code. */
  discordances: WritingPerformanceDiscordance[];
  /** Deterministic recommendation signal after field/lab reconciliation. */
  primaryConcern: WritingPerformanceObservation | null;
  /** Lab metrics that may be shown in the deterministic section but must not
   * drive generated recommendations because they contradict stronger field data. */
  suppressedLabRecommendations: WritingPerformanceMetric[];
}

/** Test/offline-tool neutral packet. Production report generation builds the
 * real reconciled packet from the audit manifest. */
export function emptyWritingPerformanceEvidence(): WritingPerformanceEvidence {
  return {
    fieldDataAvailable: false,
    observations: [],
    discordances: [],
    primaryConcern: null,
    suppressedLabRecommendations: [],
  };
}

export interface WritingSummaryThemeEvidence {
  themeKey: string;
  category: FindingCategory;
  priorityRank: number;
}

export interface WritingSummaryEvidence {
  siteStats: WritingSiteStats;
  /** Structure-pass order expressed explicitly, so the summary never infers
   * what is important from raw findings. */
  rankedThemes: WritingSummaryThemeEvidence[];
  categoriesPresent: FindingCategory[];
  performance: WritingPerformanceEvidence;
  /** Deterministic obligation-engine status; no legal conclusion is model-owned. */
  obligationStatus: ObligationAssessment['status'] | 'unknown';
  limitations: string[];
}

export interface WritingInput {
  language: ReportLanguage;
  siteContext: WritingSiteContext;
  themes: WritingThemeInput[];
  siteStats: WritingSiteStats;
  /** Plan 067: reconciled evidence contract shared with the deterministic
   * Performance section; replaces the lab-only dominant-metric shortcut. */
  performanceEvidence: WritingPerformanceEvidence;
  /** Deterministic packet for the executive summary. */
  summaryEvidence: WritingSummaryEvidence;
  /** Optional only for compatibility with stored-analysis tooling and test
   * fixtures that predate the guard. New analysis-stage calls always set it. */
  transactionalFlowStatus?: TransactionalFlowStatus;
  /** The one phrasing this report may use to name the client's external
   *  provider, chosen in code by selectProviderPhrase before the model is
   *  called. Optional for the same reason as transactionalFlowStatus:
   *  fixtures and stored-analysis tooling predate it, and consumers fall
   *  back to the first approved phrase. */
  providerPhrase?: string;
}
