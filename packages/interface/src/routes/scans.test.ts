import { Readable } from 'node:stream';
import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  createJob: vi.fn(),
  getJob: vi.fn(),
  getSeverityRollups: vi.fn(),
  listJobs: vi.fn(),
  cancelJob: vi.fn(),
  cancelQueuedJobs: vi.fn(),
  deleteJob: vi.fn(),
  getAudit: vi.fn(),
  deleteAuditCascade: vi.fn(),
}));

vi.mock('@odysseus/scanner', () => ({
  buildAuditDir: vi.fn(() => '/tmp/fake-audit-dir'),
  getArtifactsRoot: vi.fn(() => '/tmp'),
}));

import {
  cancelJob,
  cancelQueuedJobs,
  createJob,
  deleteAuditCascade,
  deleteJob,
  getAudit,
  getJob,
} from '@odysseus/store';
import { Router } from '../router.js';
import type { JobQueue } from '../queue/job-queue.js';
import { registerScanRoutes } from './scans.js';

function fakeReq(body: unknown, method = 'POST', url = '/api/scans'): IncomingMessage {
  const payload = Buffer.from(body === undefined ? '' : JSON.stringify(body));
  const req = Readable.from([payload]) as unknown as IncomingMessage;
  req.method = method;
  req.url = url;
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
const fakeQueue = { notify: vi.fn(), requestCancel: vi.fn() } as unknown as JobQueue;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createJob).mockResolvedValue({ jobId: 'job-1' } as never);
});

describe('POST /api/scans siren validation', () => {
  it('rejects a checksum-invalid siren with 400, never creating a job', async () => {
    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);

    const req = fakeReq({
      type: 'full-audit',
      url: 'https://example.com/',
      options: { siren: '123456789' },
    });
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body ?? '{}').error).toMatch(/siren/i);
    expect(createJob).not.toHaveBeenCalled();
  });

  it('accepts a checksum-valid siren and passes it through to createJob', async () => {
    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);

    const req = fakeReq({
      type: 'full-audit',
      url: 'https://example.com/',
      options: { siren: '732829320' },
    });
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

describe('POST /api/scans numeric crawl option validation', () => {
  it.each([
    ['maxPages', 0],
    ['maxPages', -5],
    ['maxPages', 2.5],
    ['maxDepth', 0],
    ['maxDepth', -1],
    ['maxDepth', 1.5],
    ['delayMs', 0],
    ['delayMs', -1000],
    ['delayMs', 99.9],
    ['scanConcurrency', 0],
    ['scanConcurrency', -2],
    ['scanConcurrency', 1.5],
  ] as const)('rejects %s = %s with 400, never creating a job', async (key, value) => {
    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);

    const req = fakeReq({
      type: 'full-audit',
      url: 'https://example.com/',
      options: { [key]: value },
    });
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body ?? '{}').error).toBe(`${key} must be a positive whole number`);
    expect(createJob).not.toHaveBeenCalled();
  });

  it('passes positive whole-number options through to createJob', async () => {
    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);

    const req = fakeReq({
      type: 'full-audit',
      url: 'https://example.com/',
      options: { maxPages: 50, maxDepth: 3, delayMs: 1000, scanConcurrency: 2 },
    });
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(201);
    const options = vi.mocked(createJob).mock.calls[0]?.[1]?.options;
    expect(options).toMatchObject({ maxPages: 50, maxDepth: 3, delayMs: 1000, scanConcurrency: 2 });
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

  it('rejects a url carrying embedded credentials, never creating a job', async () => {
    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);

    const req = fakeReq({ type: 'full-audit', url: 'https://user:pass@example.com/' });
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body ?? '{}').error).toMatch(/credentials/i);
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

