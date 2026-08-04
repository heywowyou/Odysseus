import { llmOutputSchema, type LlmOutput, type Theme } from '@odysseus/core';
import type { StructureDocument } from './structure-schema.js';
import type { WritingPassOutput } from './writing-schema.js';

/** Merges the structure pass's grouping/ranking with the writing pass's
 *  prose into the locked LlmOutput/Theme shape. Assumes
 *  findThemeKeyMismatches already returned an empty result for this
 *  pair (checked by analyzeWriting's retry loop before this is called) -
 *  re-checked defensively here rather than trusted, since a merge bug is
 *  exactly the kind of thing that should throw loudly instead of
 *  silently dropping a theme.
 *
 *  themeKey never gets assigned into the Theme object literal below - it
 *  is structurally impossible to leak into the merged output, and the
 *  trailing llmOutputSchema.parse() (the real, locked schema, not a
 *  JSON-schema mirror) would reject it anyway since themeSchema is not
 *  .passthrough(). See docs/llm-layer-rules.md section 9. */
export function mergeAnalysisPasses(
  structureDoc: Pick<StructureDocument, 'themes' | 'quickWins' | 'overallRisk'>,
  writingOutput: WritingPassOutput,
): LlmOutput {
  const writingByKey = new Map(writingOutput.themes.map((theme) => [theme.themeKey, theme]));

  const themes: Theme[] = structureDoc.themes.map((structureTheme) => {
    const writingTheme = writingByKey.get(structureTheme.themeKey);
    if (!writingTheme) {
      throw new Error(
        `odysseus analyze: merge invariant violated - no writing-pass theme for themeKey ` +
          `${structureTheme.themeKey}. This should have been caught by findThemeKeyMismatches before merge.`,
      );
    }

    return {
      title: writingTheme.title,
      category: structureTheme.category,
      businessImpact: writingTheme.businessImpact,
      effort: structureTheme.effort,
      impact: structureTheme.impact,
      priorityRank: structureTheme.priorityRank,
      findingIds: structureTheme.findingIds,
      recommendedActions: writingTheme.recommendedActions,
      // Defensive strip: legalRelevance only for accessibility themes,
      // even if the writing pass populated one anyway despite the prompt.
      ...(structureTheme.category === 'accessibility' && writingTheme.legalRelevance
        ? { legalRelevance: writingTheme.legalRelevance }
        : {}),
    };
  });

  const merged: LlmOutput = {
    executiveSummary: writingOutput.executiveSummary,
    overallRisk: structureDoc.overallRisk,
    themes,
    quickWins: structureDoc.quickWins,
    notes: writingOutput.notes,
  };

  return llmOutputSchema.parse(merged);
}
