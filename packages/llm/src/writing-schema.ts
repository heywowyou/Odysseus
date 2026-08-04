import { z } from 'zod';
import type { FindingCategory, LlmInput, ReportLanguage } from '@odysseus/core';

/** New, non-locked schema. Deliberately has no findingIds, effort,
 *  impact, priorityRank, category, quickWins, or overallRisk field at
 *  all - those are decided by the structure pass and are not optional-
 *  and-ignored here, they do not exist in this schema, which removes a
 *  whole class of potential hallucination rather than guarding against
 *  it. See docs/llm-layer-rules.md section 9. */
export const writingThemeSchema = z
  .object({
    themeKey: z.string().min(1),
    title: z.string().min(1),
    businessImpact: z.string().min(1),
    /** Populated for accessibility themes only, same rule as the locked
     *  themeSchema's legalRelevance. */
    legalRelevance: z.string().optional(),
    recommendedActions: z.array(z.string()).min(1),
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
 *  its category (so the model knows whether legalRelevance applies), and
 *  the underlying finding records it needs to write from. */
export interface WritingThemeInput {
  themeKey: string;
  category: FindingCategory;
  findings: LlmInput['findings'];
}

export interface WritingInput {
  language: ReportLanguage;
  siteContext: LlmInput['siteContext'];
  themes: WritingThemeInput[];
}
