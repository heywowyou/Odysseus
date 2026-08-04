/**
 * Hand-rolled path-pattern router over node:http. No dependency: the
 * whole API surface is five routes plus a static-file fallback, well
 * under what justifies pulling in Express (which CLAUDE.md explicitly
 * rules out for this milestone).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

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
