import { afterEach, describe, expect, it } from 'vitest';
import { configureLlmTelemetryFromEnv } from './configure.js';
import {
  configureLlmTelemetrySink,
  getLlmTelemetrySink,
  NullLlmTelemetrySink,
} from './llm-telemetry.js';
import { LangfuseLlmTelemetrySink } from './langfuse-sink.js';

afterEach(() => {
  configureLlmTelemetrySink(new NullLlmTelemetrySink());
});

describe('configureLlmTelemetryFromEnv', () => {
  it('keeps the null sink when Langfuse is entirely unconfigured', () => {
    configureLlmTelemetryFromEnv({});
    expect(getLlmTelemetrySink()).toBeInstanceOf(NullLlmTelemetrySink);
  });

  it('requires base URL and both project keys together', () => {
    expect(() =>
      configureLlmTelemetryFromEnv({
        LANGFUSE_BASE_URL: 'https://cloud.langfuse.com',
        LANGFUSE_PUBLIC_KEY: 'pk-test',
      }),
    ).toThrow(/must be configured together/);
  });

  it('installs the Langfuse sink only after complete explicit opt-in', () => {
    configureLlmTelemetryFromEnv({
      LANGFUSE_BASE_URL: 'https://cloud.langfuse.com',
      LANGFUSE_PUBLIC_KEY: 'pk-test',
      LANGFUSE_SECRET_KEY: 'sk-test',
    });
    expect(getLlmTelemetrySink()).toBeInstanceOf(LangfuseLlmTelemetrySink);
  });
});
