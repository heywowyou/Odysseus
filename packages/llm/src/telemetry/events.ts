/**
 * Issue #254: metadata-only LLM call telemetry. Deliberately excludes the
 * prompt, the model's output, finding text, URLs, and site context - only
 * shape/cost/outcome metadata about a completed retry-and-guard loop
 * (analyzeStructure / analyzeWriting). Prompts and schemas stay
 * repository-owned, per docs/rules/llm-layer-rules.md.
 */

type LlmPass = 'structure' | 'writing' | 'review' | 'correction-review';

/**
 * The writing pass's content guards, named so a rejection is measurable.
 *
 * Issue #409: before this, a rejection existed only as a `console.error` line
 * on the VPS and as the *last* failure reason on the thrown error, so the
 * question that matters - which guards reject most often, and how often a
 * report costs three generations - had no answer but an anecdote.
 *
 * The name is the whole payload. The violating text is not, and must never
 * be: it is model prose about a client's site, and this event is metadata
 * only (docs/rules/telemetry-rules.md). The union is closed for that reason -
 * `redactLlmCallTelemetryEvent` drops any name that is not on it, so a future
 * call site cannot pass an excerpt where a guard name belongs.
 */
const WRITING_GUARD_NAMES = [
  'response-invalid',
  'theme-key',
  'theme-title',
  'language-compliance',
  'severity-vocabulary',
  'legal-consequence',
  'page-count',
  'finding-count',
  'positional-reference',
  'wcag-citation',
  'business-claim',
  'transactional-flow',
  'performance-evidence',
  'executive-summary-digit',
  'prose-register',
  'provider-placement',
  'provider-phrase',
] as const;

export type WritingGuardName = (typeof WRITING_GUARD_NAMES)[number];

const WRITING_GUARD_NAME_SET = new Set<string>(WRITING_GUARD_NAMES);

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
    })
  | (LlmCallTelemetryEventBase & {
      kind: 'call-rejected';
      /** The guards this attempt failed, in the order the loop records
       *  them, so the first is the substantive one when a substantive and
       *  a style guard both fired. Since issue #406 an attempt is rejected
       *  once with every guard that failed, so this is a list. */
      guards: readonly WritingGuardName[];
      /** Whether every failed guard was a style guard. A run exhausted
       *  entirely on style guards is the failure mode issue #407 exists to
       *  remove, and it is only visible if it can be counted. */
      styleOnly: boolean;
    })
  | (LlmCallTelemetryEventBase & {
      kind: 'style-violation-shipped';
      /** Issue #407: the final attempt was accepted with these style
       *  guards still failing, rather than losing the report over wording.
       *  An escape is a thing to review, so it is counted. */
      guards: readonly WritingGuardName[];
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
  'guards',
  'styleOnly',
]);

/** Rebuilds the event from an allowlist of keys, so a call site bug that
 *  spreads an extra field (e.g. the raw provider response, an excerpt of
 *  model output) cannot smuggle it past the type system into a real sink.
 *  Defense in depth: the primary safeguard is that the type itself has no
 *  field wide enough to carry prompt or output text. */
export function redactLlmCallTelemetryEvent(event: LlmCallTelemetryEvent): LlmCallTelemetryEvent {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    // `guards` is the one key whose value is not a number, a boolean, or a
    // code-owned literal, so it is the one key whose value is filtered as
    // well as its name: only names on the closed union survive. A guard name
    // is safe to record; anything else arriving here would be prose.
    clean[key] = key === 'guards' ? filterGuardNames(value) : value;
  }
  return clean as unknown as LlmCallTelemetryEvent;
}

function filterGuardNames(value: unknown): readonly WritingGuardName[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (name): name is WritingGuardName =>
      typeof name === 'string' && WRITING_GUARD_NAME_SET.has(name),
  );
}
