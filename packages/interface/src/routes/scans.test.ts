import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  createJob: vi.fn(),
  getJob: vi.fn(),
  getSeverityRollups: vi.fn(),
  listJobs: vi.fn(),
}));

import { createJob } from '@odysseus/store';
import { Router } from '../router.js';
import { registerScanRoutes } from './scans.js';

function fakeReq(body: unknown): IncomingMessage {
  const payload = Buffer.from(JSON.stringify(body));
  const req = Readable.from([payload]) as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = '/api/scans';
  req.headers = { 'content-type': 'application/json', 'content-length': String(payload.length) };
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

const fakeConnection = {} as never;
const fakeQueue = { notify: vi.fn() } as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createJob).mockResolvedValue({ jobId: 'job-1' } as never);
});

describe('POST /api/scans siren validation', () => {
  it('rejects a checksum-invalid siren with 400, never creating a job', async () => {
    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);

    const req = fakeReq({ type: 'full-audit', url: 'https://example.com/', options: { siren: '123456789' } });
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body ?? '{}').error).toMatch(/siren/i);
    expect(createJob).not.toHaveBeenCalled();
  });

  it('accepts a checksum-valid siren and passes it through to createJob', async () => {
    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);

    const req = fakeReq({ type: 'full-audit', url: 'https://example.com/', options: { siren: '732829320' } });
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(201);
    expect(createJob).toHaveBeenCalledWith(
      fakeConnection,
      expect.objectContaining({ options: expect.objectContaining({ siren: '732829320' }) }),
    );
  });

  it('creates a job with no siren option when none was supplied', async () => {
    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);

    const req = fakeReq({ type: 'full-audit', url: 'https://example.com/' });
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(201);
    const options = vi.mocked(createJob).mock.calls[0]?.[1]?.options;
    expect(options).not.toHaveProperty('siren');
  });
});

describe('POST /api/scans URL scheme validation', () => {
  it('rejects a file:// url, never creating a job', async () => {
    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);

    const req = fakeReq({ type: 'full-audit', url: 'file:///etc/passwd' });
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body ?? '{}').error).toMatch(/url/i);
    expect(createJob).not.toHaveBeenCalled();
  });

  it('rejects a javascript: url, never creating a job', async () => {
    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);

    const req = fakeReq({ type: 'full-audit', url: 'javascript:alert(1)' });
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(400);
    expect(createJob).not.toHaveBeenCalled();
  });

  it('accepts an https:// url', async () => {
    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);

    const req = fakeReq({ type: 'full-audit', url: 'https://example.com/' });
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(201);
  });
});

describe('POST /api/scans request body size limit', () => {
  it('rejects an oversized body with 413, never creating a job', async () => {
    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);

    const oversizedUrl = `https://example.com/${'a'.repeat(1_100_000)}`;
    const req = fakeReq({ type: 'full-audit', url: oversizedUrl });
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(413);
    expect(createJob).not.toHaveBeenCalled();
  });
});
