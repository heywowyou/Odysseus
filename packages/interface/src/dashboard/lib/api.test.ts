import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, ApiTimeoutError, ApiValidationError, fetchJson, fetchJsonValidated } from './api';

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

function stubJsonResponse(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })),
  );
}

describe('fetchJsonValidated', () => {
  const schema = z.object({ jobId: z.string(), status: z.enum(['queued', 'running']) });

  it('resolves with the parsed value for a response matching the schema', async () => {
    stubJsonResponse({ jobId: 'job-1', status: 'running' });

    await expect(fetchJsonValidated('/api/scans/job-1', schema)).resolves.toEqual({
      jobId: 'job-1',
      status: 'running',
    });
  });

  it('leaves fields an older/legacy response omits as optional and unset', async () => {
    const withOptional = z.object({ jobId: z.string(), auditId: z.string().optional() });
    stubJsonResponse({ jobId: 'job-1' });

    await expect(fetchJsonValidated('/api/scans/job-1', withOptional)).resolves.toEqual({
      jobId: 'job-1',
    });
  });

  it('rejects with ApiValidationError when a required field is missing', async () => {
    stubJsonResponse({ status: 'running' });

    await expect(fetchJsonValidated('/api/scans/job-1', schema)).rejects.toBeInstanceOf(
      ApiValidationError,
    );
  });

  it('rejects with ApiValidationError when a field has the wrong primitive type', async () => {
    stubJsonResponse({ jobId: 42, status: 'running' });

    await expect(fetchJsonValidated('/api/scans/job-1', schema)).rejects.toBeInstanceOf(
      ApiValidationError,
    );
  });

  it('rejects with ApiValidationError when an array field is not a container at all', async () => {
    const withArray = z.object({ urls: z.array(z.string()) });
    stubJsonResponse({ urls: 'not-an-array' });

    await expect(fetchJsonValidated('/api/scans/job-1', withArray)).rejects.toBeInstanceOf(
      ApiValidationError,
    );
  });

  it('names only the field paths and zod messages, never the response body, in the error', async () => {
    stubJsonResponse({ jobId: 'job-1', status: 'running', apiKey: 'super-secret-value' });
    const strictSchema = schema.strict();

    const failure = fetchJsonValidated('/api/scans/job-1', strictSchema);
    await expect(failure).rejects.toBeInstanceOf(ApiValidationError);
    await failure.catch((cause: unknown) => {
      const message = (cause as Error).message;
      expect(message).not.toContain('super-secret-value');
    });
  });

  it('a contract change cannot pass merely by widening the TS consumer type', async () => {
    // schema is the single source of truth fetchJsonValidated checks against;
    // there is no separate hand-written interface for this schema's type to
    // drift out of sync with, so a field the schema still requires still
    // fails here even if a caller's local type annotation were changed.
    stubJsonResponse({ jobId: 'job-1' });

    await expect(
      fetchJsonValidated<typeof schema>('/api/scans/job-1', schema),
    ).rejects.toBeInstanceOf(ApiValidationError);
  });
});
