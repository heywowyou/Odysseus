import type { WritingSanitizationWarning } from '@odysseus/core';
import type { WritingGuardName } from './telemetry/events.js';
import type { AnalyzeWritingResult } from './analyze-writing.js';
import { runWritingCritic } from './analyze-critic.js';
import { callOpenAiForFieldRepair } from './client.js';
import { OPENAI_MODEL, WRITING_CRITIC_ENABLED } from './constants.js';
import { emptyCriticDropCounts, type CriticDropCounts } from './critic-issues.js';
import type { WritingCriticIssue } from './critic-schema.js';
import { selectProviderPhrase } from './provider-phrase-guard.js';
import { sanitizeWritingOutput } from './sanitize-writing-output.js';
import { captureLlmCallTelemetry, usageTelemetryFields } from './telemetry/llm-telemetry.js';
import { normalizeReportTypography } from './typography.js';
import { buildWritingGuards, runWritingGuards } from './writing-guards.js';
import {
  readField,
  reindexWarning,
  spliceReplacements,
  writeFields,
} from './writing-field-paths.js';
import type { WritingInput, WritingPassOutput } from './writing-schema.js';

/** Persisted on the analysis (Plan 070 decision 10). Counts only, so it is
 *  safe anywhere the analysis goes. */
export interface WritingCriticRecord {
  ran: boolean;
  issuesRaised: number;
  issuesAccepted: number;
  repairApplied: boolean;
}

export type WritingCriticOutcomeStatus =
  'critic-skipped' | 'no-issues' | 'repair-applied' | 'repair-discarded';

/** Operator-only sidecar written beside the analysis (decision 8). It holds
 *  the critic's `problem` text, which is why it is never merged into the
 *  analysis or handed to the report renderer. */
export interface WritingCriticSidecar {
  language: WritingInput['language'];
  model: string;
  status: WritingCriticOutcomeStatus;
  /** Why the critic was skipped or the repair discarded. */
  reason?: string;
  issuesRaised: number;
  dropped: CriticDropCounts;
  issues: readonly WritingCriticIssue[];
  /** Field paths (pre-repair numbering) whose text the applied repair
   *  replaced or, for a redundant action, removed. */
  repairedFields: readonly string[];
  /** Before and after text of each replaced field, for operator review. */
  replacements: readonly WritingCriticReplacement[];
}

export interface CritiquedWritingResult extends AnalyzeWritingResult {
  /** Absent when WRITING_CRITIC_ENABLED is off: the result is then exactly
   *  the writer's. */
  critic?: {
    record: WritingCriticRecord;
    sidecar: WritingCriticSidecar;
  };
}

/** One field the applied repair changed, in the pre-repair path space.
 *  `after` is null when a redundant recommended action was removed. */
export interface WritingCriticReplacement {
  field: string;
  before: string;
  after: string | null;
}

function residualWarnings(
  issues: readonly WritingCriticIssue[],
): readonly WritingSanitizationWarning[] {
  const fields = [...new Set(issues.map((issue) => issue.field))];
  return fields.map((field) => ({ code: 'critic-unresolved', field }));
}

type RepairAttempt =
  | {
      status: 'applied';
      output: WritingPassOutput;
      warnings: readonly WritingSanitizationWarning[];
      replacements: readonly WritingCriticReplacement[];
    }
  | { status: 'discarded'; reason: string };

/**
 * Decision 7, tightened by the B6 calibration: one call that returns a
 * replacement for each flagged field only, written with the whole input and
 * report in view. The replacements are sanitized, spliced into the
 * pre-critic output by field path, and every unflagged field keeps its
 * identity. The merged output must pass the full guard table: any blocking
 * failure, or a style failure the pre-critic output did not already have,
 * discards the whole repair.
 */