describe('POST /api/scans/:jobId/cancel', () => {
  it('registers the stop even when the job was read as queued', async () => {
    vi.mocked(getJob).mockResolvedValue({
      jobId: 'job-1',
      type: 'full-audit',
      status: 'queued',
    } as never);
    vi.mocked(cancelJob).mockResolvedValue(true);

    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeReq(undefined, 'POST', '/api/scans/job-1/cancel'), res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}')).toMatchObject({ jobId: 'job-1', status: 'cancelled' });
    expect(cancelJob).toHaveBeenCalledWith(fakeConnection, 'job-1', 'cancelled by operator');
    expect(fakeQueue.requestCancel).toHaveBeenCalledWith('job-1');
  });

  it('registers the stop and cancels a running full-audit job', async () => {
    vi.mocked(getJob).mockResolvedValue({
      jobId: 'job-2',
      type: 'full-audit',
      status: 'running',
    } as never);
    vi.mocked(cancelJob).mockResolvedValue(true);

    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeReq(undefined, 'POST', '/api/scans/job-2/cancel'), res);

    expect(res.statusCode).toBe(200);
    expect(fakeQueue.requestCancel).toHaveBeenCalledWith('job-2');
    expect(cancelJob).toHaveBeenCalled();
  });

  it('registers the stop and cancels a running hotel-prescan job', async () => {
    vi.mocked(getJob).mockResolvedValue({
      jobId: 'job-3',
      type: 'hotel-prescan',
      status: 'running',
    } as never);
    vi.mocked(cancelJob).mockResolvedValue(true);

    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeReq(undefined, 'POST', '/api/scans/job-3/cancel'), res);

    expect(res.statusCode).toBe(200);
    expect(fakeQueue.requestCancel).toHaveBeenCalledWith('job-3');
    expect(cancelJob).toHaveBeenCalledWith(fakeConnection, 'job-3', 'cancelled by operator');
  });

  it('answers 409 for an already terminal job', async () => {
    vi.mocked(getJob).mockResolvedValue({
      jobId: 'job-4',
      type: 'full-audit',
      status: 'complete',
    } as never);

    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeReq(undefined, 'POST', '/api/scans/job-4/cancel'), res);

    expect(res.statusCode).toBe(409);
    expect(cancelJob).not.toHaveBeenCalled();
  });

  it('answers 409 when the job turned terminal before the cancel write landed', async () => {
    vi.mocked(getJob).mockResolvedValue({
      jobId: 'job-8',
      type: 'full-audit',
      status: 'running',
    } as never);
    vi.mocked(cancelJob).mockResolvedValue(false);

    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeReq(undefined, 'POST', '/api/scans/job-8/cancel'), res);

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body ?? '{}')).toEqual({ error: 'job is no longer queued or running' });
    expect(fakeQueue.requestCancel).toHaveBeenCalledWith('job-8');
  });

  it('answers 404 for an unknown job', async () => {
    vi.mocked(getJob).mockResolvedValue(null);

    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeReq(undefined, 'POST', '/api/scans/nope/cancel'), res);

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/scans/queue/clear', () => {
  it('cancels every queued job and reports the count', async () => {
    vi.mocked(cancelQueuedJobs).mockResolvedValue(3);

    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeReq(undefined, 'POST', '/api/scans/queue/clear'), res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}')).toEqual({ cleared: 3 });
    expect(cancelQueuedJobs).toHaveBeenCalledWith(fakeConnection, 'cancelled by operator');
  });
});

describe('DELETE /api/scans/:jobId', () => {
  it('deletes a complete job, its audit cascade, and the artifacts directory', async () => {
    vi.mocked(getJob).mockResolvedValue({
      jobId: 'job-5',
      type: 'full-audit',
      status: 'complete',
      auditId: 'audit-5',
    } as never);
    vi.mocked(getAudit).mockResolvedValue({
      auditId: 'audit-5',
      siteUrl: 'https://example.com/',
      startedAt: new Date('2026-09-01T00:00:00Z'),
    } as never);
    vi.mocked(deleteAuditCascade).mockResolvedValue({
      audits: 1,
      findings: 2,
      analyses: 2,
      reports: 2,
      reportApprovals: 1,
    });
    vi.mocked(deleteJob).mockResolvedValue(true);
    const rmSpy = vi.spyOn(fs, 'rm').mockResolvedValue(undefined);

    try {
      const router = new Router();
      registerScanRoutes(router, fakeConnection, fakeQueue);
      const res = fakeRes();
      await router.handle(fakeReq(undefined, 'DELETE', '/api/scans/job-5'), res);

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body ?? '{}')).toMatchObject({
        jobId: 'job-5',
        deleted: true,
        auditsDeleted: 1,
      });
      expect(rmSpy).toHaveBeenCalledWith('/tmp/fake-audit-dir', { recursive: true, force: true });
      expect(deleteAuditCascade).toHaveBeenCalledWith(fakeConnection, 'audit-5');
      expect(deleteJob).toHaveBeenCalledWith(fakeConnection, 'job-5');
    } finally {
      rmSpy.mockRestore();
    }
  });

  it('refuses to delete a running job', async () => {
    vi.mocked(getJob).mockResolvedValue({
      jobId: 'job-6',
      type: 'full-audit',
      status: 'running',
    } as never);

    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeReq(undefined, 'DELETE', '/api/scans/job-6'), res);

    expect(res.statusCode).toBe(409);
    expect(deleteJob).not.toHaveBeenCalled();
    expect(deleteAuditCascade).not.toHaveBeenCalled();
  });

  it('cascades every audit a prospecting job produced', async () => {
    vi.mocked(getJob).mockResolvedValue({
      jobId: 'job-7',
      type: 'prospecting',
      status: 'failed',
      auditIds: ['audit-a', 'audit-b'],
    } as never);
    // No audit documents exist (they were swept earlier); the cascade must
    // still run for each id and the row must still delete.
    vi.mocked(getAudit).mockResolvedValue(null);
    vi.mocked(deleteAuditCascade).mockResolvedValue({
      audits: 0,
      findings: 0,
      analyses: 0,
      reports: 0,
      reportApprovals: 0,
    });
    vi.mocked(deleteJob).mockResolvedValue(true);

    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeReq(undefined, 'DELETE', '/api/scans/job-7'), res);

    expect(res.statusCode).toBe(200);
    expect(deleteAuditCascade).toHaveBeenCalledTimes(2);
    expect(deleteJob).toHaveBeenCalledWith(fakeConnection, 'job-7');
  });

  it('answers 404 for an unknown job', async () => {
    vi.mocked(getJob).mockResolvedValue(null);

    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeReq(undefined, 'DELETE', '/api/scans/nope'), res);

    expect(res.statusCode).toBe(404);
    expect(deleteJob).not.toHaveBeenCalled();
  });
});
