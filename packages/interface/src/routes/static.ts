import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { Router } from '../router.js';
import { getPublicDir } from '../config.js';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

/** Serves the compiled dashboard (dist/public: index/progress/history/
 *  audit.html, styles.css, the compiled browser JS) as the router's
 *  fallback - anything that doesn't match an /api/* route. Resolves
 *  against the real filesystem path rather than trusting a request URL's
 *  own '..' segments, so a request cannot escape publicDir. */
export function registerStaticFallback(router: Router): void {
  router.setFallback(async ({ req, res }) => {
    const publicDir = getPublicDir();
    const url = new URL(req.url ?? '/', 'http://internal');
    const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;

    const resolved = path.resolve(publicDir, `.${requestedPath}`);
    if (resolved !== publicDir && !resolved.startsWith(publicDir + path.sep)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    try {
      const stats = await stat(resolved);
      if (!stats.isFile()) throw new Error('not a file');
    } catch {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    const contentType = CONTENT_TYPES[path.extname(resolved)] ?? 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('content-type', contentType);
    createReadStream(resolved).pipe(res);
  });
}
