import { describe, expect, it, vi } from 'vitest';
import { LangfuseLlmTelemetrySink } from './langfuse-sink.js';

describe('LangfuseLlmTelemetrySink', () => {
  it('exports only metadata through OTLP and never prompt/output fields', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 200 }),
    );
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
    // Every span attribute is a metadata key. Token counts use the OTel
    // gen_ai.usage.* names; content attributes (gen_ai.prompt/completion,
    // input/output values) never appear.
    const keys = [...body.matchAll(/"key":"([^"]+)"/g)].map((match) => match[1]!);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toMatch(
        /^(?:odysseus\.llm\.|odysseus\.telemetry\.|gen_ai\.usage\.|gen_ai\.request\.|gen_ai\.system$|service\.|langfuse\.)/,
      );
      expect(key).not.toMatch(/prompt|completion|input\.value|output\.value|message/);
    }
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
