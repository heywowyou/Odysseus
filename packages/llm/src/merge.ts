import { llmOutputSchema, type Finding, type LlmOutput, type Theme } from '@odysseus/core';
import { buildLegalRelevance } from './legal-relevance.js';
import type { StructureDocument, StructureThemeWithKey } from './structure-schema.js';
import type { WritingPassOutput } from './writing-schema.js';

/** Union of wcagCriteria across a theme's findingIds, used to build its
 *  legalRelevance sentence deterministically. Findings not present in
 *  findingsById are skipped rather than throwing - by the time merge
 *  runs, findInventedStructureFindingIds has already guaranteed every
 *  findingId exists in the filtered set the structure pass saw. */
function themeWcagCriteria(
  structureTheme: Pick<StructureThemeWithKey, 'findingIds'>,
  findingsById: ReadonlyMap<string, Finding>,
): string[] {
  const criteria = new Set<string>();
  for (const findingId of structureTheme.findingIds) {
    const finding = findingsById.get(findingId);
    if (!finding) continue;
    for (const criterion of finding.wcagCriteria) criteria.add(criterion);
  }
  return [...criteria];
}

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
 *  .passthrough(). See docs/rules/llm-layer-rules.md section 9.
 *
 *  legalRelevance is built here, deterministically, from filteredFindings
 *  rather than trusted from the writing pass (which no longer has a field
 *  for it at all as of docs/archive/report-v2-refactor.md 4.3) - the model
 *  chooses no part of this sentence. */
export function mergeAnalysisPasses(
  structureDoc: Pick<StructureDocument, 'themes' | 'quickWins' | 'overallRisk'>,
  writingOutput: WritingPassOutput,
  filteredFindings: readonly Finding[],
  language: 'fr' | 'en',
): LlmOutput {
  const writingByKey = new Map(writingOutput.themes.map((theme) => [theme.themeKey, theme]));
  const findingsById = new Map(filteredFindings.map((finding) => [finding.findingId, finding]));

  const themes: Theme[] = structureDoc.themes.map((structureTheme) => {
    const writingTheme = writingByKey.get(structureTheme.themeKey);
    if (!writingTheme) {
      throw new Error(
        `odysseus analyze: merge invariant violated - no writing-pass theme for themeKey ` +
          `${structureTheme.themeKey}. This should have been caught by findThemeKeyMismatches before merge.`,
      );
    }

    const wcagCriteria =
      structureTheme.category === 'accessibility'
        ? themeWcagCriteria(structureTheme, findingsById)
        : [];
    const legalRelevance =
      wcagCriteria.length > 0 ? buildLegalRelevance(wcagCriteria, language) : undefined;

    return {
      title: writingTheme.title,
      category: structureTheme.category,
      businessImpact: writingTheme.businessImpact,
      effort: structureTheme.effort,
      impact: structureTheme.impact,
      priorityRank: structureTheme.priorityRank,
      findingIds: structureTheme.findingIds,
      recommendedActions: writingTheme.recommendedActions,
      ...(legalRelevance ? { legalRelevance } : {}),
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
