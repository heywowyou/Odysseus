import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ApiTimeoutError, fetchJson } from './api';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('fetchJson', () => {
  it('returns JSON for an ordinary successful request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    await expect(fetchJson<{ ok: boolean }>('/api/example')).resolves.toEqual({ ok: true });
  });

  it('preserves HTTP failures as ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Conflict' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(fetchJson('/api/example')).rejects.toEqual(new ApiError('Conflict', 409));
  });

  it('rejects a request that exceeds its timeout with ApiTimeoutError', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      }),
    );

    const request = fetchJson('/api/slow', { timeoutMs: 25 });
    const rejection = expect(request).rejects.toEqual(new ApiTimeoutError('/api/slow', 25));
    await vi.advanceTimersByTimeAsync(25);

    await rejection;
  });

  it('composes a caller signal without turning cancellation into a timeout', async () => {
    const caller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      }),
    );

    const request = fetchJson('/api/replaced', { signal: caller.signal });
    caller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});
