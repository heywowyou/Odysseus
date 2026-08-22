import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { checkSecurityHeaders } from './security-headers.js';

function startServer(headers: Record<string, string>): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, headers).end('ok');
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

  it('reports fetched: false without throwing when the origin is unreachable', async () => {
    const result = await checkSecurityHeaders('http://127.0.0.1:1', 500);

    expect(result.fetched).toBe(false);
    expect(result.fetchError).toBeDefined();
  });
});
