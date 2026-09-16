import type { IncomingMessage } from 'node:http';
import type { Router } from '../router.js';
import { readJsonBody, sendError, sendJson } from '../http-utils.js';
import { logger } from '../logger.js';
import { verifyDashboardPassword } from './password.js';
import { requestArrivedOverHttps } from '../security-headers.js';
import type { LoginRateLimiter } from './rate-limit.js';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  readSessionCookieToken,
  type SessionStore,
} from './session-store.js';

export const LOGIN_PATH = '/api/session/login';
export const LOGOUT_PATH = '/api/session/logout';

export interface SessionRouteOptions {
  /** Consulted per request rather than captured at registration, so the
   *  login route can answer "auth not configured" precisely when the hash
   *  is absent, and tests can inject the lookup instead of racing
   *  process.env. */
  getPasswordHash: () => string | null;
  sessionStore: SessionStore;
  rateLimiter: LoginRateLimiter;
}

/** Our own reverse proxy is the last hop of the forwarded chain, so the
 *  chain's last entry is the one our proxy appended; every entry before it
 *  is client-supplied and must never be trusted for rate limiting, or an
 *  attacker rotates the header per attempt and never enters lockout.
 *  Direct access without a proxy sends no forwarded header at all, so the
 *  socket address stays the fallback. */
export function clientIpFor(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const entries = forwarded.split(',');
    const last = entries[entries.length - 1]?.trim();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function sessionCookie(token: string, secure: boolean): string {
  const attributes = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`;
  return `${SESSION_COOKIE_NAME}=${token}; ${attributes}${secure ? '; Secure' : ''}`;
}

function clearedSessionCookie(secure: boolean): string {
  const attributes = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
  return `${SESSION_COOKIE_NAME}=; ${attributes}${secure ? '; Secure' : ''}`;
}

/** Malformed or oversized bodies count as failed attempts: a prober must
 *  not be able to distinguish "no password field" from "wrong password",
 *  and both should advance the lockout the same way. */
async function readPasswordFromBody(req: IncomingMessage): Promise<string | null> {
  try {
    const body: unknown = await readJsonBody(req);
    if (body === null || typeof body !== 'object') return null;
    const password = (body as { password?: unknown }).password;
    return typeof password === 'string' ? password : null;
  } catch {
    return null;
  }
}

/** Registers the two session routes. They exist whether or not auth is
 *  enabled: with no hash configured, login answers 400 auth-not-configured
 *  so the SPA can say so instead of surfacing a bare 404, and logout stays
 *  a harmless idempotent 204. Origin and JSON content-type checks for these
 *  POSTs stay with the router, as for every other route. */
export function registerSessionRoutes(router: Router, options: SessionRouteOptions): void {
  router.post(LOGIN_PATH, async ({ req, res }) => {
    const configuredHash = options.getPasswordHash();
    if (configuredHash === null) {
      sendError(res, 400, 'auth-not-configured');
      return;
    }

    const ip = clientIpFor(req);
    const decision = options.rateLimiter.check(ip);
    if (!decision.allowed) {
      sendJson(res, 429, { error: 'locked', retryAfterSeconds: decision.retryAfterSeconds });
      return;
    }

    const password = await readPasswordFromBody(req);
    const verified = password !== null && (await verifyDashboardPassword(configuredHash, password));
    if (!verified) {
      options.rateLimiter.recordFailure(ip);
      // ip and outcome only: the password and any token must never reach
      // the log.
      logger.info({ ip }, 'dashboard login failed');
      sendError(res, 401, 'invalid-credentials');
      return;
    }

    options.rateLimiter.recordSuccess(ip);
    res.setHeader(
      'set-cookie',
      sessionCookie(options.sessionStore.create(), requestArrivedOverHttps(req)),
    );
    res.statusCode = 204;
    res.end();
    logger.info({ ip }, 'dashboard login succeeded');
  });

  router.post(LOGOUT_PATH, ({ req, res }) => {
    // Idempotent by construction: deleting an absent token and clearing a
    // cookie that was never set are both no-ops that still answer 204.
    const token = readSessionCookieToken(req);
    if (token !== null) options.sessionStore.delete(token);
    res.setHeader('set-cookie', clearedSessionCookie(requestArrivedOverHttps(req)));
    res.statusCode = 204;
    res.end();
  });
}
