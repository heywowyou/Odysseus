/**
 * Plan 072: the operator's corrections to a report that has already been
 * generated, applied as data.
 *
 * The finalizer's premise is that a report the operator has read front to
 * back is worth more than a report the pipeline has re-rolled. An override
 * file names the prose fields to change and the exact text to change them
 * from and to, so the delivered PDF carries the operator's wording while the
 * stored analysis keeps what the model actually wrote. The file plus the
 * lineage digests are the provenance link between the two.
 *
 * Nothing here calls a model. The operator is the author; this module is the
 * gate, and it fails closed:
 *
 * - the file is bound to one analysis by digest, so text regenerated since it
 *   was written cannot be spliced with corrections meant for the old text;
 * - a path must be one `listWritingProseFields` returns, which is what makes
 *   finding ids, counts, severities, ranking and every other deterministic
 *   field unreachable by construction rather than by a denylist;
 * - `from` must match the current text exactly, so an override written
 *   against a field the operator misread is refused rather than applied
 *   somewhere it does not belong;
 * - the result goes through `sanitizeWritingOutput` and the whole guard
 *   table. Operator prose is not model output, but it lands in the same
 *   report, under the same product rules: it may not invent a page count,
 *   claim a sanction, or contradict the reconciled performance evidence.
 */

import { z } from 'zod';
import type { ReportLanguage, WritingSanitizationWarning } from '@odysseus/core';
import { listWritingProseFields } from './prose-fields.js';
import { selectProviderPhrase } from './provider-phrase-guard.js';
import { sanitizeWritingOutput } from './sanitize-writing-output.js';
import { normalizeReportTypography } from './typography.js';
import {
  readField,
  reindexWarning,
  spliceReplacements,
  writeFields,
} from './writing-field-paths.js';
import { buildWritingGuards, runWritingGuards } from './writing-guards.js';
import type { WritingGuardName } from './telemetry/events.js';
import type { WritingInput, WritingPassOutput } from './writing-schema.js';

const writingOverrideSchema = z
  .object({
    /** A path from `listWritingProseFields` for the analysis this file is
     *  bound to, e.g. `themes[2](t3).businessImpact`. */
    path: z.string().min(1),
    /** The current text, verbatim. A mismatch refuses the whole file. */
    from: z.string(),
    to: z.string().min(1),
    /** Operator-facing, carried into the audit trail. Required: an
     *  unexplained rewrite of a delivered report is what this whole
     *  mechanism exists to avoid. */
    reason: z.string().min(1),
  })
  .strict();

export const writingOverrideFileSchema = z
  .object({
    auditId: z.string().min(1),
    language: z.enum(['fr', 'en']),
    /** `RenderBundleLineage.analysisDigest` of the bundle this was written
     *  against, copied verbatim. */
    analysisDigest: z.string().min(1),
    /** `RenderBundleLineage.findingsProvenance.findingsDigest`, likewise. */
    findingsDigest: z.string().min(1),
    overrides: z.array(writingOverrideSchema).min(1),
  })
  .strict();

export type WritingOverride = z.infer<typeof writingOverrideSchema>;
export type WritingOverrideFile = z.infer<typeof writingOverrideFileSchema>;

/** Validates an override file loaded from disk before it is trusted - the
 *  same posture as `parseStructureDocument`. */
export function parseWritingOverrideFile(raw: unknown): WritingOverrideFile {
  return writingOverrideFileSchema.parse(raw);
}

/** The subset of `RenderBundleLineage` an override file is bound to. Kept as
 *  plain fields so this package does not depend on @odysseus/report, which
 *  depends on it. */
export interface WritingOverrideLineage {
  auditId: string;
  language: ReportLanguage;
  analysisDigest: string;
  findingsDigest: string;
}

/** Why this override file does not belong to this bundle, or undefined when
 *  it does. Every mismatch is fatal: an override is a correction to one exact
 *  text, and there is no partial application of it. */
export function findOverrideLineageMismatch(
  file: WritingOverrideFile,
  lineage: WritingOverrideLineage,
): string | undefined {
  if (file.auditId !== lineage.auditId) {
    return `override file is for audit ${file.auditId}, bundle is audit ${lineage.auditId}`;
  }
  if (file.language !== lineage.language) {
    return `override file is for ${file.language}, bundle is ${lineage.language}`;
  }
  if (file.analysisDigest !== lineage.analysisDigest) {
    return (
      'the analysis has been regenerated since this override file was written ' +
      `(file ${file.analysisDigest}, bundle ${lineage.analysisDigest}). ` +
      'Re-fetch the bundle and rewrite the corrections against the new text.'
    );
  }
  if (file.findingsDigest !== lineage.findingsDigest) {
    return (
      'the findings have changed since this override file was written ' +
      `(file ${file.findingsDigest}, bundle ${lineage.findingsDigest}). ` +
      'Re-fetch the bundle and rewrite the corrections against the new text.'
    );
  }
  return undefined;
}

