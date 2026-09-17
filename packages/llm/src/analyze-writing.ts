import { callOpenAiForWriting } from './client.js';
import { OPENAI_MODEL, WRITING_OPENAI_TEMPERATURE, MAX_RETRIES } from './constants.js';
import { selectProviderPhrase } from './provider-phrase-guard.js';
import { buildWritingRetryFeedback } from './writing-prompt.js';
import { normalizeWritingOutputTypography } from './typography.js';
import {
  buildWritingGuards,
  runWritingGuards,
  type WritingGuardFailure,
} from './writing-guards.js';
import { paceRateLimitedRetry } from './rate-limit-pacing.js';
import { captureLlmCallTelemetry } from './telemetry/llm-telemetry.js';
import type { WritingGuardName } from './telemetry/events.js';
import type { WritingInput, WritingPassOutput } from './writing-schema.js';

/** One rejected attempt, kept so the operator can see the whole run rather
 *  than only its last message. Issue #409: a run that burned three attempts
 *  on three different guards left the two earlier reasons nowhere the
 *  operator could reach without SSHing to read logs. */
export interface WritingAttemptRejection {
  /** 1-based, matching the "attempt n/N" the loop logs. */
  attempt: number;
  guards: readonly WritingGuardName[];
  reason: string;
}

export interface AnalyzeWritingResult {
  output: WritingPassOutput;
  model: string;
  temperature: number;
  /** Every attempt that was rejected before this one succeeded; empty on a
   *  clean first pass. */
  rejections: readonly WritingAttemptRejection[];
  /** Issue #407: style guards the final attempt was allowed to ship with.
   *  Non-empty means a wording defect reached the report and the operator's
   *  review is the control that catches it. */
  shippedStyleViolations: readonly WritingAttemptRejection[];
}

/** Thrown when every attempt was rejected. Carries each attempt's reason, not
 *  just the last one, so the dashboard can show the whole run. */
export class WritingPassExhaustedError extends Error {
  constructor(
    message: string,
    readonly language: 'fr' | 'en',
    readonly rejections: readonly WritingAttemptRejection[],
  ) {
    super(message);
    this.name = 'WritingPassExhaustedError';
  }
}

/** Retry-and-guard orchestration for the writing pass, independent of
 *  the structure pass's own retry budget. Rejects a response whose
 *  themeKeys don't exactly match what it was shown (the correlation
 *  guard needed to merge prose back onto the right structural theme),
 *  and rejects a response that fails the language-compliance heuristic.
 *  Both are treated exactly like an invented finding ID: rejected,
 *  logged, retried, then fail loudly. See docs/rules/llm-layer-rules.md
 *  sections 2, 6, and 9.
 *
 *  Unlike the structure pass, each retry carries the previous attempt's
 *  rejection reason into the next call (issue #21): at the configured
 *  low temperature an identical conversation reproduced the same
 *  violation on every attempt, so a retry has to be a correction. Same
 *  mechanism as the outreach loop (issue #12).
 *
 *  The guards themselves live in `writing-guards.ts` as a table. Every guard
 *  runs on every attempt and the attempt is rejected once with all of them
 *  (issue #406), because reporting one defect per attempt meant three
 *  independent defects could not be corrected inside a three-attempt budget.
 *  On the final attempt, an output whose remaining failures are all style
 *  guards is accepted rather than lost (issue #407). */
