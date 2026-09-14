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
