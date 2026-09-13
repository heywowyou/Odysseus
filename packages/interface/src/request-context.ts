/**
 * Correlation context for one HTTP request (issue: request/job
 * correlation). A stable, non-secret request ID lets an operator trace one
 * action from the HTTP boundary through job creation into queue/pipeline
 * logs, without requiring every log call site to thread the ID by hand.
 *
 * Deliberately not stored on the job document: the request ID is a
 * debugging aid, not domain provenance, and jobs created outside HTTP
 * (CLI/recovery/backfill) have no request to attach.
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from './logger.js';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Bounds what a client-supplied ID can look like before it is trusted
 *  into logs: short, and limited to characters that cannot break log
 *  formatting or smuggle unrelated data. Anything else is replaced with a
 *  freshly generated ID rather than rejected outright, so a malformed
 *  header never blocks the request itself. */
const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function normalizeClientRequestId(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === undefined) return undefined;
  return CLIENT_REQUEST_ID_PATTERN.test(candidate) ? candidate : undefined;
}

interface RequestContext {
  requestId: string;
  log: typeof logger;
}

const contexts = new WeakMap<IncomingMessage, RequestContext>();

/** Establishes the request's correlation context: honors a well-formed
 *  client-supplied x-request-id, otherwise generates one; echoes it back
 *  on the response; and attaches a child logger callers can fetch with
 *  getRequestLog. Call once per request, before any routing. */
export function attachRequestContext(req: IncomingMessage, res: ServerResponse): RequestContext {
  const requestId = normalizeClientRequestId(req.headers[REQUEST_ID_HEADER]) ?? randomUUID();
  res.setHeader(REQUEST_ID_HEADER, requestId);
  const context: RequestContext = { requestId, log: logger.child({ requestId }) };
  contexts.set(req, context);
  return context;
}

/** Falls back to the base logger for any request that reached a handler
 *  without going through attachRequestContext (e.g. a unit test that
 *  builds a bare RouteContext), so callers never need a null check. */
export function getRequestLog(req: IncomingMessage): typeof logger {
  return contexts.get(req)?.log ?? logger;
}

export function getRequestId(req: IncomingMessage): string | undefined {
  return contexts.get(req)?.requestId;
}

/** Single call site for the "request created this job" log line every
 *  job-creation route needs, so the requestId+jobId pairing (and its
 *  field names) can't drift between routes. */
export function logJobCreated(req: IncomingMessage, jobId: string, jobType: string): void {
  getRequestLog(req).info({ jobId, jobType }, 'job created');
}
