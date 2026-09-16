import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odysseus/store')>()),
  checkScanLaunch: vi.fn(),
  createJob: vi.fn(),
  findProspectsByDomain: vi.fn(),
  getJob: vi.fn(),
  getAudit: vi.fn(),
  deleteAuditCascade: vi.fn(),
  deleteJob: vi.fn(),
}));

import {
  ActiveJobSlotTakenError,
  checkScanLaunch,
  createJob,
  deleteAuditCascade,
  deleteJob,
  findProspectsByDomain,
  getAudit,
  getJob,
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
      expect(response.body).toMatchObject({
        started: true,
        jobId: `job-${body.type}`,
        type: body.type,
      });
    },
  );

  it.each([
    ['quick-check', { maxPages: 1 }],
    ['full-audit', {}],
  ] as const)(
    'stores the advanced pacing options sent with a %s scan',
    async (type, pinnedOptions) => {
      const response = await post({
        type,
        url: 'https://example.fr/',
        options: { delayMs: 60_000, scanConcurrency: 1 },
      });

      expect(response.statusCode).toBe(201);
      expect(createJob).toHaveBeenCalledWith(fakeConnection, {
        type,
        siteUrl: 'https://example.fr/',
        options: {
          prospectId: 'prospect-1',
          delayMs: 60_000,
          scanConcurrency: 1,
          ...pinnedOptions,
        },
      });
    },
  );

  it.each(['prospecting-audit', 'outreach-full-scan'])(
    'refuses the retired %s intent without creating a job',
    async (type) => {
      const response = await post({ type, url: 'https://example.fr/' });

      expect(response.statusCode).toBe(400);
      expect(createJob).not.toHaveBeenCalled();
      expect(checkScanLaunch).not.toHaveBeenCalled();
    },
  );
});

describe('DELETE /api/scans/:jobId', () => {
  async function remove(inFlight: boolean): Promise<number> {
    vi.mocked(getJob).mockResolvedValue({
      jobId: 'job-1',
      status: 'cancelled',
      auditId: 'audit-1',
    } as never);
    vi.mocked(getAudit).mockResolvedValue(null);
    const queue = { notify: vi.fn(), isJobInFlight: vi.fn().mockReturnValue(inFlight) } as never;
    const router = new Router();
    registerScanRoutes(router, fakeConnection, queue);
    const req = Readable.from([]) as unknown as IncomingMessage;
    req.method = 'DELETE';
    req.url = '/api/scans/job-1';
    req.headers = {};
    const res = fakeRes();
    await router.handle(req, res);
    return res.statusCode;
  }

  it('refuses a stopped job whose pipeline is still finishing its stage', async () => {
    expect(await remove(true)).toBe(409);
    expect(deleteAuditCascade).not.toHaveBeenCalled();
    expect(deleteJob).not.toHaveBeenCalled();
  });

  it('deletes a stopped job once its pipeline has let go', async () => {
    vi.mocked(deleteJob).mockResolvedValue(true as never);
    expect(await remove(false)).toBe(200);
    expect(deleteAuditCascade).toHaveBeenCalledWith(fakeConnection, 'audit-1');
    expect(deleteJob).toHaveBeenCalled();
  });
});

describe('POST /api/scans launch race', () => {
  it('refuses as host-busy when a concurrent launch took the prospect slot first', async () => {
    vi.mocked(createJob).mockRejectedValueOnce(new ActiveJobSlotTakenError('job-other'));
    const response = await post({ type: 'full-audit', url: 'https://example.fr/', options: {} });
    expect(response).toEqual({
      statusCode: 200,
      body: { started: false, refusal: 'host-busy' },
    });
  });
});
