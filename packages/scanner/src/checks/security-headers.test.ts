import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { checkSecurityHeaders } from './security-headers.js';

let lastUserAgent: string | undefined;

function startServer(
  headers: Record<string, string>,
  status = 200,
  body = 'ok',
): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      lastUserAgent = req.headers['user-agent'];
      res.writeHead(status, headers).end(body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

describe('checkSecurityHeaders', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it('reports every header present when the response sends all five', async () => {
    const started = await startServer({
      'content-security-policy': "default-src 'self'",
      'strict-transport-security': 'max-age=63072000',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'geolocation=()',
    });
    server = started.server;

    const result = await checkSecurityHeaders(started.origin, 5000);

    expect(result).toMatchObject({
      fetched: true,
      hasCsp: true,
      hasHsts: true,
      hasXFrameOptions: true,
      hasReferrerPolicy: true,
      hasPermissionsPolicy: true,
    });
  });

  it('identifies itself with the crawler user agent by default', async () => {
    const started = await startServer({});
    server = started.server;

    await checkSecurityHeaders(started.origin, 5000);

    expect(lastUserAgent?.startsWith('OdysseusBot/')).toBe(true);
  });

  it('sends a user agent passed by the caller', async () => {
    const started = await startServer({});
    server = started.server;

    await checkSecurityHeaders(started.origin, 5000, 'CustomBot/2.0');

    expect(lastUserAgent).toBe('CustomBot/2.0');
  });

  it('reports every header absent when the response sends none', async () => {
    const started = await startServer({});
    server = started.server;

    const result = await checkSecurityHeaders(started.origin, 5000);

    expect(result).toMatchObject({
      fetched: true,
      hasCsp: false,
      hasHsts: false,
      hasXFrameOptions: false,
      hasReferrerPolicy: false,
      hasPermissionsPolicy: false,
    });
  });

  it.each([401, 403, 429, 503])('treats HTTP %s as incomplete evidence', async (status) => {
    const started = await startServer({}, status, 'Access denied');
    server = started.server;

    const result = await checkSecurityHeaders(started.origin, 5000);

    expect(result.fetched).toBe(false);
    expect(result.fetchError).toBe(`HTTP ${status}`);
  });

  it('treats a successful challenge page as incomplete evidence', async () => {
    const started = await startServer(
      { 'content-type': 'text/html' },
      200,
      '<title>Just a moment</title><p>Checking your browser</p>',
    );
    server = started.server;

    const result = await checkSecurityHeaders(started.origin, 5000);

    expect(result.fetched).toBe(false);
    expect(result.fetchError).toMatch(/wall response/u);
  });

  it('reports fetched: false without throwing when the origin is unreachable', async () => {
    const result = await checkSecurityHeaders('http://127.0.0.1:1', 500);

    expect(result.fetched).toBe(false);
    expect(result.fetchError).toBeDefined();
  });
});
