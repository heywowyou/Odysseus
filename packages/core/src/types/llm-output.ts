/**
 * LLM layer contract. LOCKED.
 *
 * The governing rule of Odysseus: deterministic scanners detect, the LLM
 * explains, groups, prioritizes, and writes. The model may never
 * introduce a finding that is not present in the structured input it
 * received.
 *
 * This file encodes that rule as a schema plus a guard. The guard is not
 * optional and not advisory. One hallucinated finding in front of a
 * client's developer damages the entire offer.
 */

import { z } from 'zod';
import type { Finding, FindingCategory } from './findings.js';

export const effortSchema = z.enum(['low', 'medium', 'high']);
export const impactSchema = z.enum(['low', 'medium', 'high']);

export const themeSchema = z.object({
  title: z.string().min(1),
  /** 'privacy' added 2026-08-24, an explicitly approved change to this
   *  locked contract, for the same reason trade-off 25 added it to
   *  FindingCategory: security-header and cookie/tracker findings had no
   *  correct home, so a real Domaine Lagnonu run labelled a
   *  security-headers theme 'performance' - which keys reference-stat
   *  selection (trade-off 16) off the wrong category and can attach a
   *  page-speed statistic to a security priority.
   *
   *  'geo' is deliberately still absent. Trade-off 16 excluded it so an
   *  LLM-synthesized theme can never be geo and a geo citation only ever
   *  appears in the findings appendix; nothing in this change disturbs
   *  that reasoning. Widening an enum is backward compatible: analyses
   *  stored before this date still parse. */
  category: z.enum(['accessibility', 'seo', 'performance', 'rendering', 'privacy']),
  /** Why this matters commercially, in plain language, no jargon. */
  businessImpact: z.string().min(1),
  /** Populated for accessibility themes only. States the relevant
   *  obligation without overstating it. Never asserts that a specific
   *  law applies to a specific client. */
  legalRelevance: z.string().optional(),
  effort: effortSchema,
  impact: impactSchema,
  priorityRank: z.number().int().positive(),
  /** Must reference findingId values from the input. Enforced below. */
  findingIds: z.array(z.string()).min(1),
  recommendedActions: z.array(z.string()).min(1),
});

export const llmOutputSchema = z.object({
  executiveSummary: z.string().min(1),
  overallRisk: z.enum(['low', 'medium', 'high']),
  themes: z.array(themeSchema).min(1).max(20),
  quickWins: z.array(z.string()),
  notes: z.string(),
});

export type LlmOutput = z.infer<typeof llmOutputSchema>;
export type Theme = z.infer<typeof themeSchema>;

/**
 * The theme category a *stored* analysis may carry, which is wider than
 * the model-facing enum above.
 *
 * Plan 058's evidence-bound pipeline does not ask a model for a category
 * at all: a remediation project inherits the category of the findings it
 * groups, deterministically. A geo project is therefore a legitimate
 * stored theme even though trade-off 16 still forbids a model from
 * *synthesizing* a geo theme. Keeping the two types apart is what lets
 * the locked contract above stay narrow while the deterministic path
 * stays truthful about what it grouped.
 */
export type StoredThemeCategory = FindingCategory;

export interface StoredTheme extends Omit<Theme, 'category'> {
  category: StoredThemeCategory;
}

/** `LlmOutput` as it is persisted and rendered, with the wider category. */
export interface StoredLlmOutput extends Omit<LlmOutput, 'themes'> {
  themes: StoredTheme[];
}

/**
 * Hard guard against invented findings.
 *
 * Returns the set of finding IDs the model referenced that do not exist
 * in the input. A non-empty result means the response is rejected, logged
 * with the offending IDs, and retried. After a configured number of
 * retries the audit fails loudly rather than shipping a report that
 * cannot be traced to scanner output.
 *
 * Not currently called by the real pipeline: the structure pass validates
 * via `packages/llm/src/structure-guards.ts`'s alias-ID duplicate instead
 * (trade-off 27), which sees dense `x1..xN` alias IDs rather than real
 * ones. Kept as a locked contract; do not assume this runs.
 */
export function findInventedFindingIds(output: LlmOutput, inputFindings: Finding[]): string[] {
  const known = new Set(inputFindings.map((f) => f.findingId));
  const referenced = new Set<string>();

  for (const theme of output.themes) {
    for (const id of theme.findingIds) referenced.add(id);
  }
  for (const id of output.quickWins) referenced.add(id);

  return [...referenced].filter((id) => !known.has(id));
}

/**
 * Coverage check. Not a hard failure, but a report that silently drops
 * half the findings is a quality problem worth surfacing.
 *
 * Not currently called by the real pipeline; see the note on
 * `findInventedFindingIds` above.
 */
export function findUnreferencedFindingIds(output: LlmOutput, inputFindings: Finding[]): string[] {
  const referenced = new Set<string>();
  for (const theme of output.themes) {
    for (const id of theme.findingIds) referenced.add(id);
  }
  return inputFindings.map((f) => f.findingId).filter((id) => !referenced.has(id));
}

/** Report output language. Bilingual delivery is a product requirement,
 *  not an afterthought, so it is a parameter from the first call. */
export type ReportLanguage = 'fr' | 'en';

/**
 * Everything the LLM layer is allowed to see. Never raw HTML, never full
 * page content. This keeps token cost trivial and keeps the model on
 * rails.
 */
export interface LlmInput {
  language: ReportLanguage;
  siteContext: {
    businessType: string;
    primaryGoal: string;
    languagesServed: string[];
    targetMarkets: string[];
    sizeBracket?: string;
  };
  findings: Array<
    Pick<
      Finding,
      | 'findingId'
      | 'source'
      | 'ruleId'
      | 'category'
      | 'severity'
      | 'wcagCriteria'
      | 'title'
      | 'description'
      | 'pageUrls'
      | 'occurrences'
    >
  >;
}
