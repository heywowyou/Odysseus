import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/** 24h sliding window: every successful validation pushes expiry a full
 *  window out again, so an operator working daily is never logged out
 *  mid-action while an abandoned browser expires after a quiet day. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Issue #557: however often it is used, a session ends seven days after
 *  login, so a stolen cookie kept alive by daily use still expires. */
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Host-only by omission: no Domain attribute is ever emitted, so the
 *  cookie can never travel to a sibling subdomain. */
export const SESSION_COOKIE_NAME = 'odysseus_dashboard_session';

export interface SessionStore {
  create(): string;
  /** True while the token is live; a live token's expiry slides forward a
   *  full window as a side effect of the check. */
  validate(token: string): boolean;
  delete(token: string): void;
}

interface SessionRecord {
  createdAt: number;
  expiresAt: number;
}

/** Sessions live in memory only: a server restart clears the Map and logs
 *  the single operator out, which plan 016 accepts explicitly. */
export function createInMemorySessionStore(options: { now?: () => number } = {}): SessionStore {
  const now = options.now ?? Date.now;
  const sessions = new Map<string, SessionRecord>();
  return {
    create() {
      // 256 bits as base64url: unpadded, so the cookie value never contains
      // a character that needs quoting inside a Set-Cookie header.
      const token = randomBytes(32).toString('base64url');
      const createdAt = now();
      sessions.set(token, { createdAt, expiresAt: createdAt + SESSION_TTL_MS });
      return token;
    },
    validate(token) {
      const record = sessions.get(token);
      if (record === undefined) return false;
      const current = now();
      const cap = record.createdAt + SESSION_MAX_AGE_MS;
      if (current >= record.expiresAt || current >= cap) {
        sessions.delete(token);
        return false;
      }
      record.expiresAt = Math.min(current + SESSION_TTL_MS, cap);
      return true;
    },
    delete(token) {
      sessions.delete(token);
    },
  };
}

/** Reads this session's cookie out of the browser's Cookie header. Token
 *  values are base64url, so splitting each pair on its first '=' is exact. */
export function readSessionCookieToken(req: IncomingMessage): string | null {
  const header = req.headers.cookie;
  if (header === undefined) return null;
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== SESSION_COOKIE_NAME) continue;
    const value = pair.slice(separator + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}