async function attemptRepair(
  input: WritingInput,
  expectedThemeKeys: readonly string[],
  usedFallbackContext: boolean,
  original: AnalyzeWritingResult,
  issues: readonly WritingCriticIssue[],
): Promise<RepairAttempt> {
  const startedAtMs = Date.now();

  const discard = (
    reason: string,
    guards: readonly WritingGuardName[],
    styleOnly = false,
  ): RepairAttempt => {
    console.error(
      `odysseus analyze (critic repair, language=${input.language}): discarded - ${reason}`,
    );
    captureLlmCallTelemetry({
      kind: 'call-rejected',
      pass: 'writing',
      model: OPENAI_MODEL,
      language: input.language,
      attemptCount: 1,
      durationMs: Date.now() - startedAtMs,
      guards: [...guards],
      styleOnly,
    });
    return { status: 'discarded', reason };
  };

  let raw: Awaited<ReturnType<typeof callOpenAiForFieldRepair>>;
  try {
    raw = await callOpenAiForFieldRepair(input, usedFallbackContext, original.output, issues);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return discard(`repair call failed: ${reason}`, ['response-invalid']);
  }

  const spliced = spliceReplacements(original.output, new Map(Object.entries(raw.output)));
  if (typeof spliced === 'string') return discard(spliced, ['response-invalid']);

  // Sanitation runs over the whole spliced output (the category of each
  // theme matters), but only the replaced fields take its result. A
  // sanitizer that drops a whole replaced action would shift indices, so
  // that repair is discarded rather than guessed at.
  const sanitized = sanitizeWritingOutput(input, spliced.output);
  const replacedPaths = new Set(spliced.newPathByField.values());
  const sanitizedTexts = new Map<string, string>();
  for (const path of replacedPaths) {
    const text = readField(sanitized.output, path);
    if (text === undefined) return discard(`sanitation removed ${path}`, ['response-invalid']);
    sanitizedTexts.set(path, text);
  }
  for (const [themeIndex, theme] of spliced.output.themes.entries()) {
    if (
      sanitized.output.themes[themeIndex]!.recommendedActions.length !==
      theme.recommendedActions.length
    ) {
      return discard(`sanitation changed the actions of ${theme.themeKey}`, ['response-invalid']);
    }
  }

  // Guards see the sanitized replacements before typography normalization,
  // the same order analyzeWriting keeps.
  const candidate = writeFields(spliced.output, sanitizedTexts);
  const assignedProviderPhrase = input.providerPhrase ?? selectProviderPhrase(input.language);
  const guards = buildWritingGuards(input, expectedThemeKeys, assignedProviderPhrase);
  const baselineStyle = new Set(
    runWritingGuards(guards, original.output)
      .filter((failure) => failure.severity === 'style')
      .map((failure) => failure.guard),
  );
  const failures = runWritingGuards(guards, candidate).filter(
    (failure) => failure.severity === 'blocking' || !baselineStyle.has(failure.guard),
  );
  if (failures.length > 0) {
    return discard(
      `repaired output failed guard(s): ${failures.map((failure) => failure.reason).join(' ')}`,
      failures.map((failure) => failure.guard),
      failures.every((failure) => failure.severity === 'style'),
    );
  }

  captureLlmCallTelemetry({
    kind: 'call-succeeded',
    pass: 'writing',
    model: OPENAI_MODEL,
    language: input.language,
    attemptCount: 1,
    durationMs: Date.now() - startedAtMs,
    schemaValidFirstAttempt: true,
    ...usageTelemetryFields(raw.usage),
  });

  const normalizedTexts = new Map(
    [...sanitizedTexts].map(([path, text]) => [
      path,
      normalizeReportTypography(text, input.language),
    ]),
  );
  const output = writeFields(spliced.output, normalizedTexts);

  const oldPaths = new Set(Object.keys(raw.output));
  const keptWarnings = original.sanitizationWarnings
    .filter((warning) => !oldPaths.has(warning.field))
    .map((warning) => reindexWarning(warning, spliced.actionIndexMaps))
    .filter((warning) => warning !== null);
  const repairWarnings = sanitized.warnings.filter((warning) => replacedPaths.has(warning.field));

  const replacements = Object.keys(raw.output).map((field) => {
    const newPath = spliced.newPathByField.get(field);
    return {
      field,
      before: readField(original.output, field) ?? '',
      after: newPath === undefined ? null : (normalizedTexts.get(newPath) ?? null),
    };
  });

  return {
    status: 'applied',
    output,
    warnings: [...keptWarnings, ...repairWarnings],
    replacements,
  };
}

