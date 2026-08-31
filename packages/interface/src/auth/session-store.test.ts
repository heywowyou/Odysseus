import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  createInMemorySessionStore,
  readSessionCookieToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from './session-store.js';

function clockAt(start: number) {
  const state = { now: start };
  return {
    now: () => state.now,
    advance: (ms: number) => {
      state.now += ms;
    },
  };
}

function reqWithCookie(cookie?: string): IncomingMessage {
  const headers = cookie === undefined ? {} : { cookie };
  return { headers } as unknown as IncomingMessage;
}

describe('createInMemorySessionStore', () => {
  it('issues 256-bit unpadded base64url tokens', () => {
    const token = createInMemorySessionStore().create();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('issues a distinct token per create', () => {
    const store = createInMemorySessionStore();
    expect(store.create()).not.toBe(store.create());
  });

  it('validates a freshly created token and rejects unknown ones', () => {
    const store = createInMemorySessionStore();
    expect(store.validate('never-issued')).toBe(false);
    expect(store.validate(store.create())).toBe(true);
  });

  it('forgets a token after delete', () => {
    const store = createInMemorySessionStore();
    const token = store.create();
    store.delete(token);
    expect(store.validate(token)).toBe(false);
  });

  it('expires a token after one quiet TTL and drops the record', () => {
    const clock = clockAt(0);
    const store = createInMemorySessionStore({ now: clock.now });
    const token = store.create();
    clock.advance(SESSION_TTL_MS - 1);
    clock.advance(1);
    expect(store.validate(token)).toBe(false);
    expect(store.validate(token)).toBe(false);
  });

  it('slides the window on every successful validation', () => {
    const clock = clockAt(0);
    const store = createInMemorySessionStore({ now: clock.now });
    const token = store.create();
    clock.advance(SESSION_TTL_MS - 1_000);
    expect(store.validate(token)).toBe(true);
    // The validate above re-anchored expiry at that moment, so this next
    // quiet stretch would have killed an unslid session but keeps this one.
    clock.advance(1_000);
    expect(store.validate(token)).toBe(true);
    clock.advance(SESSION_TTL_MS);
    expect(store.validate(token)).toBe(false);
  });
});

describe('readSessionCookieToken', () => {
  it('reads the session cookie out of a shared Cookie header', () => {
    const req = reqWithCookie(`other=value; ${SESSION_COOKIE_NAME}=tok123`);
    expect(readSessionCookieToken(req)).toBe('tok123');
  });

  it('returns null without a cookie header, a match, or a value', () => {
    expect(readSessionCookieToken(reqWithCookie(undefined))).toBeNull();
    expect(readSessionCookieToken(reqWithCookie('other=value'))).toBeNull();
    expect(readSessionCookieToken(reqWithCookie(`${SESSION_COOKIE_NAME}=`))).toBeNull();
  });
});
