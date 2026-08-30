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

const APP_ROUTE_PATTERN = /^\/(audits|scans)(\/|$)/;

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
 *  Exact files under publicDir win first (the built SPA's index.html and
 *  hashed assets). Client-side routes have no file on disk, so anything
 *  under /audits or /scans serves the SPA entry and lets the client router
 *  render the route; the prefix list is deliberate so anything else
 *  (bookmarks to the removed pre-rebuild pages, stray paths) keeps plain
 *  404 semantics. /api/* never reaches this resolver, the router matches
 *  those routes first. Any path that resolves outside publicDir is refused
 *  outright (traversal), so a request URL's own '..' segments can never
 *  escape publicDir. */
export async function resolveStaticPath(
  publicDir: string,
  requestedPath: string,
): Promise<StaticResolution> {
  const normalized = requestedPath === '/' ? '/index.html' : requestedPath;

  const primary = resolveWithin(publicDir, normalized);
  if (primary === null) return { kind: 'forbidden' };
  if (await isFile(primary)) return { kind: 'file', filePath: primary };

  if (APP_ROUTE_PATTERN.test(normalized)) {
    const entryPath = resolveWithin(publicDir, '/index.html');
    if (entryPath !== null && (await isFile(entryPath))) {
      return { kind: 'spa-fallback', filePath: entryPath };
    }
  }

  return { kind: 'not-found' };
}

/** Serves the compiled dashboard SPA (dist/public: index.html, hashed
 *  assets, self-hosted fonts) as the router's fallback, for any request
 *  that matched no /api/* route. */
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
