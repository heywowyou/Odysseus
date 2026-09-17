import { describe, expect, it } from 'vitest';
import { redactLlmCallTelemetryEvent, type LlmCallTelemetryEvent } from './events.js';

describe('redactLlmCallTelemetryEvent', () => {
  it('passes a legitimate call-succeeded event through unchanged', () => {
    const event: LlmCallTelemetryEvent = {
      kind: 'call-succeeded',
      pass: 'writing',
      model: 'gpt-5.6',
      language: 'fr',
      attemptCount: 1,
      durationMs: 1200,
      schemaValidFirstAttempt: true,
      promptTokens: 500,
      completionTokens: 200,
      totalTokens: 700,
    };
    expect(redactLlmCallTelemetryEvent(event)).toEqual(event);
  });

  it('passes a legitimate call-exhausted event through unchanged', () => {
    const event: LlmCallTelemetryEvent = {
      kind: 'call-exhausted',
      pass: 'structure',
      model: 'gpt-5.6',
      attemptCount: 3,
      durationMs: 4000,
    };
    expect(redactLlmCallTelemetryEvent(event)).toEqual(event);
  });

  it('drops any key outside the allowlist, e.g. a call site accidentally spreading prompt/output data onto the event', () => {
    const legit: LlmCallTelemetryEvent = {
      kind: 'call-succeeded',
      pass: 'structure',
      model: 'gpt-5.6',
      attemptCount: 1,
      durationMs: 900,
      schemaValidFirstAttempt: true,
    };
    const withLeakedFields = {
      ...legit,
      prompt: 'the full system prompt text',
      output: { themes: ['finding text here'] },
      siteUrl: 'https://client-site.example/',
    } as unknown as LlmCallTelemetryEvent;

    const redacted = redactLlmCallTelemetryEvent(withLeakedFields);

    expect(redacted).toEqual(legit);
    expect(Object.keys(redacted)).not.toContain('prompt');
    expect(Object.keys(redacted)).not.toContain('output');
    expect(Object.keys(redacted)).not.toContain('siteUrl');
  });
});

// Issue #409: the rejection event's guard names are the one payload field
// whose value is a string rather than a number, a boolean or a code-owned
// literal, so the value is filtered as well as the key.
describe('the writing-pass rejection event', () => {
  it('keeps the guard names it was given', () => {
    const event: LlmCallTelemetryEvent = {
      kind: 'call-rejected',
      pass: 'writing',
      model: 'test-model',
      language: 'fr',
      attemptCount: 2,
      durationMs: 1200,
      guards: ['severity-vocabulary', 'provider-placement'],
      styleOnly: false,
    };

    expect(redactLlmCallTelemetryEvent(event)).toEqual(event);
  });

  it('drops anything in the guard list that is not a guard name', () => {
    const withProse = {
      kind: 'call-rejected',
      pass: 'writing',
      model: 'test-model',
      language: 'fr',
      attemptCount: 3,
      durationMs: 1200,
      // What a careless call site might pass: the violating text, which is
      // model prose about a client's site and must never reach a sink.
      guards: ['prose-register', 'Les canonicals renvoient les visiteurs ailleurs.'],
      styleOnly: true,
    } as unknown as LlmCallTelemetryEvent;

    const redacted = redactLlmCallTelemetryEvent(withProse) as { guards: readonly string[] };

    expect(redacted.guards).toEqual(['prose-register']);
  });

  it('drops a guard list that is not a list at all', () => {
    const wrongShape = {
      kind: 'style-violation-shipped',
      pass: 'writing',
      model: 'test-model',
      attemptCount: 3,
      durationMs: 1200,
      guards: 'provider-placement and some prose',
    } as unknown as LlmCallTelemetryEvent;

    expect(
      (redactLlmCallTelemetryEvent(wrongShape) as { guards: readonly string[] }).guards,
    ).toEqual([]);
  });
});
