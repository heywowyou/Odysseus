import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from '../router.js';
import { registerMetaRoutes } from './meta.js';

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

describe('meta route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('exposes the configured revision, built-at stamp, and environment', async () => {
    vi.stubEnv('ODYSSEUS_BUILD_ID', 'deadbee');
    vi.stubEnv('ODYSSEUS_BUILT_AT', '2026-09-13T20:01:07Z');
    vi.stubEnv('NODE_ENV', 'production');
    const router = new Router();
    registerMetaRoutes(router);
    const res = fakeRes();

    await router.handle(fakeReq('/api/meta'), res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}')).toEqual({
      revision: 'deadbee',
      builtAt: '2026-09-13T20:01:07Z',
      environment: 'production',
    });
  });

  it('exposes no field beyond the allowlisted three', async () => {
    const router = new Router();
    registerMetaRoutes(router);
    const res = fakeRes();

    await router.handle(fakeReq('/api/meta'), res);

    expect(Object.keys(JSON.parse(res.body ?? '{}')).sort()).toEqual([
      'builtAt',
      'environment',
      'revision',
    ]);
  });
});
