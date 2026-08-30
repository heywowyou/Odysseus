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

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
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

export function sendJson<T>(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
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
