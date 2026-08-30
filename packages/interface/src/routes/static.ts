import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { getPublicDir } from '../config.js';
import type { Router } from '../router.js';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

const DASHBOARD_PREFIX = '/dashboard';

export type StaticResolution =
  | { kind: 'file'; filePath: string }
  | { kind: 'spa-fallback'; filePath: string }
  | { kind: 'forbidden' }
  | { kind: 'not-found' };

function resolveWithin(publicDir: string, relativeRequest: string): string | null {
  const resolved = path.resolve(publicDir, `.${relativeRequest}`);
  if (resolved !== publicDir && !resolved.startsWith(publicDir + path.sep)) {
    return null;
  }
  return resolved;
}

async function isFile(candidate: string): Promise<boolean> {
  try {
    const stats = await stat(candidate);
    return stats.isFile();
  } catch {
    return false;
  }
}

/** Pure path resolution for the static fallback, split from the stream
 *  plumbing so the routing decision is unit-testable without a server.
 *
 *  Exact files under publicDir win first (the pre-rebuild pages and every
 *  built dashboard asset). Client-side routes under /dashboard/ have no file
 *  on disk, so a refresh or deep link like /dashboard/audits/x must serve the
 *  dashboard entry and let the SPA router render the route; the prefix is
 *  scoped to the dashboard so everything else keeps plain 404 semantics.
 *  /api/* never reaches this resolver, the router matches those routes first.
 *  Any path that resolves outside publicDir is refused outright (traversal),
 *  so a request URL's own '..' segments can never escape publicDir. */
export async function resolveStaticPath(
  publicDir: string,
  requestedPath: string,
): Promise<StaticResolution> {
  const normalized = requestedPath === '/' ? '/index.html' : requestedPath;

  const primary = resolveWithin(publicDir, normalized);
  if (primary === null) return { kind: 'forbidden' };
  if (await isFile(primary)) return { kind: 'file', filePath: primary };

  const withSlash = normalized === DASHBOARD_PREFIX ? `${DASHBOARD_PREFIX}/` : normalized;
  if (withSlash.startsWith(`${DASHBOARD_PREFIX}/`)) {
    const entryPath = resolveWithin(publicDir, '/dashboard/index.html');
    if (entryPath !== null && (await isFile(entryPath))) {
      return { kind: 'spa-fallback', filePath: entryPath };
    }
  }

  return { kind: 'not-found' };
}

/** Serves the compiled dashboard (dist/public: the pre-rebuild pages today,
 *  the built SPA under dashboard/ alongside them) as the router's fallback,
 *  for any request that matched no /api/* route. */
export function registerStaticFallback(router: Router): void {
  router.setFallback(async ({ req, res }) => {
    const publicDir = getPublicDir();
    const url = new URL(req.url ?? '/', 'http://internal');
    const resolution = await resolveStaticPath(publicDir, url.pathname);

    if (resolution.kind === 'forbidden') {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    if (resolution.kind === 'not-found') {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    const contentType =
      CONTENT_TYPES[path.extname(resolution.filePath)] ?? 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('content-type', contentType);
    createReadStream(resolution.filePath).pipe(res);
  });
}
