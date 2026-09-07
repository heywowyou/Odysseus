import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connection } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { Router } from '../router.js';
import type { JobQueue } from '../queue/job-queue.js';
import { registerOutreachRoutes } from './outreach.js';
import { registerProspectInsightRoutes } from './prospect-insights.js';
import { registerProspectRoutes } from './prospects.js';

const fakeQueue = { notify: vi.fn(), requestCancel: vi.fn() } as unknown as JobQueue;

/** Plan 013's static guarantee, held across every operator route module at
 *  once: the private interface can inspect and mark state, but it can
 *  never send, deliver, or forward anything. Individual module tests pin
 *  their own route lists; this suite re-registers all three and proves
 *  the behavior: any send- or deliver-shaped URL falls through to the
 *  router's bare 404 because no route matches it, while the real
 *  operator routes still answer. No static fallback is registered, so
 *  the bare-404 body is the unmatched marker. */

/** Only the read the happy-path probe touches is stubbed; everything
 *  else comes from the real module so a future route change cannot
 *  silently bypass this suite's imports. */
vi.mock('@odysseus/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odysseus/store')>()),
  listOutreachReviewDrafts: vi.fn(async () => ({ rows: [], total: 0, limit: 50, offset: 0 })),
}));

function registerAll(router: Router): void {
  const connection = {} as Connection;
  registerProspectRoutes(router, connection);
  registerProspectInsightRoutes(router, connection);
  registerOutreachRoutes(router, connection, fakeQueue);
}

function fakeReq(url: string, method = 'GET'): IncomingMessage {
  const req = Readable.from([]) as unknown as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = {};
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

describe('operator route surface (plan 013)', () => {
  it('answers a real list route', async () => {
    const router = new Router();
    registerAll(router);
    const res = fakeRes();
    await router.handle(fakeReq('/api/outreach/drafts'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBeDefined();
  });

  it('never matches a send or deliver route in any operator module', async () => {
    const router = new Router();
    registerAll(router);
    // Only a state-changing method could send, and only POST/PATCH carry
    // it; a GET whose last segment spells 'send' can still match a
    // parametrized read route, and that is harmless by construction.
    for (const url of [
      '/api/outreach/send',
      '/api/outreach/deliver',
      '/api/prospects/send',
      '/api/outreach/threads/x/send',
      '/api/outreach/drafts/x/resend',
      '/api/outreach/threads/x/reply',
    ]) {
      for (const method of ['POST', 'PATCH'] as const) {
        const res = fakeRes();
        await router.handle(fakeReq(url, method), res);
        expect(res.statusCode, `${method} ${url}`).toBe(404);
        expect(res.body, `${method} ${url}`).toBe('Not found');
      }
    }
  });

  it('clamps an out-of-range page request instead of erroring', async () => {
    const router = new Router();
    registerAll(router);
    const res = fakeRes();
    await router.handle(fakeReq('/api/outreach/drafts?limit=0'), res);
    expect(res.statusCode).toBe(200);
  });
});
