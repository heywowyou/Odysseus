/**
 * Issue #254: metadata-only LLM call telemetry. Deliberately excludes the
 * prompt, the model's output, finding text, URLs, and site context - only
 * shape/cost/outcome metadata about a completed retry-and-guard loop
 * (analyzeStructure / analyzeWriting). Prompts and schemas stay
 * repository-owned, per docs/rules/llm-layer-rules.md.
 */

export type LlmPass = 'structure' | 'writing' | 'review' | 'correction-review';

interface LlmCallTelemetryEventBase {
  pass: LlmPass;
  model: string;
  /** Present for the writing pass only - the other passes are
   *  language-independent. */
  language?: 'fr' | 'en';
  /** How many provider calls the retry loop made, 1 when it succeeded
   *  first try. */
  attemptCount: number;
  /** Wall time for the whole retry loop, not a single provider round
   *  trip. */
  durationMs: number;
}

export type LlmCallTelemetryEvent =
  | (LlmCallTelemetryEventBase & {
      kind: 'call-succeeded';
      /** No retry needed: the first attempt both parsed against the
       *  schema and passed every content guard. */
      schemaValidFirstAttempt: boolean;
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      reasoningTokens?: number;
    })
  | (LlmCallTelemetryEventBase & {
      kind: 'call-exhausted';
    });

const ALLOWED_KEYS = new Set<string>([
  'kind',
  'pass',
  'model',
  'language',
  'attemptCount',
  'durationMs',
  'schemaValidFirstAttempt',
  'promptTokens',
  'completionTokens',
  'totalTokens',
  'reasoningTokens',
]);

/** Rebuilds the event from an allowlist of keys, so a call site bug that
 *  spreads an extra field (e.g. the raw provider response, an excerpt of
 *  model output) cannot smuggle it past the type system into a real sink.
 *  Defense in depth: the primary safeguard is that the type itself has no
 *  field wide enough to carry prompt or output text. */
export function redactLlmCallTelemetryEvent(event: LlmCallTelemetryEvent): LlmCallTelemetryEvent {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event)) {
    if (ALLOWED_KEYS.has(key)) clean[key] = value;
  }
  return clean as unknown as LlmCallTelemetryEvent;
}
