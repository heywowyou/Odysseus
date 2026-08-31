import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendError } from '../http-utils.js';
import { LOGIN_PATH, LOGOUT_PATH } from './session-routes.js';
import { readSessionCookieToken, type SessionStore } from './session-store.js';

/** Last-segment file extension test: everything the built SPA loads by URL
 *  (hashed /assets/* bundles, fonts, a direct /index.html hit) names a
 *  file, while every client-side route (/audits, /scans, /) does not. */
const FILE_EXTENSION_PATTERN = /\.[A-Za-z0-9]+$/;

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

    const token = readSessionCookieToken(req);
    if (token !== null && deps.sessionStore.validate(token)) return true;

    if (pathname.startsWith('/api/')) {
      if (pathname === LOGIN_PATH || pathname === LOGOUT_PATH) return true;
      sendError(res, 401, 'unauthenticated');
      return false;
    }

    const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
    if (
      pathname === '/login' ||
      pathname === '/login/' ||
      FILE_EXTENSION_PATTERN.test(lastSegment)
    ) {
      return true;
    }

    res.statusCode = 302;
    res.setHeader('location', '/login');
    res.end();
    return false;
  };
}
