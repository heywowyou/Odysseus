import { z } from 'zod';
import type { FindingCategory, LlmInput, ReportLanguage } from '@odysseus/core';

const MAX_BUSINESS_IMPACT_SENTENCES = 2;
const MAX_RECOMMENDED_ACTIONS = 3;

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
  .refine((value) => countSentences(value) <= MAX_BUSINESS_IMPACT_SENTENCES, {
    message: `businessImpact must be at most ${MAX_BUSINESS_IMPACT_SENTENCES} sentences`,
  });

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
    recommendedActions: z.array(z.string()).min(1).max(MAX_RECOMMENDED_ACTIONS),
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

export interface WritingInput {
  language: ReportLanguage;
  siteContext: LlmInput['siteContext'];
  themes: WritingThemeInput[];
  siteStats: WritingSiteStats;
  /** Which Core Web Vital dominates the site's performance problem, so
   *  performance recommendedActions lead with the actual cause rather
   *  than defaulting to image/CSS advice. null when no page is rated
   *  poor on any metric. See docs/archive/report-v2-refactor.md A4. */
  dominantPerformanceMetric: 'lcp' | 'cls' | 'tbt' | null;
}