export async function analyzeWriting(
  input: WritingInput,
  expectedThemeKeys: readonly string[],
  usedFallbackContext: boolean,
): Promise<AnalyzeWritingResult> {
  let previousRejection: string | undefined;
  const rejections: WritingAttemptRejection[] = [];
  const startedAtMs = Date.now();
  // Resolved once rather than per attempt: the retry feedback must name the
  // same phrase across every attempt, or a retry contradicts its predecessor.
  const assignedProviderPhrase = input.providerPhrase ?? selectProviderPhrase(input.language);
  const guards = buildWritingGuards(input, expectedThemeKeys, assignedProviderPhrase);
  const totalAttempts = MAX_RETRIES + 1;

  const recordRejection = (
    attempt: number,
    guardNames: readonly WritingGuardName[],
    reason: string,
    styleOnly: boolean,
  ): void => {
    rejections.push({ attempt, guards: guardNames, reason });
    previousRejection = buildWritingRetryFeedback(reason);
    console.error(
      `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${totalAttempts} rejected by [${guardNames.join(', ')}] - ${reason}`,
    );
    captureLlmCallTelemetry({
      kind: 'call-rejected',
      pass: 'writing',
      model: OPENAI_MODEL,
      language: input.language,
      attemptCount: attempt,
      durationMs: Date.now() - startedAtMs,
      guards: guardNames,
      styleOnly,
    });
  };

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    let result: Awaited<ReturnType<typeof callOpenAiForWriting>>;
    try {
      result = await callOpenAiForWriting(input, usedFallbackContext, previousRejection);
    } catch (error) {
      // See analyzeStructure's identical comment - a parse/validation
      // failure or provider refusal is retried like any other rejected attempt.
      const reason = error instanceof Error ? error.message : String(error);
      recordRejection(attempt, ['response-invalid'], reason, false);
      await paceRateLimitedRetry(attempt, reason);
      continue;
    }

    const failures = runWritingGuards(guards, result.output);
    if (failures.length > 0) {
      const guardNames = failures.map((failure) => failure.guard);
      const reason = describeFailures(failures);
      const styleOnly = failures.every((failure) => failure.severity === 'style');

      // Issue #407: the budget is spent and nothing substantive is wrong.
      // Shipping a wording defect the operator will see in review beats
      // throwing away the scan, both analyses and the day's deliverable.
      if (attempt === totalAttempts && styleOnly) {
        console.error(
          `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${totalAttempts} shipped with unfixed style violations from [${guardNames.join(', ')}] - ${reason}`,
        );
        captureLlmCallTelemetry({
          kind: 'style-violation-shipped',
          pass: 'writing',
          model: OPENAI_MODEL,
          language: input.language,
          attemptCount: attempt,
          durationMs: Date.now() - startedAtMs,
          guards: guardNames,
        });
        return succeed(input, result, attempt, startedAtMs, rejections, [
          { attempt, guards: guardNames, reason },
        ]);
      }

      recordRejection(attempt, guardNames, reason, styleOnly);
      continue;
    }

    return succeed(input, result, attempt, startedAtMs, rejections, []);
  }

  captureLlmCallTelemetry({
    kind: 'call-exhausted',
    pass: 'writing',
    model: OPENAI_MODEL,
    language: input.language,
    attemptCount: totalAttempts,
    durationMs: Date.now() - startedAtMs,
  });
  throw new WritingPassExhaustedError(
    `odysseus analyze (writing pass, language=${input.language}): exhausted ${totalAttempts} attempts without a valid response. ${describeRejections(rejections)}`,
    input.language,
    rejections,
  );
}

/** One rejection naming every guard that failed. `buildWritingRetryFeedback`
 *  asks the model to fix "these problems", so the list has to read as a list
 *  even when it holds one entry. */
function describeFailures(failures: readonly WritingGuardFailure[]): string {
  if (failures.length === 1) return failures[0]!.reason;
  return failures.map((failure, i) => `(${i + 1}) ${failure.reason}`).join(' ');
}

function describeRejections(rejections: readonly WritingAttemptRejection[]): string {
  if (rejections.length === 0) return 'No attempt was recorded.';
  return rejections
    .map((rejection) => `Attempt ${rejection.attempt}: ${rejection.reason}`)
    .join(' | ');
}

function succeed(
  input: WritingInput,
  result: Awaited<ReturnType<typeof callOpenAiForWriting>>,
  attempt: number,
  startedAtMs: number,
  rejections: readonly WritingAttemptRejection[],
  shippedStyleViolations: readonly WritingAttemptRejection[],
): AnalyzeWritingResult {
  captureLlmCallTelemetry({
    kind: 'call-succeeded',
    pass: 'writing',
    model: OPENAI_MODEL,
    language: input.language,
    attemptCount: attempt,
    durationMs: Date.now() - startedAtMs,
    schemaValidFirstAttempt: attempt === 1,
    ...(result.usage !== undefined
      ? {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          ...(result.usage.reasoningTokens !== undefined
            ? { reasoningTokens: result.usage.reasoningTokens }
            : {}),
        }
      : {}),
  });
  return {
    // Normalization, not validation: applied after every rejecting guard has
    // passed, so a guard never inspects text this rewrote.
    output: normalizeWritingOutputTypography(result.output, input.language),
    model: OPENAI_MODEL,
    temperature: WRITING_OPENAI_TEMPERATURE,
    rejections,
    shippedStyleViolations,
  };
}
