import type { WritingSanitizationWarning } from '@odysseus/core';
import type { AnalyzeWritingResult } from './analyze-writing.js';
import { runWritingCritic } from './analyze-critic.js';
import { callOpenAiForWriting } from './client.js';
import { OPENAI_MODEL, WRITING_CRITIC_ENABLED } from './constants.js';
import { emptyCriticDropCounts, type CriticDropCounts } from './critic-issues.js';
import type { WritingCriticIssue } from './critic-schema.js';
import { listWritingProseFields } from './prose-fields.js';
import { selectProviderPhrase } from './provider-phrase-guard.js';
import { sanitizeWritingOutput } from './sanitize-writing-output.js';
import { captureLlmCallTelemetry, usageTelemetryFields } from './telemetry/llm-telemetry.js';
import { normalizeWritingOutputTypography } from './typography.js';
import { buildWritingGuards, runWritingGuards } from './writing-guards.js';
import type { WritingInput, WritingPassOutput, WritingTheme } from './writing-schema.js';

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
  /** Field paths whose text the applied repair replaced. */
  repairedFields: readonly string[];
}

export interface CritiquedWritingResult extends AnalyzeWritingResult {
  /** Absent when WRITING_CRITIC_ENABLED is off: the result is then exactly
   *  the writer's. */
  critic?: {
    record: WritingCriticRecord;
    sidecar: WritingCriticSidecar;
  };
}

/** One field's theme key, parsed from its registry path. */
function themeKeyOfField(field: string): string | null {
  return /^themes\[\d+\]\(([^)]+)\)\./u.exec(field)?.[1] ?? null;
}

/** The correction the repair call receives, through the same
 *  previousRejection slot a guard retry uses. */
export function buildCriticRepairFeedback(issues: readonly WritingCriticIssue[]): string {
  const list = issues
    .map(
      (issue, index) =>
        `(${index + 1}) ${issue.field} [${issue.category}; findings ${issue.findingIds.join(', ')}]: ${issue.problem}`,
    )
    .join(' ');
  return `An evidence review of your previous response found these problems: ${list} Rewrite the themes shown so that every listed problem is fixed using only the evidence in this input. Keep every sentence that has no listed problem as close to its previous wording as possible. Every other requirement still applies.`;
}

/** Re-indexes a sanitation warning from the repair's theme subset onto the
 *  full output's theme order. */
function remapWarning(
  warning: WritingSanitizationWarning,
  indexByKey: ReadonlyMap<string, number>,
): WritingSanitizationWarning {
  const field = warning.field.replace(/^themes\[\d+\]\(([^)]+)\)/u, (whole, key: string) => {
    const index = indexByKey.get(key);
    return index === undefined ? whole : `themes[${index}](${key})`;
  });
  return { code: warning.code, field };
}

function isWarningOnReplacedField(
  warning: WritingSanitizationWarning,
  replacedThemeKeys: ReadonlySet<string>,
  replacedSummary: boolean,
  replacedNotes: boolean,
): boolean {
  if (warning.field === 'executiveSummary') return replacedSummary;
  if (warning.field === 'notes') return replacedNotes;
  const key = themeKeyOfField(warning.field);
  return key !== null && replacedThemeKeys.has(key);
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
      repairedFields: readonly string[];
    }
  | { status: 'discarded'; reason: string };

/**
 * Decision 7: one writer call over only the flagged themes (and the summary
 * or notes when flagged), then the repaired fields replace their originals
 * and every other field is copied from the pre-critic output by reference.
 * The merged output must pass the full guard table: any blocking failure, or
 * a style failure the pre-critic output did not already have, discards the
 * whole repair.
 */
