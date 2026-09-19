import { callOpenAiForCritic, type WritingCallUsage } from './client.js';
import { OPENAI_MODEL } from './constants.js';
import { validateCriticIssues, type CriticDropCounts } from './critic-issues.js';
import type { WritingCriticIssue } from './critic-schema.js';
import { captureLlmCallTelemetry, usageTelemetryFields } from './telemetry/llm-telemetry.js';
import type { WritingInput, WritingPassOutput } from './writing-schema.js';

export type WritingCriticOutcome =
  | {
      status: 'ok';
      /** Issues that survived validateCriticIssues. May be empty. */
      issues: readonly WritingCriticIssue[];
      /** How many issues the provider returned, before validation. */
      raised: number;
      dropped: CriticDropCounts;
      usage?: WritingCallUsage;
    }
  | { status: 'skipped'; reason: string };

/**
 * Plan 070 decisions 1 and 3: exactly one critic call, never retried. A
 * provider error, a refusal, a truncated or schema-invalid response all
 * become `skipped`, and this function never throws, so the critic can never
 * fail or block a report. Telemetry uses the existing `review` pass value.
 */
export async function runWritingCritic(
  input: WritingInput,
  written: WritingPassOutput,
): Promise<WritingCriticOutcome> {
  const startedAtMs = Date.now();
  try {
    const result = await callOpenAiForCritic({ writingInput: input, written });
    const { accepted, dropped } = validateCriticIssues(input, written, result.output.issues);
    captureLlmCallTelemetry({
      kind: 'call-succeeded',
      pass: 'review',
      model: OPENAI_MODEL,
      language: input.language,
      attemptCount: 1,
      durationMs: Date.now() - startedAtMs,
      schemaValidFirstAttempt: true,
      ...usageTelemetryFields(result.usage),
    });
    return {
      status: 'ok',
      issues: accepted,
      raised: result.output.issues.length,
      dropped,
      ...(result.usage ? { usage: result.usage } : {}),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `odysseus analyze (critic pass, language=${input.language}): skipped - ${reason}`,
    );
    captureLlmCallTelemetry({
      kind: 'call-exhausted',
      pass: 'review',
      model: OPENAI_MODEL,
      language: input.language,
      attemptCount: 1,
      durationMs: Date.now() - startedAtMs,
    });
    return { status: 'skipped', reason };
  }
}
