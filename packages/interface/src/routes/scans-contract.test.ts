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

const { artifactStore } = vi.hoisted(() => ({
  artifactStore: {
    get: vi.fn(),
    put: vi.fn(),
    list: vi.fn(async (): Promise<string[]> => []),
    delete: vi.fn(),
  },
}));
vi.mock('../artifacts/configured-artifact-store.js', () => ({
  createConfiguredArtifactStore: vi.fn(() => artifactStore),
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
import { MAX_SCAN_BATCH_SIZE, registerScanRoutes } from './scans.js';

function fakeReq(body: unknown, path = '/api/scans'): IncomingMessage {
  const payload = Buffer.from(JSON.stringify(body));
  const req = Readable.from([payload]) as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = path;
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

async function post(
  body: unknown,
  path = '/api/scans',
): Promise<{ statusCode: number; body: unknown }> {
  const router = new Router();
  registerScanRoutes(router, fakeConnection, fakeQueue);
  const res = fakeRes();
  await router.handle(fakeReq(body, path), res);
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
  async function remove(inFlight: boolean, audit: unknown = null): Promise<number> {
    vi.mocked(getJob).mockResolvedValue({
      jobId: 'job-1',
      status: 'cancelled',
      auditId: 'audit-1',
    } as never);
    vi.mocked(getAudit).mockResolvedValue(audit as never);
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

  const storedAudit = {
    auditId: 'audit-1',
    siteUrl: 'https://hotel.example/',
    startedAt: new Date('2026-09-16T10:00:00Z'),
  };

  it('removes the audit bucket objects before its records (issue #384)', async () => {
    vi.mocked(deleteJob).mockResolvedValue(true as never);
    artifactStore.list
      .mockResolvedValueOnce(['hotel.example/2026-09-16T10-00-00Z/manifest.json'])
      .mockResolvedValueOnce([]);
    expect(await remove(false, storedAudit)).toBe(200);
    expect(artifactStore.list).toHaveBeenCalledWith('hotel.example/2026-09-16T10-00-00Z/');
    expect(artifactStore.delete).toHaveBeenCalledWith(
      'hotel.example/2026-09-16T10-00-00Z/manifest.json',
    );
    expect(deleteAuditCascade).toHaveBeenCalled();
  });

  it('keeps the records and answers 503 when bucket cleanup fails (issue #384)', async () => {
    artifactStore.list.mockRejectedValueOnce(new Error('provider down'));
    expect(await remove(false, storedAudit)).toBe(503);
    expect(deleteAuditCascade).not.toHaveBeenCalled();
    expect(deleteJob).not.toHaveBeenCalled();
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

describe('POST /api/scans/batch', () => {
  const postBatch = (body: unknown) => post(body, '/api/scans/batch');
  const site = (name: string) => ({ prospectId: `p-${name}`, url: `https://${name}.fr/` });

  beforeEach(() => {
    let created = 0;
    vi.mocked(createJob).mockImplementation(
      async (_connection, input: NewJobInput) => ({ ...input, jobId: `job-${++created}` }) as never,
    );
  });

  it.each([
    ['an unknown type', { type: 'prospecting', items: [site('a')] }],
    ['a retired type', { type: 'prospecting-audit', items: [site('a')] }],
    ['no items', { type: 'full-audit', items: [] }],
    [
      'too many items',
      {
        type: 'full-audit',
        items: Array.from({ length: MAX_SCAN_BATCH_SIZE + 1 }, (_, i) => site(`s${i}`)),
      },
    ],
    ['an item that is not an object', { type: 'full-audit', items: [site('a'), 'b.fr'] }],
    [
      'a blank prospectId',
      { type: 'full-audit', items: [{ url: 'https://a.fr/', prospectId: ' ' }] },
    ],
    ['a per-site option', { type: 'full-audit', items: [site('a')], options: { siren: '' } }],
    ['a zero page limit', { type: 'full-audit', items: [site('a')], options: { maxPages: 0 } }],
  ])('refuses %s before creating any job', async (_name, body) => {
    const response = await postBatch(body);
    expect(response.statusCode).toBe(400);
    expect(createJob).not.toHaveBeenCalled();
    expect(checkScanLaunch).not.toHaveBeenCalled();
  });

  it('creates one ordinary job per site, in submission order, with the shared options', async () => {
    const response = await postBatch({
      type: 'full-audit',
      items: [site('c'), site('a'), site('b')],
      options: { maxPages: 200, delayMs: 2000 },
    });

    expect(response.statusCode).toBe(200);
    expect(vi.mocked(createJob).mock.calls.map(([, input]) => input)).toEqual(
      ['c', 'a', 'b'].map((name) => ({
        type: 'full-audit',
        siteUrl: `https://${name}.fr/`,
        options: { maxPages: 200, delayMs: 2000, prospectId: `p-${name}` },
      })),
    );
    expect(response.body).toEqual({
      type: 'full-audit',
      queued: 3,
      skipped: 0,
      rejected: 0,
      results: [
        { index: 0, ...site('c'), outcome: 'queued', jobId: 'job-1' },
        { index: 1, ...site('a'), outcome: 'queued', jobId: 'job-2' },
        { index: 2, ...site('b'), outcome: 'queued', jobId: 'job-3' },
      ],
    });
    expect(vi.mocked(fakeQueue as { notify: () => void }).notify).toHaveBeenCalledTimes(1);
  });

  it('pins a Quick check batch to one page per site', async () => {
    await postBatch({ type: 'quick-check', items: [site('a')], options: { maxPages: 30 } });
    expect(createJob).toHaveBeenCalledWith(fakeConnection, {
      type: 'quick-check',
      siteUrl: 'https://a.fr/',
      options: { maxPages: 1, prospectId: 'p-a' },
    });
  });

  it('skips sites with an active scan and rejects invalid or suppressed ones, reporting each', async () => {
    vi.mocked(checkScanLaunch).mockImplementation(async (_connection, input) =>
      input.url === 'https://busy.fr/'
        ? { allowed: false, refusal: 'host-busy' }
        : input.url === 'https://objected.fr/'
          ? { allowed: false, refusal: 'suppressed' }
          : { allowed: true, registrableDomain: 'x.fr' },
    );
    vi.mocked(createJob).mockImplementation(async (_connection, input: NewJobInput) => {
      if (input.siteUrl === 'https://raced.fr/') throw new ActiveJobSlotTakenError('job-other');
      return { ...input, jobId: 'job-ok' } as never;
    });

    const response = await postBatch({
      type: 'full-audit',
      items: [
        site('busy'),
        { url: 'not a url', prospectId: 'p-bad' },
        site('objected'),
        site('raced'),
        site('ok'),
      ],
    });

    expect(response.body).toEqual({
      type: 'full-audit',
      queued: 1,
      skipped: 2,
      rejected: 2,
      results: [
        { index: 0, ...site('busy'), outcome: 'skipped', reason: 'already-active' },
        {
          index: 1,
          url: 'not a url',
          prospectId: 'p-bad',
          outcome: 'rejected',
          reason: 'invalid-url',
        },
        { index: 2, ...site('objected'), outcome: 'rejected', reason: 'suppressed' },
        { index: 3, ...site('raced'), outcome: 'skipped', reason: 'already-active' },
        { index: 4, ...site('ok'), outcome: 'queued', jobId: 'job-ok' },
      ],
    });
  });

  it('does not wake the queue when nothing was queued', async () => {
    vi.mocked(checkScanLaunch).mockResolvedValue({ allowed: false, refusal: 'host-busy' });
    const response = await postBatch({ type: 'full-audit', items: [site('a')] });
    expect(response.body).toMatchObject({ queued: 0, skipped: 1 });
    expect(vi.mocked(fakeQueue as { notify: () => void }).notify).not.toHaveBeenCalled();
  });
});
