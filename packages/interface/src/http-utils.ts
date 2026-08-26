import type { IncomingMessage, ServerResponse } from 'node:http';

/** Generous for this app's small JSON bodies - readJsonBody previously
 *  buffered an unbounded request body, so a request that never stopped
 *  sending data would grow memory without limit. */
const MAX_JSON_BODY_BYTES = 1_000_000;

export class PayloadTooLargeError extends Error {
  constructor() {
    super('request body exceeds the maximum allowed size');
    this.name = 'PayloadTooLargeError';
  }
}

/** Small enough (five endpoints, small JSON bodies) that a hand-rolled
 *  body collector is simpler and lighter than adding a body-parser
 *  dependency. */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += (chunk as Buffer).length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      throw new PayloadTooLargeError();
    }
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw) return undefined;
  return JSON.parse(raw);
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
