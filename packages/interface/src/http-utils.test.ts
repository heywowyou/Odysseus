import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { jsonBodyNotRead, readJsonBodyOrRespond } from './http-utils.js';

function fakeReq(payload: Buffer): IncomingMessage {
  const req = Readable.from([payload]) as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = '/test';
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

describe('readJsonBodyOrRespond', () => {
  it('resolves a valid JSON body and sends nothing', async () => {
    const req = fakeReq(Buffer.from(JSON.stringify({ a: 1 })));
    const res = fakeRes();

    const body = await readJsonBodyOrRespond(req, res);

    expect(body).toEqual({ a: 1 });
    expect(res.end).not.toHaveBeenCalled();
  });

  it('resolves an empty body as undefined and sends nothing (the sentinel-collision case)', async () => {
    const req = fakeReq(Buffer.alloc(0));
    const res = fakeRes();

    const body = await readJsonBodyOrRespond(req, res);

    expect(body).toBeUndefined();
    expect(body).not.toBe(jsonBodyNotRead);
    expect(res.end).not.toHaveBeenCalled();
  });

  it('answers 400 with the shared message and returns the sentinel for malformed JSON', async () => {
    const req = fakeReq(Buffer.from('{not json'));
    const res = fakeRes();

    const body = await readJsonBodyOrRespond(req, res);

    expect(body).toBe(jsonBodyNotRead);
    expect(res.statusCode).toBe(400);
    expect(res.body).toBe(JSON.stringify({ error: 'request body must be valid JSON' }));
  });

  it('answers 413 with the shared message and returns the sentinel past the size limit', async () => {
    // One byte over MAX_JSON_BODY_BYTES (1,000,000, not exported), which is
    // what readJsonBody throws on.
    const req = fakeReq(Buffer.alloc(1_000_001, 0x61));
    const res = fakeRes();

    const body = await readJsonBodyOrRespond(req, res);

    expect(body).toBe(jsonBodyNotRead);
    expect(res.statusCode).toBe(413);
    expect(res.body).toBe(JSON.stringify({ error: 'request body is too large' }));
  });
});
