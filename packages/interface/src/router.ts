/**
 * Hand-rolled path-pattern router over node:http. No dependency: the
 * whole API surface is five routes plus a static-file fallback, well
 * under what justifies pulling in Express (which CLAUDE.md explicitly
 * rules out for this milestone).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendError } from './http-utils.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PATCH']);

/** The dashboard binds to 127.0.0.1 by design, which stops a remote
 *  attacker but not a malicious page open in the same browser while
 *  odysseus serve is running - a CORS "simple request" (Content-Type:
 *  text/plain, no preflight) can otherwise deliver a JSON-shaped body to
 *  a state-changing endpoint with no confirmation shown to the operator.
 *  Rejecting anything but an exact application/json body, plus any Origin
 *  that doesn't match what the client actually connected to, closes that
 *  without requiring the browser's CORS preflight at all. Absent Origin is
 *  allowed - non-browser local tools (curl, the CLI) don't always send
 *  one, and same-origin navigation reliably does when it matters. */
function isAcceptableOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  const host = req.headers.host;
  if (host === undefined) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function hasJsonContentType(req: IncomingMessage): boolean {
  const contentType = req.headers['content-type'];
  if (contentType === undefined) return false;
  return contentType.split(';')[0]?.trim().toLowerCase() === 'application/json';
}

/** Some state-changing routes (e.g. POST regenerate-report) take no body
 *  at all and so never send a Content-Type - only routes that actually
 *  read one via readJsonBody need to be held to application/json. */
function hasBody(req: IncomingMessage): boolean {
  const length = req.headers['content-length'];
  if (length !== undefined) return Number.parseInt(length, 10) > 0;
  return req.headers['transfer-encoding'] !== undefined;
}

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
}

export type RouteHandler = (ctx: RouteContext) => Promise<void> | void;

interface Route {
  method: string;
  segments: string[];
  handler: RouteHandler;
}

function splitPath(pathname: string): string[] {
  return pathname.split('/').filter((segment) => segment.length > 0);
}

/** Matches literal segments exactly and captures `:name` segments.
 *  Returns null on any mismatch, including a different segment count. */
function matchSegments(pattern: readonly string[], actual: readonly string[]): Record<string, string> | null {
  if (pattern.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const patternSegment = pattern[i]!;
    const actualSegment = actual[i]!;
    if (patternSegment.startsWith(':')) {
      params[patternSegment.slice(1)] = decodeURIComponent(actualSegment);
    } else if (patternSegment !== actualSegment) {
      return null;
    }
  }
  return params;
}

export class Router {
  private readonly routes: Route[] = [];
  private fallback: RouteHandler | undefined;

  get(pattern: string, handler: RouteHandler): void {
    this.routes.push({ method: 'GET', segments: splitPath(pattern), handler });
  }

  post(pattern: string, handler: RouteHandler): void {
    this.routes.push({ method: 'POST', segments: splitPath(pattern), handler });
  }

  patch(pattern: string, handler: RouteHandler): void {
    this.routes.push({ method: 'PATCH', segments: splitPath(pattern), handler });
  }

  /** Handles every request that matches no route above - the static
   *  file server, in practice. */
  setFallback(handler: RouteHandler): void {
    this.fallback = handler;
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://internal');
    const pathSegments = splitPath(url.pathname);
    const method = req.method ?? 'GET';

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const params = matchSegments(route.segments, pathSegments);
      if (params) {
        if (STATE_CHANGING_METHODS.has(method)) {
          if (!isAcceptableOrigin(req)) {
            sendError(res, 403, 'Origin not allowed');
            return;
          }
          if (hasBody(req) && !hasJsonContentType(req)) {
            sendError(res, 415, 'Content-Type must be application/json');
            return;
          }
        }
        await route.handler({ req, res, params, query: url.searchParams });
        return;
      }
    }

    if (this.fallback) {
      await this.fallback({ req, res, params: {}, query: url.searchParams });
      return;
    }

    res.statusCode = 404;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('Not found');
  }
}