async function attemptRepair(
  input: WritingInput,
  expectedThemeKeys: readonly string[],
  usedFallbackContext: boolean,
  original: AnalyzeWritingResult,
  issues: readonly WritingCriticIssue[],
): Promise<RepairAttempt> {
  const startedAtMs = Date.now();
  const flaggedThemeKeys = new Set(
    issues.map((issue) => themeKeyOfField(issue.field)).filter((key) => key !== null),
  );
  const summaryFlagged = issues.some((issue) => issue.field === 'executiveSummary');
  const notesFlagged = issues.some((issue) => issue.field === 'notes');
  const flaggedThemes = input.themes.filter((theme) => flaggedThemeKeys.has(theme.themeKey));
  // The writing schema needs at least one theme. When only the summary or
  // notes are flagged, the top theme rides along as context and its rewrite
  // is ignored.
  const repairThemes = flaggedThemes.length > 0 ? flaggedThemes : input.themes.slice(0, 1);
  const repairInput: WritingInput = { ...input, themes: repairThemes };

  const discard = (
    reason: string,
    guards: Parameters<typeof captureLlmCallTelemetry>[0],
  ): RepairAttempt => {
    console.error(
      `odysseus analyze (critic repair, language=${input.language}): discarded - ${reason}`,
    );
    captureLlmCallTelemetry(guards);
    return { status: 'discarded', reason };
  };

  let raw: Awaited<ReturnType<typeof callOpenAiForWriting>>;
  try {
    raw = await callOpenAiForWriting(
      repairInput,
      usedFallbackContext,
      buildCriticRepairFeedback(issues),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return discard(`repair call failed: ${reason}`, {
      kind: 'call-rejected',
      pass: 'writing',
      model: OPENAI_MODEL,
      language: input.language,
      attemptCount: 1,
      durationMs: Date.now() - startedAtMs,
      guards: ['response-invalid'],
      styleOnly: false,
    });
  }

  const sanitized = sanitizeWritingOutput(repairInput, raw.output);
  const repairedByKey = new Map(sanitized.output.themes.map((theme) => [theme.themeKey, theme]));
  const normalizedRepair = normalizeWritingOutputTypography(sanitized.output, input.language);
  const normalizedByKey = new Map(normalizedRepair.themes.map((theme) => [theme.themeKey, theme]));

  const merge = (
    repaired: ReadonlyMap<string, WritingTheme>,
    summary: string,
    notes: string,
  ): WritingPassOutput => ({
    themes: original.output.themes.map((theme) =>
      flaggedThemeKeys.has(theme.themeKey) ? (repaired.get(theme.themeKey) ?? theme) : theme,
    ),
    executiveSummary: summaryFlagged ? summary : original.output.executiveSummary,
    notes: notesFlagged ? notes : original.output.notes,
  });

  // Guards see the sanitized repair before typography normalization, the
  // same order analyzeWriting keeps.
  const candidate = merge(repairedByKey, sanitized.output.executiveSummary, sanitized.output.notes);
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
      {
        kind: 'call-rejected',
        pass: 'writing',
        model: OPENAI_MODEL,
        language: input.language,
        attemptCount: 1,
        durationMs: Date.now() - startedAtMs,
        guards: failures.map((failure) => failure.guard),
        styleOnly: failures.every((failure) => failure.severity === 'style'),
      },
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

  const output = merge(normalizedByKey, normalizedRepair.executiveSummary, normalizedRepair.notes);
  const indexByKey = new Map(output.themes.map((theme, index) => [theme.themeKey, index]));
  const keptWarnings = original.sanitizationWarnings.filter(
    (warning) => !isWarningOnReplacedField(warning, flaggedThemeKeys, summaryFlagged, notesFlagged),
  );
  const repairWarnings = sanitized.warnings
    .map((warning) => remapWarning(warning, indexByKey))
    .filter((warning) =>
      isWarningOnReplacedField(warning, flaggedThemeKeys, summaryFlagged, notesFlagged),
    );
  const replaced = listWritingProseFields(output)
    .filter((entry) =>
      entry.themeKey === null
        ? (entry.field === 'executiveSummary' && summaryFlagged) ||
          (entry.field === 'notes' && notesFlagged)
        : flaggedThemeKeys.has(entry.themeKey),
    )
    .map((entry) => entry.field);

  return {
    status: 'applied',
    output,
    warnings: [...keptWarnings, ...repairWarnings],
    repairedFields: replaced,
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
        sidecar: { ...base, status: 'no-issues', repairedFields: [] },
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
        sidecar: { ...base, status: 'repair-discarded', reason: repair.reason, repairedFields: [] },
      },
    };
  }
  return {
    ...written,
    output: repair.output,
    sanitizationWarnings: repair.warnings,
    critic: {
      record,
      sidecar: { ...base, status: 'repair-applied', repairedFields: repair.repairedFields },
    },
  };
}
