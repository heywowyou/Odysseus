import { z } from 'zod';
import { effortSchema, impactSchema } from '@odysseus/core';
import type { LlmInput } from '@odysseus/core';

/** Everything the structure pass sees: findings and site context, no
 *  language. Grouping and prioritizing findings is language-independent;
 *  see docs/llm-layer-rules.md section 9. */
export type StructureInput = Pick<LlmInput, 'siteContext' | 'findings'>;

/** New, non-locked schema (unlike the locked themeSchema in
 *  packages/core/src/types/llm-output.ts). .strict() so an unexpected
 *  field is a hard Zod rejection - feeding the retry loop - rather than
 *  a silent strip. This is deliberately not a subset of the locked
 *  themeSchema: it has no prose fields at all, per
 *  docs/llm-layer-rules.md section 9. */
export const structureThemeSchema = z
  .object({
    findingIds: z.array(z.string()).min(1),
    category: z.enum(['accessibility', 'seo', 'performance', 'rendering']),
    effort: effortSchema,
    impact: impactSchema,
    priorityRank: z.number().int().positive(),
  })
  .strict();

export const structurePassOutputSchema = z
  .object({
    themes: z.array(structureThemeSchema).min(1).max(20),
    quickWins: z.array(z.string()),
    overallRisk: z.enum(['low', 'medium', 'high']),
  })
  .strict();

export type StructureTheme = z.infer<typeof structureThemeSchema>;
export type StructurePassOutput = z.infer<typeof structurePassOutputSchema>;

/** A structureTheme plus a synthetic, code-assigned correlation id. Never
 *  produced by the model - see assignThemeKeys below. Lets the writing
 *  pass's per-language output be merged back onto the right structural
 *  theme regardless of what order the model returns themes in. */
export const structureThemeWithKeySchema = structureThemeSchema.extend({
  themeKey: z.string().min(1),
});
export type StructureThemeWithKey = z.infer<typeof structureThemeWithKeySchema>;

/** The persisted analyses/<timestamp>-structure.json shape. */
export const structureDocumentSchema = z
  .object({
    auditId: z.string().min(1),
    themes: z.array(structureThemeWithKeySchema).min(1).max(20),
    quickWins: z.array(z.string()),
    overallRisk: z.enum(['low', 'medium', 'high']),
    model: z.string().min(1),
    effort: z.string().min(1),
    generatedAt: z.string().min(1),
  })
  .strict();
export type StructureDocument = z.infer<typeof structureDocumentSchema>;

/** Assigns deterministic, index-based correlation keys (t1..tN) to a
 *  freshly-validated structure pass output. Called exactly once, right
 *  after a structure pass clears its own guards. Never re-derived from a
 *  loaded structure document - those keys are already fixed on disk once
 *  written, so every --language run against the same structure file
 *  shows the writing pass the same keys. */
export function assignThemeKeys(output: StructurePassOutput): StructureThemeWithKey[] {
  return output.themes.map((theme, index) => ({ ...theme, themeKey: `t${index + 1}` }));
}

/** Validates a structure document loaded from disk before it is trusted -
 *  the same "never trust a file just because this tool wrote it" posture
 *  as llmOutputSchema.parse() elsewhere in this package. */
export function parseStructureDocument(raw: unknown): StructureDocument {
  return structureDocumentSchema.parse(raw);
}
