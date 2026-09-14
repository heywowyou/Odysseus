/** Error surfaced by the dashboard API layer: carries the HTTP status and
 *  the server's error string so pages can distinguish a 404 (unknown job)
 *  from a 409 (unmet action precondition) without matching on text. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Same-origin dashboard requests should return promptly, even when the
 *  action only enqueues longer-running work. This bound prevents a stalled
 *  connection from wedging one-shot views or the polling state machine. */
const DEFAULT_API_TIMEOUT_MS = 15_000;

export class ApiTimeoutError extends Error {
  constructor(
    readonly url: string,
    readonly timeoutMs: number,
  ) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'ApiTimeoutError';
  }
}

export interface ApiRequestInit extends RequestInit {
  /** Override the dashboard default. Set to 0 only for an explicitly
   *  caller-bounded request. */
  timeoutMs?: number;
}

/** Any 401 on a dashboard API call means the session is absent or expired,
 *  so the whole app reloads at the pre-auth page. A module flag keeps
 *  concurrent fetches from stacking identical navigations. */
let isRedirectingToLogin = false;

function redirectToLogin(): void {
  if (isRedirectingToLogin) return;
  isRedirectingToLogin = true;
  window.location.assign('/login');
}

/** Bounded fetch primitive for same-origin responses that are not JSON, such
 *  as report PDFs and the deliberately special-cased login response. */
export async function fetchWithTimeout(url: string, init: ApiRequestInit = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_API_TIMEOUT_MS, signal: callerSignal, ...requestInit } = init;
  const requestController = new AbortController();
  let didTimeout = false;
  const abortFromCaller = (): void => requestController.abort(callerSignal?.reason);
  if (callerSignal?.aborted === true) abortFromCaller();
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout =
    timeoutMs > 0
      ? setTimeout(() => {
          didTimeout = true;
          requestController.abort();
        }, timeoutMs)
      : undefined;

  try {
    return await fetch(url, { ...requestInit, signal: requestController.signal });
  } catch (cause) {
    if (didTimeout) throw new ApiTimeoutError(url, timeoutMs);
    throw cause;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function fetchJson<T>(url: string, init: ApiRequestInit = {}): Promise<T> {
  const response = await fetchWithTimeout(url, init);
  if (!response.ok) {
    if (response.status === 401) redirectToLogin();
    const body: unknown = await response.json().catch(() => ({}));
    const message =
      body !== null &&
      typeof body === 'object' &&
      'error' in body &&
      typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Request to ${url} failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}

export function sendJson<T>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH',
  body: unknown,
): Promise<T> {
  return fetchJson<T>(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Mutations that take no payload (regenerate-report, approve-reports). The
 *  server only enforces application/json on routes that read a body, but
 *  sending an empty JSON object keeps every mutation uniform. */
export function postEmpty<T>(url: string): Promise<T> {
  return fetchJson<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}

/** DELETE mutations (cancel a scan, clear the queue, delete a scan). The
 *  body-less sibling of postEmpty, so pages never hand-roll fetch calls. */
export function sendDelete<T>(url: string): Promise<T> {
  return fetchJson<T>(url, { method: 'DELETE' });
}
