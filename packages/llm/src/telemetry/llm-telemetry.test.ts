import { afterEach, describe, expect, it } from 'vitest';
import {
  captureLlmCallTelemetry,
  configureLlmTelemetrySink,
  NullLlmTelemetrySink,
  RecordingLlmTelemetrySink,
} from './llm-telemetry.js';
import type { LlmCallTelemetryEvent } from './events.js';

const event: LlmCallTelemetryEvent = {
  kind: 'call-succeeded',
  pass: 'structure',
  model: 'gpt-5.6',
  attemptCount: 1,
  durationMs: 800,
  schemaValidFirstAttempt: true,
};

afterEach(() => {
  configureLlmTelemetrySink(new NullLlmTelemetrySink());
});

describe('captureLlmCallTelemetry', () => {
  it('is a silent no-op with the default NullLlmTelemetrySink', () => {
    expect(() => captureLlmCallTelemetry(event)).not.toThrow();
  });

  it('forwards a redacted copy of the event to the configured sink', () => {
    const sink = new RecordingLlmTelemetrySink();
    configureLlmTelemetrySink(sink);

    captureLlmCallTelemetry(event);

    expect(sink.events).toEqual([event]);
  });

  it('never propagates a sink failure - telemetry must not fail the analysis pass it describes', () => {
    configureLlmTelemetrySink({
      capture() {
        throw new Error('sink is down');
      },
    });

    expect(() => captureLlmCallTelemetry(event)).not.toThrow();
  });
});
