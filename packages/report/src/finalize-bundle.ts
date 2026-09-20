/**
 * Plan 072: applying an operator's override file to a render bundle.
 *
 * `applyWritingOverrides` judges a correction against the writing input the
 * prose was generated from - that is what lets it hold operator prose to the
 * same evidence the model was held to. A bundle does not carry that input,
 * and shipping it would mean two copies of it to keep in step. It does not
 * need to: everything the input is built from survives into the bundle, and
 * this module rebuilds it.
 *
 * The rebuild is exact, not approximate, and each piece says why:
 *
 * - `mergeAnalysisPasses` copies `category`, `effort`, `impact`,
 *   `priorityRank` and `findingIds` verbatim from each structure theme onto
 *   the stored theme at the same index, so a stored analysis already carries
 *   its own structure themes.
 * - `themeKey` is the one structure field the locked `Theme` schema
 *   deliberately has no room for. It is re-derived as `t1..tN` by index,
 *   which is what `assignThemeKeys` assigns. It is an opaque correlation id:
 *   the input side and the output side are derived here by the same rule, so
 *   they agree with each other, which is the only thing any consumer asks of
 *   it.
 * - the performance evidence packet is `buildWritingPerformanceEvidence` of
 *   the manifest and the bundle's evidence limitations, the same two inputs
 *   the analysis stage gives it.
 *
 * This module never calls a model and opens no connection. It is what the
 * CLI finalizer runs.
 */

import type { AuditManifest, EvidenceLimitation, Finding } from '@odysseus/core';
import {
  applyWritingOverrides,
  buildFallbackSiteContext,
  buildWritingInput,
  computeSiteStats,
  deriveTransactionalFlowStatus,
  filterFindingsForLlm,
  findOverrideLineageMismatch,
  partitionFindings,
  type WritingInput,
  type WritingOverrideFile,
  type WritingPassOutput,
  type WritingSiteContext,
} from '@odysseus/llm';
import type { RenderBundle } from './render-bundle.js';
import {
  buildTrustedRemediationsByTheme,
  buildWritingPerformanceEvidence,
} from './template/sections/writing-evidence.js';
import type { StoredAnalysis } from './types.js';

/** The categories a structure pass can produce. A stored theme's category is
 *  deliberately wider (`StoredThemeCategory` includes `geo`, which the
 *  evidence-bound path groups deterministically and no model may synthesize),
 *  so a stored analysis is not always the output of a writing pass this can
 *  rebuild the input for. */
const STRUCTURE_CATEGORIES = new Set([
  'accessibility',
  'seo',
  'performance',
  'rendering',
  'privacy',
]);

/** Why this analysis's writing input cannot be rebuilt faithfully, or
 *  undefined when it can. Refusing is the point: a rebuilt input that is
 *  merely close would judge the operator's prose against evidence the writer
 *  never saw. */
export function findWritingInputRebuildIssue(analysis: StoredAnalysis): string | undefined {
  if (analysis.generationMode === 'static-fallback') {
    return (
      'this analysis came from the audit fallback gate, so no writing pass produced its prose ' +
      'and there is no writing input to hold a correction against'
    );
  }
  const foreign = analysis.themes.find((theme) => !STRUCTURE_CATEGORIES.has(theme.category));
  if (foreign !== undefined) {
    return (
      `theme "${foreign.title}" has category ${foreign.category}, which no structure pass ` +
      'produces, so this analysis was not written by the pass these corrections are guarded against'
    );
  }
  return undefined;
}

/** `assignThemeKeys` assigns `t${index + 1}`. See the module docblock for why
 *  re-deriving it here is sound rather than a guess at what a structure
 *  document on disk happens to hold. */
function themeKeyAt(index: number): string {
  return `t${index + 1}`;
}

/** Rebuilds the writing input a stored analysis was generated from, mirroring
 *  the analysis stage's construction. */
