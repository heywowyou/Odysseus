import { z } from 'zod';
import type {
  FindingCategory,
  HotelCatalogueWritingSiteContext,
  LlmInput,
  ReportLanguage,
} from '@odysseus/core';

/** Plan 027: raised from a hard 2-sentence ceiling, which was measured to
 *  force every businessImpact in every stored French analysis to exactly two
 *  sentences - the ceiling was doing the model's writing for it. A floor is
 *  added alongside the raised ceiling so the model doesn't simply keep
 *  writing two sentences out of habit; three to five gives room for
 *  consulting-length prose without inviting padding. See
 *  plans/027-french-report-prose-quality.md and
 *  docs/rules/report-writing-style.md section 5. */
export const MIN_BUSINESS_IMPACT_SENTENCES = 3;
export const MAX_BUSINESS_IMPACT_SENTENCES = 5;
/** Plan 027: raised from a hard 3-item ceiling for the same reason as the
 *  sentence cap above, with a floor so a theme still gets at least two
 *  concrete next steps. */
export const MIN_RECOMMENDED_ACTIONS = 2;
export const MAX_RECOMMENDED_ACTIONS = 5;

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
export interface WritingThemeInput {
  themeKey: string;
  category: FindingCategory;
  findings: LlmInput['findings'];
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
 *  concrete, non-financial facts plan 027 named (property type, room
 *  count, city, sector). Deliberately local to this package: the shared
 *  `LlmInput['siteContext']` shape in core is a locked contract, and no
 *  caller outside this package's tests populates the new fields yet -
 *  wiring them from the intake data at call time is a separate plan
 *  (plans/029-writing-pass-open-levers.md step 3). All four are optional;
 *  when they are absent the writing prompt is byte-identical to the
 *  pre-plan-029 text and `fallbackNote` behaves exactly as before.
 *  A type intersection, not an interface extending the indexed access:
 *  interfaces cannot carry members out of `LlmInput['siteContext']`. */
export type WritingSiteContext = LlmInput['siteContext'] & HotelCatalogueWritingSiteContext;

export interface WritingInput {
  language: ReportLanguage;
  siteContext: WritingSiteContext;
  themes: WritingThemeInput[];
  siteStats: WritingSiteStats;
  /** Which Core Web Vital dominates the site's performance problem, so
   *  performance recommendedActions lead with the actual cause rather
   *  than defaulting to image/CSS advice. null when no page is rated
   *  poor on any metric. See docs/archive/report-v2-refactor.md A4. */
  dominantPerformanceMetric: 'lcp' | 'cls' | 'tbt' | null;
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
