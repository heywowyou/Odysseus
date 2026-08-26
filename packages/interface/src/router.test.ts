import { describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Router } from './router.js';

function fakeReq(
  method: string,
  url: string,
  headers: Record<string, string> = {},
): IncomingMessage {
  return { method, url, headers } as never;
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

describe('Router', () => {
  it('matches a literal path and calls its handler', async () => {
    const router = new Router();
    const handler = vi.fn();
    router.get('/api/scans', handler);

    const req = fakeReq('GET', '/api/scans');
    const res = fakeRes();
    await router.handle(req, res);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toMatchObject({ params: {} });
  });

  it('captures :param segments and decodes them', async () => {
    const router = new Router();
    let captured: Record<string, string> = {};
    router.get('/api/scans/:jobId', (ctx) => {
      captured = ctx.params;
    });

    await router.handle(fakeReq('GET', '/api/scans/abc%20123'), fakeRes());
    expect(captured).toEqual({ jobId: 'abc 123' });
  });

  it('matches multiple :param segments in one pattern', async () => {
    const router = new Router();
    let captured: Record<string, string> = {};
    router.get('/api/audits/:auditId/report/:language', (ctx) => {
      captured = ctx.params;
    });

    await router.handle(fakeReq('GET', '/api/audits/audit-1/report/fr'), fakeRes());
    expect(captured).toEqual({ auditId: 'audit-1', language: 'fr' });
  });

  it('distinguishes methods on the same path', async () => {
    const router = new Router();
    const getHandler = vi.fn();
    const postHandler = vi.fn();
    router.get('/api/scans', getHandler);
    router.post('/api/scans', postHandler);

    await router.handle(fakeReq('POST', '/api/scans'), fakeRes());
    expect(postHandler).toHaveBeenCalledTimes(1);
    expect(getHandler).not.toHaveBeenCalled();
  });

  it('does not match a path with a different segment count', async () => {
    const router = new Router();
    const handler = vi.fn();
    router.get('/api/scans/:jobId', handler);

    const res = fakeRes();
    await router.handle(fakeReq('GET', '/api/scans/x/extra'), res);
    expect(handler).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  it('exposes query parameters', async () => {
    const router = new Router();
    let captured: URLSearchParams | undefined;
    router.get('/api/scans', (ctx) => {
      captured = ctx.query;
    });

    await router.handle(fakeReq('GET', '/api/scans?limit=200'), fakeRes());
    expect(captured?.get('limit')).toBe('200');
  });

  it('falls back to the static handler when no route matches', async () => {
    const router = new Router();
    const fallback = vi.fn();
    router.setFallback(fallback);
    router.get('/api/scans', vi.fn());

    await router.handle(fakeReq('GET', '/index.html'), fakeRes());
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('returns 404 with no fallback registered', async () => {
    const router = new Router();
    const res = fakeRes();
    await router.handle(fakeReq('GET', '/nope'), res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toBe('Not found');
  });

  describe('origin and content-type checks on state-changing requests', () => {
    it('rejects a POST with a Content-Type other than application/json', async () => {
      const router = new Router();
      const handler = vi.fn();
      router.post('/api/scans', handler);

      const res = fakeRes();
      await router.handle(
        fakeReq('POST', '/api/scans', { 'content-type': 'text/plain', 'content-length': '2' }),
        res,
      );

      expect(handler).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(415);
    });

    it('rejects a POST whose Origin does not match the request Host', async () => {
      const router = new Router();
      const handler = vi.fn();
      router.post('/api/scans', handler);

      const res = fakeRes();
      await router.handle(
        fakeReq('POST', '/api/scans', {
          origin: 'https://attacker.example',
          host: '127.0.0.1:4600',
          'content-type': 'application/json',
          'content-length': '2',
        }),
        res,
      );

      expect(handler).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });

    it('allows a same-origin JSON POST through', async () => {
      const router = new Router();
      const handler = vi.fn();
      router.post('/api/scans', handler);

      const res = fakeRes();
      await router.handle(
        fakeReq('POST', '/api/scans', {
          origin: 'http://127.0.0.1:4600',
          host: '127.0.0.1:4600',
          'content-type': 'application/json',
          'content-length': '2',
        }),
        res,
      );

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('allows a bodyless POST with no Content-Type through, as long as the origin is acceptable', async () => {
      const router = new Router();
      const handler = vi.fn();
      router.post('/api/audits/:auditId/regenerate-report', handler);

      const res = fakeRes();
      await router.handle(fakeReq('POST', '/api/audits/audit-1/regenerate-report'), res);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
