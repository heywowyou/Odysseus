import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { APP_ROUTE_PREFIXES } from '../app-routes.js';
import { getPublicDir } from '../config.js';
import { isHtmlContentType, SPA_CONTENT_SECURITY_POLICY } from '../security-headers.js';
import type { Router } from '../router.js';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

/** Every response carries `x-content-type-options: nosniff`, so a file the
 *  SPA loads by URL (such as the favicon) is only usable when it is served
 *  with its real type rather than application/octet-stream. */
export function contentTypeForPath(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream';
}

/** Vite writes every bundle under /assets/ with a content hash in its name,
 *  so a URL there never serves different bytes: the browser may keep it for
 *  a year without asking (issue #512). */
const IMMUTABLE_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';
/** The self-hosted report fonts keep fixed names; they change only with a
 *  font update, so a day's reuse is safe. */
const FONT_CACHE_CONTROL = 'public, max-age=86400';

/** The Cache-Control for a served file. Everything without a content hash,
 *  the HTML shell above all, is revalidated on each load, so a deploy
 *  reaches the browser at once. */
export function cacheControlForPath(publicDir: string, filePath: string): string {
  const relative = path.relative(publicDir, filePath).split(path.sep);
  if (relative.length > 1 && relative[0] === 'assets') return IMMUTABLE_ASSET_CACHE_CONTROL;
  if (relative.length > 1 && relative[0] === 'fonts') return FONT_CACHE_CONTROL;
  return 'no-cache';
}

const APP_ROUTE_PATTERN = new RegExp(`^/(${APP_ROUTE_PREFIXES.join('|')})(/|$)`);

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
 *  under one of APP_ROUTE_PREFIXES (app-routes.ts, kept in sync with
 *  dashboard/App.tsx's top-level routes) serves the SPA entry and lets the
 *  client router render the route. Extensionless paths also fall back so a
 *  direct bookmark to a newly added client route can reach the SPA router;
 *  file-looking paths and /api/* keep plain 404 semantics. Any path that
 *  resolves outside publicDir is refused outright (traversal), so a request
 *  URL's own '..' segments can never escape publicDir. */
export async function resolveStaticPath(
  publicDir: string,
  requestedPath: string,
): Promise<StaticResolution> {
  const normalized = requestedPath === '/' ? '/index.html' : requestedPath;

  const primary = resolveWithin(publicDir, normalized);
  if (primary === null) return { kind: 'forbidden' };
  if (await isFile(primary)) return { kind: 'file', filePath: primary };

  const isApiPath = normalized === '/api' || normalized.startsWith('/api/');
  const lastSegment = path.posix.basename(normalized);
  const isFileLookingPath = path.extname(lastSegment) !== '';
  if (!isApiPath && (APP_ROUTE_PATTERN.test(normalized) || !isFileLookingPath)) {
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

    const contentType = contentTypeForPath(resolution.filePath);
    res.statusCode = 200;
    res.setHeader('content-type', contentType);
    res.setHeader('cache-control', cacheControlForPath(publicDir, resolution.filePath));
    // The CSP belongs on the SPA shell only; hashed assets and unknown
    // binaries keep their bare content type.
    if (isHtmlContentType(contentType)) {
      res.setHeader('content-security-policy', SPA_CONTENT_SECURITY_POLICY);
    }
    const fileStream = createReadStream(resolution.filePath);
    fileStream.on('error', () => {
      if (!res.destroyed) res.destroy();
    });
    fileStream.pipe(res);
  });
}