/**
 * Plan 070: the grounded critic and its one targeted repair, applied to a
 * writer result that already passed every guard.
 *
 * With WRITING_CRITIC_ENABLED off this returns `written` itself and makes no
 * call. On, it adds exactly one critic call and at most one repair call, and
 * it is fail-open end to end (decision 1): a skipped critic, an empty issue
 * list, or a discarded repair all return the pre-critic output. It never
 * throws for a critic or repair defect. Issues a discarded repair left
 * standing become `critic-unresolved` field-path warnings (decision 8).
 */
export async function critiqueAndRepairWriting(
  input: WritingInput,
  expectedThemeKeys: readonly string[],
  usedFallbackContext: boolean,
  written: AnalyzeWritingResult,
): Promise<CritiquedWritingResult> {
  if (!WRITING_CRITIC_ENABLED) return written;
  return runCriticAndRepair(input, expectedThemeKeys, usedFallbackContext, written);
}

/** The critic and repair regardless of the kill switch. Production reaches
 *  it only through critiqueAndRepairWriting; the Plan 070 calibration tool
 *  calls it directly to measure the critic before it is switched on. */
export async function runCriticAndRepair(
  input: WritingInput,
  expectedThemeKeys: readonly string[],
  usedFallbackContext: boolean,
  written: AnalyzeWritingResult,
): Promise<CritiquedWritingResult> {
  const critic = await runWritingCritic(input, written.output);
  if (critic.status === 'skipped') {
    return {
      ...written,
      critic: {
        record: { ran: false, issuesRaised: 0, issuesAccepted: 0, repairApplied: false },
        sidecar: {
          language: input.language,
          model: OPENAI_MODEL,
          status: 'critic-skipped',
          reason: critic.reason,
          issuesRaised: 0,
          dropped: emptyCriticDropCounts(),
          issues: [],
          repairedFields: [],
          replacements: [],
        },
      },
    };
  }

  const base = {
    language: input.language,
    model: OPENAI_MODEL,
    issuesRaised: critic.raised,
    dropped: critic.dropped,
    issues: critic.issues,
  };
  if (critic.issues.length === 0) {
    return {
      ...written,
      critic: {
        record: {
          ran: true,
          issuesRaised: critic.raised,
          issuesAccepted: 0,
          repairApplied: false,
        },
        sidecar: { ...base, status: 'no-issues', repairedFields: [], replacements: [] },
      },
    };
  }

  const repair = await attemptRepair(
    input,
    expectedThemeKeys,
    usedFallbackContext,
    written,
    critic.issues,
  );
  const record: WritingCriticRecord = {
    ran: true,
    issuesRaised: critic.raised,
    issuesAccepted: critic.issues.length,
    repairApplied: repair.status === 'applied',
  };
  if (repair.status === 'discarded') {
    return {
      ...written,
      sanitizationWarnings: [...written.sanitizationWarnings, ...residualWarnings(critic.issues)],
      critic: {
        record,
        sidecar: {
          ...base,
          status: 'repair-discarded',
          reason: repair.reason,
          repairedFields: [],
          replacements: [],
        },
      },
    };
  }
  return {
    ...written,
    output: repair.output,
    sanitizationWarnings: repair.warnings,
    critic: {
      record,
      sidecar: {
        ...base,
        status: 'repair-applied',
        repairedFields: repair.replacements.map((entry) => entry.field),
        replacements: repair.replacements,
      },
    },
  };
}
