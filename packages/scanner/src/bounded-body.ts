/**
 * Reading a scanned site's response bodies with a byte ceiling (issue #486).
 *
 * Timeouts bound how long a fetch takes, not how much it returns. A site can
 * serve a huge body, or a small gzip that inflates to gigabytes, and
 * `response.text()` or `arrayBuffer()` would hold all of it in the one
 * process that also serves the dashboard and runs the job queue. Every
 * fetcher of site-controlled content reads through here instead.
 */

import { gunzipSync } from 'node:zlib';

export class ResponseBodyTooLargeError extends Error {
  constructor(
    readonly url: string,
    readonly limitBytes: number,
  ) {
    super(`response body of ${url} exceeds the ${limitBytes}-byte limit`);
    this.name = 'ResponseBodyTooLargeError';
  }
}

/** robots.txt: RFC 9309 asks parsers to read at least 500 KiB; content past
 *  that may be ignored, which is what Google does. */
export const ROBOTS_TXT_MAX_BYTES = 512 * 1024;
/** One sitemap document, compressed or not: the sitemaps.org protocol caps a
 *  document at 50 MB uncompressed. */
export const SITEMAP_MAX_BYTES = 50 * 1024 * 1024;
/** An HTML page read by a side fetcher (canonical targets, prospecting). */
export const HTML_PAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * The whole body, refused with `ResponseBodyTooLargeError` as soon as it
 * passes `maxBytes` (a declared Content-Length over the limit is refused
 * before reading anything). The stream is cancelled either way.
 */
export async function readBoundedBytes(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers?.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new ResponseBodyTooLargeError(response.url, maxBytes);
  }
  if (response.body == null) {
    const bytes = await bodylessBytes(response);
    if (bytes.byteLength > maxBytes) throw new ResponseBodyTooLargeError(response.url, maxBytes);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new ResponseBodyTooLargeError(response.url, maxBytes);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks, total);
}

/** A response without a stream: empty for a real `Response` (a null body is
 *  an empty one), or a test double that only implements `text()`. */
async function bodylessBytes(response: Response): Promise<Buffer> {
  return typeof response.text === 'function'
    ? Buffer.from(await response.text(), 'utf8')
    : Buffer.alloc(0);
}

/** The body as UTF-8 text, refused past `maxBytes`. */
export async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  return (await readBoundedBytes(response, maxBytes)).toString('utf8');
}

/**
 * At most the first `maxBytes` of the body as UTF-8 text, never an error:
 * for formats where content past a limit may be ignored (robots.txt).
 */
export async function readTextPrefix(response: Response, maxBytes: number): Promise<string> {
  if (response.body == null) {
    return (await bodylessBytes(response)).subarray(0, maxBytes).toString('utf8');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, maxBytes - total);
      chunks.push(chunk);
      total += chunk.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  // A cut can split a multi-byte character; the decoder replaces the
  // fragment, which only affects the ignored tail.
  return Buffer.concat(chunks, total).toString('utf8');
}

/** Inflates a gzip body without ever allocating more than `maxBytes` of
 *  output: zlib stops and throws past the limit, reported as too large. */
export function gunzipBounded(bytes: Buffer, maxBytes: number, url: string): Buffer {
  try {
    return gunzipSync(bytes, { maxOutputLength: maxBytes });
  } catch (error) {
    if (
      error instanceof RangeError ||
      (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE'
    ) {
      throw new ResponseBodyTooLargeError(url, maxBytes);
    }
    throw error;
  }
}

/**
 * Whether a well-known plain-text file (`/robots.txt`, `/llms.txt`) was
 * actually served, rather than a stand-in (issue #495): hotel CMSs redirect
 * unknown paths to the homepage and single-page apps answer 200 with their
 * `index.html`. The file counts only when the final URL still names the
 * requested path, the content type is not HTML, and the body does not open
 * with markup.
 */
export function isServedPlainTextFile(
  requestedUrl: string,
  response: Partial<Pick<Response, 'url' | 'headers'>>,
  body: string,
): boolean {
  if (response.url !== undefined && response.url !== '') {
    try {
      if (new URL(response.url).pathname !== new URL(requestedUrl).pathname) return false;
    } catch {
      return false;
    }
  }
  const contentType = response.headers?.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('html')) return false;
  return !body.replace(/^﻿/u, '').trimStart().startsWith('<');
}
