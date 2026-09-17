import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendError } from '../http-utils.js';
import { LOGIN_PATH, LOGOUT_PATH } from './session-routes.js';
import { readSessionCookieToken, type SessionStore } from './session-store.js';
import { LIVE_PATH, READY_PATH } from '../routes/health.js';

/** Extensions the built SPA actually loads by URL (hashed /assets/* bundles,
 *  self-hosted fonts, the shell's own index.html, the favicon). An explicit
 *  set replaces the old "any dot-plus-alphanumerics last segment" rule,
 *  which let arbitrary dotted paths through without a session. */
const STATIC_ASSET_EXTENSIONS: ReadonlySet<string> = new Set([
  'html',
  'js',
  'css',
  'woff2',
  'woff',
  'png',
  'svg',
  'ico',
]);

/** Returns true when the request may continue into the router. When it
 *  returns false the response has already been written in full: a JSON 401
 *  for API paths, a 302 to /login for pages. Session routes, the /login
 *  page itself, and static assets stay reachable so an unauthenticated
 *  browser can always load the login form. */
export type AuthGuard = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

export function createAuthGuard(deps: { sessionStore: SessionStore }): AuthGuard {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://internal');
    const pathname = url.pathname;

    // Deployment and monitoring infrastructure must reach these checks without
    // an operator session. Their payloads are intentionally fixed and non-sensitive.
    if (pathname === LIVE_PATH || pathname === READY_PATH) return true;

    const token = readSessionCookieToken(req);
    if (token !== null && deps.sessionStore.validate(token)) return true;

    if (pathname.startsWith('/api/')) {
      if (pathname === LOGIN_PATH || pathname === LOGOUT_PATH) return true;
      sendError(res, 401, 'unauthenticated');
      return false;
    }

    const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
    const extension = lastSegment.slice(lastSegment.lastIndexOf('.') + 1).toLowerCase();
    if (
      pathname === '/login' ||
      pathname === '/login/' ||
      (lastSegment.includes('.') && STATIC_ASSET_EXTENSIONS.has(extension))
    ) {
      return true;
    }

    res.statusCode = 302;
    // Issue #401: a deep link survives the sign-in. The login page accepts
    // only same-origin in-app paths back from `next`.
    const requested = `${pathname}${url.search}`;
    res.setHeader(
      'location',
      pathname === '/' ? '/login' : `/login?next=${encodeURIComponent(requested)}`,
    );
    res.end();
    return false;
  };
}
