import { describe, expect, it, vi } from 'vitest';
import { LangfuseLlmTelemetrySink } from './langfuse-sink.js';

describe('LangfuseLlmTelemetrySink', () => {
  it('exports only metadata through OTLP and never prompt/output fields', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const sink = new LangfuseLlmTelemetrySink({
      baseUrl: 'https://cloud.langfuse.com/',
      publicKey: 'pk-test',
      secretKey: 'sk-test',
      fetchImpl: fetchImpl as typeof fetch,
    });

    sink.capture({
      kind: 'call-succeeded',
      pass: 'writing',
      model: 'test-model',
      language: 'fr',
      attemptCount: 2,
      durationMs: 42,
      schemaValidFirstAttempt: false,
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      reasoningTokens: 5,
    });

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://cloud.langfuse.com/api/public/otel/v1/traces');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-langfuse-ingestion-version': '4',
    });

    const body = String(init?.body);
    expect(body).toContain('odysseus.llm.pass');
    expect(body).toContain('test-model');
    expect(body).not.toContain('prompt');
    expect(body).not.toContain('output');
    expect(body).not.toContain('finding');
    expect(body).not.toContain('http://');
  });

  it('swallows exporter failures because telemetry is never load-bearing', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const sink = new LangfuseLlmTelemetrySink({
      baseUrl: 'https://cloud.langfuse.com',
      publicKey: 'pk-test',
      secretKey: 'sk-test',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(() =>
      sink.capture({
        kind: 'call-exhausted',
        pass: 'structure',
        model: 'test-model',
        attemptCount: 3,
        durationMs: 100,
      }),
    ).not.toThrow();

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
  });
});
