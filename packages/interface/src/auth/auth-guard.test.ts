import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createAuthGuard } from './auth-guard.js';
import {
  createInMemorySessionStore,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from './session-store.js';

const clock = { now: 0 };

function buildGuard() {
  const store = createInMemorySessionStore({ now: () => clock.now });
  return { store, guard: createAuthGuard({ sessionStore: store }) };
}

function fakeReq(url: string, headers: Record<string, string> = {}): IncomingMessage {
  return { method: 'GET', url, headers } as never;
}

function fakeRes(): ServerResponse & { statusCode: number; body: string | undefined } {
  const res = {
    statusCode: 200,
    body: undefined as string | undefined,
    setHeader: vi.fn(),
    end: vi.fn(function (this: { body: string | undefined }, chunk?: string) {
      this.body = chunk;
    }),
  };
  return res as never;
}

function cookieFor(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe('auth guard', () => {
  it('lets an authenticated request through untouched', async () => {
    const { store, guard } = buildGuard();
    const res = fakeRes();
    const allowed = await guard(fakeReq('/api/scans', { cookie: cookieFor(store.create()) }), res);
    expect(allowed).toBe(true);
    expect(res.end).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated API request with a JSON 401', async () => {
    const { guard } = buildGuard();
    const res = fakeRes();
    expect(await guard(fakeReq('/api/scans'), res)).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe('{"error":"unauthenticated"}');
  });

  it('rejects an expired session the same as no session', async () => {
    const { store, guard } = buildGuard();
    const cookie = cookieFor(store.create());
    clock.now = SESSION_TTL_MS + 1;
    const res = fakeRes();
    expect(await guard(fakeReq('/api/scans', { cookie }), res)).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('always leaves the two session routes reachable', async () => {
    const { guard } = buildGuard();
    expect(await guard(fakeReq('/api/session/login'), fakeRes())).toBe(true);
    expect(await guard(fakeReq('/api/session/logout'), fakeRes())).toBe(true);
  });

  it('redirects page requests to /login', async () => {
    const { guard } = buildGuard();
    for (const page of ['/', '/audits', '/scans/job-1', '/audits/abc/report/fr']) {
      const res = fakeRes();
      expect(await guard(fakeReq(page), res), page).toBe(false);
      expect(res.statusCode, page).toBe(302);
      const calls = (res.setHeader as ReturnType<typeof vi.fn>).mock.calls as Array<
        [string, string]
      >;
      expect(calls.find(([name]) => name === 'location')?.[1], page).toBe('/login');
    }
  });

  it('keeps the login page and static assets reachable unauthenticated', async () => {
    const { guard } = buildGuard();
    for (const path of [
      '/login',
      '/login/',
      '/index.html',
      '/assets/index-a1b2c3.js',
      '/assets/style.css',
      '/fonts/inter.woff2',
      '/favicon.ico',
    ]) {
      const res = fakeRes();
      expect(await guard(fakeReq(path), res), path).toBe(true);
      expect(res.end, path).not.toHaveBeenCalled();
    }
  });

  it('redirects unknown dotted paths to /login instead of bypassing the session', async () => {
    const { guard } = buildGuard();
    // The old "any dot-plus-alphanumerics last segment" rule let these
    // through with no session; only real SPA asset extensions bypass now.
    for (const path of ['/audits/report.backup', '/scans/job-1.html2', '/x.evil']) {
      const res = fakeRes();
      expect(await guard(fakeReq(path), res), path).toBe(false);
      expect(res.statusCode, path).toBe(302);
      const calls = (res.setHeader as ReturnType<typeof vi.fn>).mock.calls as Array<
        [string, string]
      >;
      expect(calls.find(([name]) => name === 'location')?.[1], path).toBe('/login');
    }
  });

  it('stops redirecting once the browser holds a valid session', async () => {
    const { store, guard } = buildGuard();
    const cookie = cookieFor(store.create());
    expect(await guard(fakeReq('/audits', { cookie }), fakeRes())).toBe(true);
  });
});
