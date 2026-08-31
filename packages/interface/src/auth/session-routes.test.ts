import { Readable } from 'node:stream';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import { beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Router } from '../router.js';
import { logger } from '../logger.js';
import { LOGIN_PATH, LOGOUT_PATH, registerSessionRoutes } from './session-routes.js';
import {
  createInMemorySessionStore,
  readSessionCookieToken,
  SESSION_COOKIE_NAME,
} from './session-store.js';
import { createLoginRateLimiter } from './rate-limit.js';

/** The real pino instance is replaced wholesale so the tests can assert on
 *  exactly what the login handler logged. */
vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger,
}));

const scrypt = promisify(scryptCallback);
const PASSWORD = 'a very strong operator password';
const IP = '198.51.100.7';
const clock = { now: 1_700_000_000_000 };

let configuredHash = '';

beforeAll(async () => {
  const salt = randomBytes(16);
  const hash = await scrypt(PASSWORD, salt, 64);
  configuredHash = `${salt.toString('hex')}:${(hash as Buffer).toString('hex')}`;
});

beforeEach(() => {
  clock.now = 1_700_000_000_000;
  vi.mocked(logger.info).mockClear();
  vi.mocked(logger.warn).mockClear();
  vi.mocked(logger.error).mockClear();
});

function fakeReq(
  url: string,
  headers: Record<string, string> = {},
  body?: unknown,
): IncomingMessage {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Readable.from(chunks) as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = url;
  req.headers = headers;
  req.socket = { remoteAddress: IP } as unknown as IncomingMessage['socket'];
  return req;
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

function buildFixture(getPasswordHash: () => string | null = () => configuredHash) {
  const store = createInMemorySessionStore({ now: () => clock.now });
  const limiter = createLoginRateLimiter({ now: () => clock.now });
  const router = new Router();
  registerSessionRoutes(router, { getPasswordHash, sessionStore: store, rateLimiter: limiter });
  return { router, store };
}

function setCookieOf(res: ReturnType<typeof fakeRes>): string | undefined {
  const calls = (res.setHeader as unknown as Mock).mock.calls as Array<[string, string]>;
  return calls.find(([name]) => name === 'set-cookie')?.[1];
}

describe('POST /api/session/login', () => {
  it('answers 204 with the exact cookie flag set over plain HTTP', async () => {
    const { router } = buildFixture();
    const res = fakeRes();
    await router.handle(fakeReq(LOGIN_PATH, {}, { password: PASSWORD }), res);

    expect(res.statusCode).toBe(204);
    const cookie = setCookieOf(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=[A-Za-z0-9_-]{43}`));
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=86400');
    expect(cookie).not.toContain('Secure');
    expect(cookie).not.toContain('Domain');
  });

  it('adds Secure only when the request arrived over https via the proxy', async () => {
    const { router } = buildFixture();
    const httpsRes = fakeRes();
    await router.handle(
      fakeReq(LOGIN_PATH, { 'x-forwarded-proto': 'https' }, { password: PASSWORD }),
      httpsRes,
    );
    expect(setCookieOf(httpsRes)).toContain('Secure');

    const plainRes = fakeRes();
    await router.handle(
      fakeReq(LOGIN_PATH, { 'x-forwarded-proto': 'http' }, { password: PASSWORD }),
      plainRes,
    );
    expect(setCookieOf(plainRes)).not.toContain('Secure');
  });

  it('issues a token the session store validates', async () => {
    const { router, store } = buildFixture();
    const res = fakeRes();
    await router.handle(fakeReq(LOGIN_PATH, {}, { password: PASSWORD }), res);
    const cookie = setCookieOf(res)!;
    const token = readSessionCookieToken({ headers: { cookie } } as unknown as IncomingMessage);
    expect(store.validate(token!)).toBe(true);
  });

  it('answers 401 invalid-credentials on a wrong password', async () => {
    const { router } = buildFixture();
    const res = fakeRes();
    await router.handle(fakeReq(LOGIN_PATH, {}, { password: 'not the password' }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe('{"error":"invalid-credentials"}');
  });

  it('counts a missing or malformed body as a failed attempt', async () => {
    const { router } = buildFixture();
    const noBody = fakeRes();
    await router.handle(fakeReq(LOGIN_PATH), noBody);
    expect(noBody.statusCode).toBe(401);

    clock.now += 1_000;
    const wrongShape = fakeRes();
    await router.handle(fakeReq(LOGIN_PATH, {}, { user: 'x' }), wrongShape);
    expect(wrongShape.statusCode).toBe(401);

    // Both attempts were recorded as failures: the next one is locked.
    const locked = fakeRes();
    await router.handle(fakeReq(LOGIN_PATH, {}, { password: PASSWORD }), locked);
    expect(locked.statusCode).toBe(429);
  });

  it('locks before verifying: a locked IP gets 429 even with the correct password', async () => {
    const { router } = buildFixture();
    const first = fakeRes();
    await router.handle(fakeReq(LOGIN_PATH, {}, { password: 'wrong' }), first);
    expect(first.statusCode).toBe(401);

    const locked = fakeRes();
    await router.handle(fakeReq(LOGIN_PATH, {}, { password: PASSWORD }), locked);
    expect(locked.statusCode).toBe(429);
    expect(JSON.parse(locked.body!)).toEqual({ error: 'locked', retryAfterSeconds: 1 });

    clock.now += 1_000;
    const after = fakeRes();
    await router.handle(fakeReq(LOGIN_PATH, {}, { password: PASSWORD }), after);
    expect(after.statusCode).toBe(204);
  });

  it('escalates the lock window across consecutive wrong passwords', async () => {
    const { router } = buildFixture();
    const first = fakeRes();
    await router.handle(fakeReq(LOGIN_PATH, {}, { password: 'wrong' }), first);
    expect(first.statusCode).toBe(401);
    clock.now += 1_000;

    const second = fakeRes();
    await router.handle(fakeReq(LOGIN_PATH, {}, { password: 'wrong again' }), second);
    expect(second.statusCode).toBe(401);

    const locked = fakeRes();
    await router.handle(fakeReq(LOGIN_PATH, {}, { password: PASSWORD }), locked);
    expect(locked.statusCode).toBe(429);
    expect(JSON.parse(locked.body!)).toEqual({ error: 'locked', retryAfterSeconds: 2 });
  });

  it('answers 400 auth-not-configured when no hash is configured', async () => {
    const { router } = buildFixture(() => null);
    const res = fakeRes();
    await router.handle(fakeReq(LOGIN_PATH, {}, { password: PASSWORD }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toBe('{"error":"auth-not-configured"}');
  });

  it('keeps leaning on the router for the Origin check', async () => {
    const { router } = buildFixture();
    const res = fakeRes();
    await router.handle(
      fakeReq(
        LOGIN_PATH,
        { origin: 'https://evil.example', host: 'app.odysseusaudit.com' },
        { password: PASSWORD },
      ),
      res,
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/session/logout', () => {
  it('deletes the session server-side and clears the cookie', async () => {
    const { router, store } = buildFixture();
    const loginRes = fakeRes();
    await router.handle(fakeReq(LOGIN_PATH, {}, { password: PASSWORD }), loginRes);
    const cookie = setCookieOf(loginRes)!;
    const token = readSessionCookieToken({ headers: { cookie } } as unknown as IncomingMessage)!;

    const logoutRes = fakeRes();
    await router.handle(fakeReq(LOGOUT_PATH, { cookie }), logoutRes);
    expect(logoutRes.statusCode).toBe(204);
    const cleared = setCookieOf(logoutRes)!;
    expect(cleared).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(cleared).toContain('Max-Age=0');
    expect(store.validate(token)).toBe(false);
  });

  it('stays an idempotent 204 with no cookie at all', async () => {
    const { router } = buildFixture();
    const res = fakeRes();
    await router.handle(fakeReq(LOGOUT_PATH), res);
    expect(res.statusCode).toBe(204);
    expect(setCookieOf(res)).toContain('Max-Age=0');
  });
});

describe('login logging', () => {
  it('never logs the password or the session token', async () => {
    const { router } = buildFixture();
    const wrongPassword = 'secret-probe-value';
    await router.handle(fakeReq(LOGIN_PATH, {}, { password: wrongPassword }), fakeRes());
    clock.now += 1_000;
    const successRes = fakeRes();
    await router.handle(fakeReq(LOGIN_PATH, {}, { password: PASSWORD }), successRes);

    const captured = JSON.stringify([
      ...vi.mocked(logger.info).mock.calls,
      ...vi.mocked(logger.warn).mock.calls,
      ...vi.mocked(logger.error).mock.calls,
    ]);
    expect(captured).not.toContain(wrongPassword);
    expect(captured).not.toContain(PASSWORD);
    const token = readSessionCookieToken({
      headers: { cookie: setCookieOf(successRes)! },
    } as unknown as IncomingMessage);
    expect(token).not.toBeNull();
    expect(captured).not.toContain(token!);
    // The non-secret part is logged: the client ip, so lockouts are legible.
    expect(captured).toContain(IP);
  });
});