export function rebuildWritingInput(args: {
  manifest: AuditManifest;
  findings: readonly Finding[];
  analysis: StoredAnalysis;
  qualityLimitations?: readonly EvidenceLimitation[];
}): WritingInput {
  const { manifest, findings, analysis } = args;
  const issue = findWritingInputRebuildIssue(analysis);
  if (issue !== undefined) throw new Error(`writing input rebuild refused: ${issue}`);
  const language = analysis.language;
  const qualityLimitations = args.qualityLimitations ?? [];

  const structureThemes = analysis.themes.map((theme, index) => ({
    themeKey: themeKeyAt(index),
    // Narrowed by findWritingInputRebuildIssue above.
    category: theme.category as 'accessibility' | 'seo' | 'performance' | 'rendering' | 'privacy',
    effort: theme.effort,
    impact: theme.impact,
    priorityRank: theme.priorityRank,
    findingIds: theme.findingIds,
  }));

  // The same severity floor and diversion partition the analysis stage
  // applies, so the guards see the finding packet the writer actually had.
  const { forModel } = partitionFindings(filterFindingsForLlm([...findings]), manifest);

  return buildWritingInput(
    structureThemes,
    forModel,
    (analysis.siteContext ?? buildFallbackSiteContext()) as WritingSiteContext,
    language,
    // siteStats is computed from the unfiltered findings, not forModel, the
    // same way the analysis stage does it.
    computeSiteStats([...findings], manifest),
    buildWritingPerformanceEvidence(manifest, qualityLimitations),
    buildTrustedRemediationsByTheme(structureThemes, forModel, language),
    analysis.obligationAssessment === undefined
      ? 'unknown'
      : deriveTransactionalFlowStatus(analysis.obligationAssessment),
    // Seeds the provider-phrase choice, stable across a re-run and across
    // both languages.
    manifest.auditId,
    analysis.obligationAssessment?.status ?? 'unknown',
    qualityLimitations.map((limitation) => limitation.summary[language]),
  );
}

/** Projects the stored analysis back to the prose the writing pass produced.
 *  `mergeAnalysisPasses` copies every one of these fields verbatim, so this
 *  is a projection, not a reconstruction. */
export function projectWritingOutput(analysis: StoredAnalysis): WritingPassOutput {
  return {
    executiveSummary: analysis.executiveSummary,
    notes: analysis.notes,
    themes: analysis.themes.map((theme, index) => ({
      themeKey: themeKeyAt(index),
      title: theme.title,
      businessImpact: theme.businessImpact,
      recommendedActions: theme.recommendedActions,
    })),
  };
}

/** Writes corrected prose back onto the analysis, leaving every deterministic
 *  field - category, effort, impact, ranking, finding ids, legal relevance,
 *  quick wins, overall risk - exactly as generated. */
function withWritingOutput(analysis: StoredAnalysis, output: WritingPassOutput): StoredAnalysis {
  return {
    ...analysis,
    executiveSummary: output.executiveSummary,
    notes: output.notes,
    themes: analysis.themes.map((theme, index) => {
      const written = output.themes[index]!;
      return {
        ...theme,
        title: written.title,
        businessImpact: written.businessImpact,
        recommendedActions: [...written.recommendedActions],
      };
    }),
  };
}

export interface FinalizedBundle {
  status: 'applied';
  bundle: RenderBundle;
  /** Guards the pre-override prose already failed, for the finalizer to
   *  print. Not a refusal; see `applyWritingOverrides`. */
  preExistingGuardFailures: readonly string[];
}

export interface RefusedBundle {
  status: 'refused';
  reason: string;
}

/**
 * Returns the bundle the finalizer renders: the same manifest, findings and
 * render inputs, with the operator's prose spliced into the analysis.
 *
 * The bundle's lineage is left untouched. It still describes the analysis the
 * corrections were written against, which is what the upload checks against
 * the audit's current state, and what makes a finalization that a later
 * regeneration has overtaken visible rather than silent.
 */
export function applyOverridesToBundle(
  bundle: RenderBundle,
  file: WritingOverrideFile,
): FinalizedBundle | RefusedBundle {
  const mismatch = findOverrideLineageMismatch(file, {
    auditId: bundle.lineage.auditId,
    language: bundle.lineage.language,
    analysisDigest: bundle.lineage.analysisDigest,
    findingsDigest: bundle.lineage.findingsProvenance.findingsDigest,
  });
  if (mismatch !== undefined) return { status: 'refused', reason: mismatch };

  const rebuildIssue = findWritingInputRebuildIssue(bundle.analysis);
  if (rebuildIssue !== undefined) return { status: 'refused', reason: rebuildIssue };

  const result = applyWritingOverrides({
    input: rebuildWritingInput({
      manifest: bundle.manifest,
      findings: bundle.findings,
      analysis: bundle.analysis,
      ...(bundle.qualityLimitations !== undefined
        ? { qualityLimitations: bundle.qualityLimitations }
        : {}),
    }),
    written: projectWritingOutput(bundle.analysis),
    overrides: file.overrides,
  });
  if (result.status === 'refused') return result;

  return {
    status: 'applied',
    bundle: { ...bundle, analysis: withWritingOutput(bundle.analysis, result.output) },
    preExistingGuardFailures: result.preExistingGuardFailures,
  };
}