export interface AppliedWritingOverrides {
  status: 'applied';
  output: WritingPassOutput;
  /** The original's sanitation warnings, minus those on overridden fields,
   *  reindexed onto the post-splice paths. */
  warnings: readonly WritingSanitizationWarning[];
  /** Guards the pre-override text already failed. Not a refusal - the report
   *  carrying them was already delivered, and refusing here would leave the
   *  operator unable to correct the very text that trips them - but the
   *  finalizer prints them so the operator sees what is still wrong. */
  preExistingGuardFailures: readonly WritingGuardName[];
}

export interface RefusedWritingOverrides {
  status: 'refused';
  reason: string;
}

export type WritingOverrideResult = AppliedWritingOverrides | RefusedWritingOverrides;

/**
 * Applies the operator's corrections to the prose the writing pass produced.
 *
 * `input` is the writing input this output was generated from, rebuilt from
 * the bundle. It is what the sanitizer and the guard table judge against, so
 * the override is held to the same evidence the model was.
 *
 * A guard the original already failed does not refuse the override - see
 * `preExistingGuardFailures`. A guard the override *introduces* always does,
 * whatever its severity: the operator is editing one field at a time and can
 * fix it, which is not the situation the style-guard escape was built for.
 */
export function applyWritingOverrides(args: {
  input: WritingInput;
  written: WritingPassOutput;
  overrides: readonly WritingOverride[];
  /** The original's own sanitation warnings, carried forward. */
  warnings?: readonly WritingSanitizationWarning[];
}): WritingOverrideResult {
  const { input, written, overrides } = args;
  const refuse = (reason: string): RefusedWritingOverrides => ({ status: 'refused', reason });

  const proseByPath = new Map(
    listWritingProseFields(written).map((entry) => [entry.field, entry.text]),
  );
  const texts = new Map<string, string>();
  for (const override of overrides) {
    if (texts.has(override.path)) {
      return refuse(`${override.path} is overridden twice; each field may be corrected once`);
    }
    const current = proseByPath.get(override.path);
    if (current === undefined) {
      return refuse(
        `${override.path} is not a prose field of this analysis. Only the fields the writing ` +
          'pass authored can be corrected; everything else the report renders is deterministic.',
      );
    }
    if (current !== override.from) {
      return refuse(
        `${override.path} no longer reads as the override expects, so the correction would be ` +
          `applied to text it was not written for.\n  expected: ${JSON.stringify(override.from)}\n  actual:   ${JSON.stringify(current)}`,
      );
    }
    if (override.to === override.from) {
      return refuse(`${override.path} overrides text to itself`);
    }
    texts.set(override.path, override.to);
  }

  const spliced = spliceReplacements(written, texts);
  if (typeof spliced === 'string') return refuse(spliced);

  // Sanitation runs over the whole spliced output, because the category of
  // each theme decides which performance sentences survive. Only the
  // overridden fields are read back from it: an operator's correction that
  // the deterministic layer would rewrite is refused and named, rather than
  // silently shipped as something the operator did not write.
  const sanitized = sanitizeWritingOutput(input, spliced.output);
  const overriddenPaths = new Set(spliced.newPathByField.values());
  for (const [themeIndex, theme] of spliced.output.themes.entries()) {
    if (
      sanitized.output.themes[themeIndex]!.recommendedActions.length !==
      theme.recommendedActions.length
    ) {
      return refuse(`the correction to ${theme.themeKey} does not survive sanitation`);
    }
  }
  for (const path of overriddenPaths) {
    const text = readField(sanitized.output, path);
    if (text === undefined) return refuse(`sanitation removed ${path}`);
    if (text !== readField(spliced.output, path)) {
      return refuse(
        `${path} is rewritten by sanitation, so the delivered report would not carry the text ` +
          `the override asks for.\n  written:   ${JSON.stringify(readField(spliced.output, path))}\n  sanitized: ${JSON.stringify(text)}`,
      );
    }
  }

  const assignedProviderPhrase = input.providerPhrase ?? selectProviderPhrase(input.language);
  const expectedThemeKeys = input.themes.map((theme) => theme.themeKey);
  const guards = buildWritingGuards(input, expectedThemeKeys, assignedProviderPhrase);
  const baseline = new Set(runWritingGuards(guards, written).map((failure) => failure.guard));
  const introduced = runWritingGuards(guards, spliced.output).filter(
    (failure) => !baseline.has(failure.guard),
  );
  if (introduced.length > 0) {
    return refuse(
      `the corrected text fails guard(s) the original passed: ${introduced
        .map((failure) => failure.reason)
        .join(' ')}`,
    );
  }

  // Typography last, matching the order analyzeWriting keeps: the guards
  // judge the operator's own words, then the whole document gets the same
  // French spacing and punctuation as every other field in it.
  const normalized = new Map(
    [...overriddenPaths].map((path) => [
      path,
      normalizeReportTypography(readField(spliced.output, path)!, input.language),
    ]),
  );

  const overriddenOldPaths = new Set(texts.keys());
  return {
    status: 'applied',
    output: writeFields(spliced.output, normalized),
    warnings: (args.warnings ?? [])
      .filter((warning) => !overriddenOldPaths.has(warning.field))
      .map((warning) => reindexWarning(warning, spliced.actionIndexMaps))
      .filter((warning): warning is WritingSanitizationWarning => warning !== null),
    preExistingGuardFailures: [...baseline],
  };
}
