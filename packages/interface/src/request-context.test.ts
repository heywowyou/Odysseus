import { describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  attachRequestContext,
  getRequestId,
  getRequestLog,
  logJobCreated,
  REQUEST_ID_HEADER,
} from './request-context.js';
import { logger } from './logger.js';

function fakeReq(headers: Record<string, string | string[]> = {}): IncomingMessage {
  return { headers } as never;
}

function fakeRes(): ServerResponse & { setHeader: ReturnType<typeof vi.fn> } {
  return { setHeader: vi.fn() } as never;
}

describe('attachRequestContext', () => {
  it('generates a request ID and echoes it back on the response', () => {
    const req = fakeReq();
    const res = fakeRes();

    const { requestId } = attachRequestContext(req, res);

    expect(requestId.length).toBeGreaterThan(0);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, requestId);
    expect(getRequestId(req)).toBe(requestId);
  });

  it('honors a well-formed client-supplied request ID', () => {
    const req = fakeReq({ [REQUEST_ID_HEADER]: 'client-supplied-id-123' });
    const res = fakeRes();

    const { requestId } = attachRequestContext(req, res);

    expect(requestId).toBe('client-supplied-id-123');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'client-supplied-id-123');
  });

  it('ignores an oversized or malformed client-supplied request ID and generates one instead', () => {
    const req = fakeReq({ [REQUEST_ID_HEADER]: 'x'.repeat(5000) });
    const res = fakeRes();

    const { requestId } = attachRequestContext(req, res);

    expect(requestId).not.toBe('x'.repeat(5000));
    expect(requestId.length).toBeLessThan(200);
  });

  it('ignores a client-supplied request ID containing control/injection characters', () => {
    const req = fakeReq({ [REQUEST_ID_HEADER]: 'abc\n"malicious":"payload"' });
    const res = fakeRes();

    const { requestId } = attachRequestContext(req, res);

    expect(requestId).not.toContain('\n');
    expect(requestId).not.toContain('malicious');
  });

  it('attaches a child logger that carries the requestId on every log call', () => {
    const req = fakeReq();
    const res = fakeRes();
    const childSpy = vi.spyOn(logger, 'child');

    const { requestId } = attachRequestContext(req, res);

    expect(childSpy).toHaveBeenCalledWith({ requestId });
    expect(getRequestLog(req)).toBe(childSpy.mock.results[0]?.value);
    childSpy.mockRestore();
  });
});

describe('getRequestLog', () => {
  it('falls back to the base logger for a request with no attached context', () => {
    const req = fakeReq();
    expect(getRequestLog(req)).toBe(logger);
    expect(getRequestId(req)).toBeUndefined();
  });
});

describe('logJobCreated', () => {
  it('logs the requestId and jobId together for a request that created a job', () => {
    const req = fakeReq();
    const res = fakeRes();
    attachRequestContext(req, res);
    const infoSpy = vi.spyOn(getRequestLog(req), 'info');

    logJobCreated(req, 'job-1', 'full-audit');

    expect(infoSpy).toHaveBeenCalledWith({ jobId: 'job-1', jobType: 'full-audit' }, 'job created');
    infoSpy.mockRestore();
  });
});
