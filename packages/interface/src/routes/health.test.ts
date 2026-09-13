import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connection } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { Router } from '../router.js';
import { registerHealthRoutes } from './health.js';

function fakeReq(url: string): IncomingMessage {
  return { method: 'GET', url, headers: {} } as never;
}

function fakeRes(): ServerResponse & { body: string | undefined } {
  const res = {
    statusCode: 200,
    body: undefined as string | undefined,
    setHeader: vi.fn(),
    end(this: { body: string | undefined }, chunk?: string) {
      this.body = chunk;
    },
  };
  return res as never;
}

function connectionWithPing(ping: () => Promise<unknown>): Connection {
  return { db: { admin: () => ({ ping }) } } as never;
}

describe('health routes', () => {
  it('reports liveness without consulting runtime dependencies', async () => {
    const ping = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    const router = new Router();
    registerHealthRoutes(router, {
      connection: connectionWithPing(ping),
      isQueueReady: () => false,
    });
    const res = fakeRes();

    await router.handle(fakeReq('/health/live'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"status":"live"}');
    expect(ping).not.toHaveBeenCalled();
  });

  it('reports readiness after a database ping when the queue is operating', async () => {
    const router = new Router();
    registerHealthRoutes(router, {
      connection: connectionWithPing(vi.fn(async () => ({ ok: 1 }))),
      isQueueReady: () => true,
    });
    const res = fakeRes();

    await router.handle(fakeReq('/health/ready'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"status":"ready","database":"ok","queue":"ok"}');
  });

  it('fails readiness with a fixed non-sensitive payload when the database is unavailable', async () => {
    const router = new Router();
    registerHealthRoutes(router, {
      connection: connectionWithPing(async () => {
        throw new Error('mongodb://user:secret@internal-db.example/odysseus');
      }),
      isQueueReady: () => true,
    });
    const res = fakeRes();

    await router.handle(fakeReq('/health/ready'), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toBe('{"status":"not-ready","database":"unavailable","queue":"ok"}');
    expect(res.body).not.toContain('secret');
    expect(res.body).not.toContain('internal-db');
  });

  it('fails readiness when queue initialization has not completed', async () => {
    const router = new Router();
    registerHealthRoutes(router, {
      connection: connectionWithPing(async () => ({ ok: 1 })),
      isQueueReady: () => false,
    });
    const res = fakeRes();

    await router.handle(fakeReq('/health/ready'), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toContain('"queue":"unavailable"');
  });
});
