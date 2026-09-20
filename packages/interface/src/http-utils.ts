import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ProblemEnvelope } from './operator/contract.js';

/** Generous for this app's small JSON bodies - readJsonBody previously
 *  buffered an unbounded request body, so a request that never stopped
 *  sending data would grow memory without limit. */
const MAX_JSON_BODY_BYTES = 1_000_000;

/** Plan 072: the finalized-report upload carries a whole PDF base64-encoded
 *  in its JSON body, because the router requires an exact application/json
 *  content type on state-changing routes as its CSRF guard and multipart
 *  would break that. Real reports run to ~3 MB, ~4 MB encoded; this leaves
 *  room for a long one without lifting the limit on every other route. */
export const MAX_FINALIZED_REPORT_BODY_BYTES = 24_000_000;

class PayloadTooLargeError extends Error {
  constructor() {
    super('request body exceeds the maximum allowed size');
    this.name = 'PayloadTooLargeError';
  }
}

/** Small enough (five endpoints, small JSON bodies) that a hand-rolled
 *  body collector is simpler and lighter than adding a body-parser
 *  dependency. */
export async function readJsonBody(
  req: IncomingMessage,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += (chunk as Buffer).length;
    if (totalBytes > maxBytes) {
      throw new PayloadTooLargeError();
    }
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw) return undefined;
  return JSON.parse(raw);
}

/** Returned by readJsonBodyOrRespond when it has already answered 413 or
 *  400 and the caller must stop. A symbol, not undefined, because empty
 *  bodies and JSON null are legitimate readJsonBody successes callers still
 *  inspect. */
export const jsonBodyNotRead: unique symbol = Symbol('jsonBodyNotRead');

/** Shared body-reading error contract for the routes: one copy of the 413
 *  and 400 mapping so no endpoint drifts to a different status or message
 *  for the same client mistake. Returns the sentinel instead of throwing,
 *  so every hand-rolled field guard after the call keeps working verbatim. */
export async function readJsonBodyOrRespond(
  req: IncomingMessage,
  res: ServerResponse,
  maxBytes?: number,
): Promise<unknown> {
  try {
    return await readJsonBody(req, maxBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      sendError(res, 413, 'request body is too large');
    } else {
      sendError(res, 400, 'request body must be valid JSON');
    }
    return jsonBodyNotRead;
  }
}

export function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(payload);
}

export function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { error: message });
}

/** Plan 061 §8.3: the typed problem envelope of migrated command routes.
 *  `message` is a safe English fallback; the dashboard renders from `code`
 *  and `reasonCode`. */
export function sendProblem(
  res: ServerResponse,
  statusCode: number,
  problem: ProblemEnvelope['error'],
): void {
  sendJson(res, statusCode, { error: problem } satisfies ProblemEnvelope);
}
