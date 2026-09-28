/**
 * Issue #548: the report-quality client makes one provider request per
 * attempt, retries an unusable answer, and never sleeps past the provider
 * delay cap. The SDK is stubbed; no live API is called.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const createMock = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(function OpenAiMock() {
    return { chat: { completions: { create: createMock } } };
  }),
}));

vi.mock('./config.js', () => ({
  ensureEnvLoaded: () => undefined,
  getOpenAiApiKey: () => 'test-key',
  getOpenAiBaseUrl: () => undefined,
}));

const { callReportQualityRole } = await import('./report-quality-client.js');
const { default: OpenAIClient } = await import('openai');
const { MAX_PROVIDER_RETRY_DELAY_MS } = await import('./rate-limit-pacing.js');

const parser = z.object({ verdict: z.literal('ok') });

function answer(content: string) {
  return {
    model: 'resolved-model',
    choices: [{ finish_reason: 'stop', message: { content, refusal: null } }],
  };
}

const call = () =>
  callReportQualityRole({
    role: 'final-document-arbiter',
    userPayload: {},
    parser,
    jsonSchema: {},
  });

afterEach(() => {
  vi.useRealTimers();
  createMock.mockReset();
  vi.mocked(OpenAIClient).mockClear();
});

describe('callReportQualityRole', () => {
  it('builds its SDK client with no SDK retries and a bounded timeout', async () => {
    createMock.mockResolvedValueOnce(answer('{"verdict":"ok"}'));
    await call();
    expect(OpenAIClient).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0, timeout: 5 * 60_000 }),
    );
  });

  it('retries an answer that is not JSON, then one that fails the schema', async () => {
    vi.useFakeTimers();
    createMock
      .mockResolvedValueOnce(answer('not json'))
      .mockResolvedValueOnce(answer('{"verdict":"no"}'))
      .mockResolvedValueOnce(answer('{"verdict":"ok"}'));

    const result = call();
    await vi.runAllTimersAsync();

    await expect(result).resolves.toMatchObject({ output: { verdict: 'ok' } });
    expect(createMock).toHaveBeenCalledTimes(3);
  });

  it('caps a one-hour provider Retry-After at the provider delay cap', async () => {
    vi.useFakeTimers();
    const throttled = Object.assign(new Error('429'), {
      status: 429,
      headers: { 'retry-after': '3600' },
    });
    createMock.mockRejectedValueOnce(throttled).mockResolvedValueOnce(answer('{"verdict":"ok"}'));

    const result = call();
    await vi.advanceTimersByTimeAsync(MAX_PROVIDER_RETRY_DELAY_MS - 1);
    expect(createMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toMatchObject({ output: { verdict: 'ok' } });
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});
