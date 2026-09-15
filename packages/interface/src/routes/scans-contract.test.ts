import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odysseus/store')>()),
  checkScanLaunch: vi.fn(),
  createJob: vi.fn(),
  findProspectsByDomain: vi.fn(),
}));

import {
  checkScanLaunch,
  createJob,
  findProspectsByDomain,
  type NewJobInput,
} from '@odysseus/store';
import { Router } from '../router.js';
import { registerScanRoutes } from './scans.js';

function fakeReq(body: unknown): IncomingMessage {
  const payload = Buffer.from(JSON.stringify(body));
  const req = Readable.from([payload]) as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = '/api/scans';
  req.headers = {
    'content-type': 'application/json',
    'content-length': String(payload.length),
  };
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

async function post(body: unknown): Promise<{ statusCode: number; body: unknown }> {
  const router = new Router();
  registerScanRoutes(router, fakeConnection, fakeQueue);
  const res = fakeRes();
  await router.handle(fakeReq(body), res);
  return { statusCode: res.statusCode, body: JSON.parse(res.body ?? '{}') as unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkScanLaunch).mockResolvedValue({
    allowed: true,
    registrableDomain: 'example.fr',
  });
  vi.mocked(findProspectsByDomain).mockResolvedValue([{ prospectId: 'prospect-1' }] as never);
  vi.mocked(createJob).mockImplementation(
    async (_connection, input: NewJobInput) =>
      ({
        ...input,
        jobId: `job-${input.type}`,
      }) as never,
  );
});

describe('POST /api/scans runtime contract', () => {
  it.each([
    ['quick-check', { type: 'quick-check', url: 'https://example.fr/' }, { maxPages: 1 }],
    ['prospecting-audit', { type: 'prospecting-audit', url: 'https://example.fr/' }, {}],
    ['full-audit', { type: 'full-audit', url: 'https://example.fr/', options: {} }, {}],
  ] as const)(
    'creates the canonical %s job and attaches a matching prospect',
    async (_name, body, extraOptions) => {
      const response = await post(body);

      expect(response.statusCode).toBe(201);
      expect(createJob).toHaveBeenCalledWith(fakeConnection, {
        type: body.type,
        siteUrl: body.url,
        options: { prospectId: 'prospect-1', ...extraOptions },
      });
      expect(checkScanLaunch).toHaveBeenCalledWith(fakeConnection, {
        url: body.url,
        kind: body.type,
        prospectId: 'prospect-1',
      });
      expect(response.body).toMatchObject({ jobId: `job-${body.type}` });
      if (body.type !== 'full-audit') {
        expect(response.body).toMatchObject({ started: true, type: body.type });
      }
    },
  );
});
