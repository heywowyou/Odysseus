import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odysseus/store')>()),
  checkScanLaunch: vi.fn(),
  createJob: vi.fn(),
  findProspectsByDomain: vi.fn(),
  getJob: vi.fn(),
  requestJobCancellation: vi.fn(),
  getProspectHub: vi.fn(),
  getAudit: vi.fn(),
  deleteAuditCascade: vi.fn(),
  deleteJob: vi.fn(),
  readScanQueue: vi.fn(),
  reorderScanQueue: vi.fn(),
  getProspectNames: vi.fn(async () => new Map()),
  listJobs: vi.fn(async () => []),
  findAuditsWithUnreadyReports: vi.fn(async () => new Set<string>()),
  getSeverityRollups: vi.fn(async () => new Map()),
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
  findAuditsWithUnreadyReports,
  findProspectsByDomain,
  getAudit,
  getJob,
  getProspectHub,
  listJobs,
  readScanQueue,
  reorderScanQueue,
  requestJobCancellation,
  type NewJobInput,
} from '@odysseus/store';
import { CrawlCoverageInsufficientError } from '@odysseus/core';
import { cancelJobCapability, deleteJobCapability } from '../operator/job-capabilities.js';
import {
  releaseReportProduction,
  tryAcquireReportProduction,
} from '../pipeline/report-production-lock.js';
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
const fakeQueue = {
  notify: vi.fn(),
  requestCancel: vi.fn(),
  isJobInFlight: vi.fn(() => false),
} as never;

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

async function get(path: string): Promise<{ statusCode: number; body: unknown }> {
  const router = new Router();
  registerScanRoutes(router, fakeConnection, fakeQueue);
  const req = Readable.from([]) as unknown as IncomingMessage;
  req.method = 'GET';
  req.url = path;
  req.headers = {};
  const res = fakeRes();
  await router.handle(req, res);
  return { statusCode: res.statusCode, body: JSON.parse(res.body ?? '{}') as unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkScanLaunch).mockResolvedValue({
    allowed: true,
    registrableDomain: 'example.fr',
  });
  vi.mocked(findProspectsByDomain).mockResolvedValue([{ prospectId: 'prospect-1' }] as never);
  vi.mocked(getProspectHub).mockResolvedValue({ prospectId: 'prospect-1' } as never);
  vi.mocked(requestJobCancellation).mockResolvedValue('cancel-requested');
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

function cancelToken(job: { jobId: string; type: string; status: string }): string {
  return cancelJobCapability({
    job: job as never,
    inFlight: false,
    reportProductionInFlight: false,
  }).stateToken;
}

describe('POST /api/scans/:jobId/cancel', () => {
  it('persists a running stop request before signalling the local worker', async () => {
    vi.mocked(getJob).mockResolvedValue({
      jobId: 'job-1',
      type: 'full-audit',
      status: 'running',
    } as never);
    vi.mocked(requestJobCancellation).mockResolvedValueOnce('cancel-requested');

    const response = await post(
      { stateToken: cancelToken({ jobId: 'job-1', type: 'full-audit', status: 'running' }) },
      '/api/scans/job-1/cancel',
    );

    expect(response).toEqual({
      statusCode: 200,
      body: { jobId: 'job-1', status: 'cancel-requested' },
    });
    expect(requestJobCancellation).toHaveBeenCalledWith(
      fakeConnection,
      'job-1',
      'cancelled by operator',
    );
    expect(
      vi.mocked(fakeQueue as unknown as { requestCancel: (jobId: string) => void }).requestCancel,
    ).toHaveBeenCalledWith('job-1');
  });

  it('cancels queued work without registering an in-process worker signal', async () => {
    vi.mocked(getJob).mockResolvedValue({
      jobId: 'job-queued',
      type: 'full-audit',
      status: 'queued',
    } as never);
    vi.mocked(requestJobCancellation).mockResolvedValueOnce('cancelled');

    const response = await post(
      { stateToken: cancelToken({ jobId: 'job-queued', type: 'full-audit', status: 'queued' }) },
      '/api/scans/job-queued/cancel',
    );

    expect(response).toEqual({
      statusCode: 200,
      body: { jobId: 'job-queued', status: 'cancelled' },
    });
    expect(
      vi.mocked(fakeQueue as unknown as { requestCancel: (jobId: string) => void }).requestCancel,
    ).not.toHaveBeenCalled();
  });

  it('returns a conflict when the durable state became terminal first', async () => {
    vi.mocked(getJob).mockResolvedValue({
      jobId: 'job-1',
      type: 'full-audit',
      status: 'running',
    } as never);
    vi.mocked(requestJobCancellation).mockResolvedValueOnce('not-cancellable');

    const response = await post(
      { stateToken: cancelToken({ jobId: 'job-1', type: 'full-audit', status: 'running' }) },
      '/api/scans/job-1/cancel',
    );

    expect(response).toMatchObject({
      statusCode: 409,
      body: { error: { code: 'state-changed' } },
    });
  });

  it('refuses a stop computed from a state that has since changed', async () => {
    // The page rendered the job as queued ("remove from queue"); the worker
    // claimed it meanwhile, so the consequence of the click changed.
    vi.mocked(getJob).mockResolvedValue({
      jobId: 'job-1',
      type: 'full-audit',
      status: 'running',
    } as never);

    const response = await post(
      { stateToken: cancelToken({ jobId: 'job-1', type: 'full-audit', status: 'queued' }) },
      '/api/scans/job-1/cancel',
    );

    expect(response).toMatchObject({
      statusCode: 409,
      body: { error: { code: 'state-changed', retryable: true } },
    });
    expect(requestJobCancellation).not.toHaveBeenCalled();
  });

  it('refuses a stop without a state token', async () => {
    vi.mocked(getJob).mockResolvedValue({
      jobId: 'job-1',
      type: 'full-audit',
      status: 'running',
    } as never);
    const response = await post({}, '/api/scans/job-1/cancel');
    expect(response).toMatchObject({
      statusCode: 400,
      body: { error: { code: 'invalid-request' } },
    });
    expect(requestJobCancellation).not.toHaveBeenCalled();
  });

  it('answers a typed blocked problem for a stop already requested', async () => {
    const job = { jobId: 'job-1', type: 'full-audit', status: 'cancel-requested' };
    vi.mocked(getJob).mockResolvedValue(job as never);
    const response = await post({ stateToken: cancelToken(job) }, '/api/scans/job-1/cancel');
    expect(response).toMatchObject({
      statusCode: 409,
      body: { error: { code: 'action-blocked', reasonCode: 'cancel-already-requested' } },
    });
  });

  it('answers a typed not-found problem', async () => {
    vi.mocked(getJob).mockResolvedValue(null);
    const response = await post({ stateToken: 'x' }, '/api/scans/missing/cancel');
    expect(response).toMatchObject({ statusCode: 404, body: { error: { code: 'not-found' } } });
  });
});

describe('scan queue routes', () => {
  const queuedRow = (jobId: string, prospectId?: string) => ({
    jobId,
    type: 'full-audit',
    siteUrl: `https://${jobId}.example/`,
    createdAt: new Date('2026-09-18T10:00:00Z'),
    options: prospectId === undefined ? { maxDepth: 2 } : { prospectId },
    queueOrder: 1,
  });

  async function get(path: string): Promise<{ statusCode: number; body: unknown }> {
    const router = new Router();
    registerScanRoutes(router, fakeConnection, fakeQueue);
    const req = Readable.from([]) as unknown as IncomingMessage;
    req.method = 'GET';
    req.url = path;
    req.headers = {};
    const res = fakeRes();
    await router.handle(req, res);
    return { statusCode: res.statusCode, body: JSON.parse(res.body ?? '{}') as unknown };
  }

  it('lists waiting scans in durable order with the revision and a remove capability', async () => {
    vi.mocked(readScanQueue).mockResolvedValue({
      queueRevision: 'rev-1',
      truncated: false,
      jobs: [queuedRow('b'), queuedRow('a', 'prospect-1')] as never,
    });
    const response = await get('/api/scans/queue');
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      queueRevision: 'rev-1',
      truncated: false,
      jobs: [
        {
          jobId: 'b',
          position: 1,
          options: ['depth-limit'],
          cancel: { state: 'available', consequenceCode: 'removes-from-queue' },
        },
        { jobId: 'a', position: 2, prospectId: 'prospect-1', options: [] },
      ],
    });
  });

  it('applies a reorder and returns the new revision', async () => {
    vi.mocked(reorderScanQueue).mockResolvedValue({
      outcome: 'reordered',
      snapshot: {
        queueRevision: 'rev-2',
        truncated: false,
        jobs: [queuedRow('a'), queuedRow('b')],
      },
    } as never);
    const response = await post(
      { queueRevision: 'rev-1', orderedJobIds: ['a', 'b'] },
      '/api/scans/queue/reorder',
    );
    expect(response).toEqual({
      statusCode: 200,
      body: { queueRevision: 'rev-2', orderedJobIds: ['a', 'b'] },
    });
    expect(reorderScanQueue).toHaveBeenCalledWith(fakeConnection, {
      expectedRevision: 'rev-1',
      orderedJobIds: ['a', 'b'],
    });
  });

  it('answers a stale reorder with a typed state-changed problem', async () => {
    vi.mocked(reorderScanQueue).mockResolvedValue({
      outcome: 'state-changed',
      snapshot: { queueRevision: 'rev-3', truncated: false, jobs: [] },
    } as never);
    const response = await post(
      { queueRevision: 'rev-1', orderedJobIds: ['a'] },
      '/api/scans/queue/reorder',
    );
    expect(response).toMatchObject({ statusCode: 409, body: { error: { code: 'state-changed' } } });
  });

  it('refuses a malformed reorder before touching the queue', async () => {
    const response = await post({ orderedJobIds: 'a' }, '/api/scans/queue/reorder');
    expect(response).toMatchObject({
      statusCode: 400,
      body: { error: { code: 'invalid-request' } },
    });
    expect(reorderScanQueue).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/scans/:jobId', () => {
  async function remove(
    inFlight: boolean,
    audit: unknown = null,
    status = 'cancelled',
    options: { tokenFrom?: { status: string; inFlight: boolean } } = {},
  ): Promise<number> {
    const job = { jobId: 'job-1', type: 'full-audit', status, auditId: 'audit-1' };
    vi.mocked(getJob).mockResolvedValue(job as never);
    vi.mocked(getAudit).mockResolvedValue(audit as never);
    const seen = options.tokenFrom ?? { status, inFlight };
    const stateToken = deleteJobCapability({
      job: { ...job, status: seen.status } as never,
      inFlight: seen.inFlight,
      reportProductionInFlight: false,
    }).stateToken;
    const queue = { notify: vi.fn(), isJobInFlight: vi.fn().mockReturnValue(inFlight) } as never;
    const router = new Router();
    registerScanRoutes(router, fakeConnection, queue);
    const req = Readable.from([]) as unknown as IncomingMessage;
    req.method = 'DELETE';
    req.url = `/api/scans/job-1?stateToken=${encodeURIComponent(stateToken)}`;
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

  it('refuses a delete rendered before the job changed state', async () => {
    expect(
      await remove(false, null, 'cancelled', {
        tokenFrom: { status: 'cancelled', inFlight: true },
      }),
    ).toBe(409);
    expect(deleteJob).not.toHaveBeenCalled();
  });

  it('deletes a stopped job once its pipeline has let go', async () => {
    vi.mocked(deleteJob).mockResolvedValue(true as never);
    expect(await remove(false)).toBe(200);
    expect(deleteAuditCascade).toHaveBeenCalledWith(fakeConnection, 'audit-1');
    expect(deleteJob).toHaveBeenCalled();
  });

  it('refuses a queued job the worker claimed before the delete landed', async () => {
    vi.mocked(deleteJob).mockResolvedValue(false as never);
    expect(await remove(false, null, 'queued')).toBe(409);
    expect(deleteJob).toHaveBeenCalledWith(fakeConnection, 'job-1', {
      onlyIfStatusNot: ['running'],
    });
    expect(deleteAuditCascade).not.toHaveBeenCalled();
  });

  it('deletes a still-queued job without touching any audit', async () => {
    vi.mocked(deleteJob).mockResolvedValue(true as never);
    expect(await remove(false, null, 'queued')).toBe(200);
    expect(deleteAuditCascade).not.toHaveBeenCalled();
    expect(getAudit).not.toHaveBeenCalled();
  });

  const storedAudit = {
    auditId: 'audit-1',
    siteUrl: 'https://hotel.example/',
    startedAt: new Date('2026-09-16T10:00:00Z'),
  };

  it("refuses while a report is being produced for the job's audit", async () => {
    expect(tryAcquireReportProduction('audit-1', 'report-ready')).toBe(true);
    try {
      expect(await remove(false, storedAudit)).toBe(409);
      expect(artifactStore.list).not.toHaveBeenCalled();
      expect(deleteAuditCascade).not.toHaveBeenCalled();
    } finally {
      releaseReportProduction('audit-1', 'report-ready');
    }
  });

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

describe('POST /api/scans prospect availability', () => {
  it('refuses a scan for an archived prospect', async () => {
    vi.mocked(getProspectHub).mockResolvedValue({
      prospectId: 'p-archived',
      archivedAt: new Date(),
    } as never);
    const response = await post({
      type: 'full-audit',
      url: 'https://example.fr/',
      prospectId: 'p-archived',
    });
    expect(response.body).toEqual({ started: false, refusal: 'prospect-unavailable' });
    expect(createJob).not.toHaveBeenCalled();
  });

  it('refuses a scan for a prospect that does not exist', async () => {
    vi.mocked(getProspectHub).mockResolvedValue(null);
    const response = await post({
      type: 'full-audit',
      url: 'https://example.fr/',
      prospectId: 'p-missing',
    });
    expect(response.body).toEqual({ started: false, refusal: 'prospect-unavailable' });
    expect(createJob).not.toHaveBeenCalled();
  });

  it('auto-attaches the one active prospect when an archived one shares the domain', async () => {
    vi.mocked(findProspectsByDomain).mockResolvedValue([
      { prospectId: 'p-active' },
      { prospectId: 'p-old', archivedAt: new Date() },
    ] as never);
    vi.mocked(getProspectHub).mockResolvedValue({ prospectId: 'p-active' } as never);
    await post({ type: 'full-audit', url: 'https://example.fr/' });
    expect(vi.mocked(createJob).mock.calls[0]?.[1].options?.prospectId).toBe('p-active');
  });

  it('never auto-attaches an archived prospect', async () => {
    vi.mocked(findProspectsByDomain).mockResolvedValue([
      { prospectId: 'p-old', archivedAt: new Date() },
    ] as never);
    const response = await post({ type: 'full-audit', url: 'https://example.fr/' });
    expect(response.statusCode).toBe(201);
    expect(createJob).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createJob).mock.calls[0]?.[1].options).not.toHaveProperty('prospectId');
  });

  it('rejects only the batch site whose prospect is archived', async () => {
    vi.mocked(getProspectHub).mockImplementation(
      async (_connection, prospectId) =>
        (prospectId === 'p-b' ? { prospectId, archivedAt: new Date() } : { prospectId }) as never,
    );
    const response = await post(
      {
        type: 'full-audit',
        items: [
          { prospectId: 'p-a', url: 'https://a.fr/' },
          { prospectId: 'p-b', url: 'https://b.fr/' },
        ],
      },
      '/api/scans/batch',
    );
    expect(response.body).toMatchObject({
      queued: 1,
      rejected: 1,
      results: [
        { index: 0, outcome: 'queued' },
        { index: 1, outcome: 'rejected', reason: 'prospect-unavailable' },
      ],
    });
  });
});

describe('POST /api/scans launch race', () => {
  it('refuses as host-busy when a concurrent launch took the prospect slot first', async () => {
    vi.mocked(createJob).mockRejectedValueOnce(new ActiveJobSlotTakenError('job-other'));
    const response = await post({ type: 'full-audit', url: 'https://example.fr/', options: {} });
    expect(response).toEqual({
      statusCode: 200,
      body: { started: false, refusal: 'host-busy', conflictingJobId: 'job-other' },
    });
  });

  it('names the job holding the site when the launch guard refuses as host-busy', async () => {
    vi.mocked(checkScanLaunch).mockResolvedValueOnce({
      allowed: false,
      refusal: 'host-busy',
      conflictingJobId: 'job-running',
    });
    const response = await post({ type: 'full-audit', url: 'https://example.fr/', options: {} });
    expect(response.body).toEqual({
      started: false,
      refusal: 'host-busy',
      conflictingJobId: 'job-running',
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

/** A lean job row shaped like store's listJobs projection. Optional fields
 *  are spread in so an absent field stays absent on the wire. */
function summaryRow(
  overrides: Partial<{
    jobId: string;
    type: string;
    status: string;
    phase: string;
    auditId: string;
    failedPhase: string;
    awaitsInput: boolean;
  }> = {},
): Record<string, unknown> {
  return {
    jobId: 'job-1',
    type: 'full-audit',
    status: 'queued',
    phase: 'queued',
    createdAt: new Date('2026-09-18T10:00:00Z'),
    ...(overrides.jobId !== undefined ? { jobId: overrides.jobId } : {}),
    ...(overrides.type !== undefined ? { type: overrides.type } : {}),
    ...(overrides.status !== undefined ? { status: overrides.status } : {}),
    ...(overrides.phase !== undefined ? { phase: overrides.phase } : {}),
    ...(overrides.auditId !== undefined ? { auditId: overrides.auditId } : {}),
    ...(overrides.failedPhase !== undefined ? { failedPhase: overrides.failedPhase } : {}),
    ...(overrides.awaitsInput !== undefined ? { awaitsInput: overrides.awaitsInput } : {}),
  };
}

describe('GET /api/scans declares the display outcome code (plan 060 §5.3)', () => {
  it.each([
    {
      name: 'running scans keep their run-state code',
      row: summaryRow({ jobId: 'job-run', status: 'running', phase: 'crawl' }),
      outcomeCode: 'running',
    },
    {
      name: 'a plain failed scan stays failed',
      row: summaryRow({
        jobId: 'job-crawl',
        status: 'failed',
        phase: 'failed',
        failedPhase: 'crawl',
      }),
      outcomeCode: 'failed',
    },
    {
      name: 'a failed job in a report phase is a report issue, not a failed scan (issue #386)',
      row: summaryRow({
        jobId: 'job-pdf',
        status: 'failed',
        phase: 'failed',
        failedPhase: 'report-fr',
        auditId: 'audit-1',
      }),
      outcomeCode: 'report-issue',
    },
    {
      name: 'a failed job in a writing phase is a report issue too',
      row: summaryRow({
        jobId: 'job-writing',
        status: 'failed',
        phase: 'failed',
        failedPhase: 'analyze-en',
        auditId: 'audit-2',
      }),
      outcomeCode: 'report-issue',
    },
    {
      name: 'a legacy failed full-audit row with a saved audit is a report issue',
      row: summaryRow({
        jobId: 'job-legacy',
        status: 'failed',
        phase: 'failed',
        auditId: 'audit-3',
      }),
      outcomeCode: 'report-issue',
    },
    {
      name: 'a failed job carrying typed input fields needs input, not debugging (issue #382)',
      row: summaryRow({
        jobId: 'job-input',
        status: 'failed',
        phase: 'failed',
        awaitsInput: true,
        auditId: 'audit-4',
      }),
      outcomeCode: 'needs-input',
    },
  ])('$name', async ({ row, outcomeCode }) => {
    vi.mocked(listJobs).mockResolvedValue([row] as never);
    const response = await get('/api/scans');
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject([{ jobId: row.jobId, outcomeCode }]);
  });

  it('marks a complete scan whose reports are no longer ready as a report issue (issue #389)', async () => {
    vi.mocked(listJobs).mockResolvedValue([
      summaryRow({ jobId: 'job-done', status: 'complete', phase: 'complete', auditId: 'audit-9' }),
    ] as never);
    vi.mocked(findAuditsWithUnreadyReports).mockResolvedValue(new Set(['audit-9']));
    const response = await get('/api/scans');
    expect(response.body).toMatchObject([
      { jobId: 'job-done', reportNotReady: true, outcomeCode: 'report-issue' },
    ]);
  });

  it('leaves a complete scan with ready reports at complete', async () => {
    vi.mocked(listJobs).mockResolvedValue([
      summaryRow({ jobId: 'job-done', status: 'complete', phase: 'complete', auditId: 'audit-9' }),
    ] as never);
    vi.mocked(findAuditsWithUnreadyReports).mockResolvedValue(new Set());
    const response = await get('/api/scans');
    const rows = response.body as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ jobId: 'job-done', outcomeCode: 'complete' });
    expect(rows[0]).not.toHaveProperty('reportNotReady');
  });
});

describe('GET /api/scans keeps internal outreach batches out of scan history', () => {
  it('filters the durable query before projecting rows', async () => {
    vi.mocked(listJobs).mockResolvedValue([
      summaryRow({ jobId: 'internal', type: 'outreach-draft-batch' }),
      summaryRow({ jobId: 'scan', type: 'full-audit' }),
    ] as never);

    const response = await get('/api/scans');

    expect(response.statusCode).toBe(200);
    expect((response.body as { jobId: string }[]).map((row) => row.jobId)).toEqual(['scan']);
    const queryOptions = vi.mocked(listJobs).mock.calls[0]?.[2] as { types?: string[] };
    expect(queryOptions.types).toEqual(
      expect.arrayContaining(['full-audit', 'quick-check', 'prospecting']),
    );
    expect(queryOptions.types).not.toContain('outreach-draft-batch');
  });
});

describe('GET /api/scans/:jobId declares the display outcome codes (plan 060 §5.3)', () => {
  const detailJob = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    jobId: 'job-1',
    type: 'full-audit',
    status: 'failed',
    phase: 'failed',
    createdAt: new Date('2026-09-18T10:00:00Z'),
    progress: {},
    options: {},
    ...overrides,
  });

  it('declares the coverage gate structurally instead of the browser parsing the sentence (issue #187)', async () => {
    const gateError = new CrawlCoverageInsufficientError({
      inventoriedUrlCount: 10,
      failedUrlCount: 8,
      failureShare: 0.8,
      failedHttpStatusCounts: new Map([[503, 8]]),
      reasonCodes: ['crawl-failure-share'],
    });
    vi.mocked(getJob).mockResolvedValue(detailJob({ error: gateError.message }) as never);
    const response = await get('/api/scans/job-1');
    expect(response.body).toMatchObject({
      outcomeCode: 'failed',
      reportFailureStage: null,
      coverageGateBlocked: true,
    });
  });

  it('declares a report-stage failure with its stage for the failure card', async () => {
    vi.mocked(getJob).mockResolvedValue(
      detailJob({ failedPhase: 'report-en', auditId: 'audit-1' }) as never,
    );
    const response = await get('/api/scans/job-1');
    expect(response.body).toMatchObject({
      outcomeCode: 'report-issue',
      reportFailureStage: 'pdf',
      coverageGateBlocked: false,
    });
  });

  it('declares the legacy saved-audit failure as an unknown report stage', async () => {
    vi.mocked(getJob).mockResolvedValue(detailJob({ auditId: 'audit-1' }) as never);
    const response = await get('/api/scans/job-1');
    expect(response.body).toMatchObject({
      outcomeCode: 'report-issue',
      reportFailureStage: 'unknown',
    });
  });

  it('reads a failed row with typed input fields as needing input, like the list', async () => {
    vi.mocked(getJob).mockResolvedValue(
      detailJob({
        needsInputFields: [{ field: 'nomCommercial', value: 'Le Grand Hôtel' }],
      }) as never,
    );
    const response = await get('/api/scans/job-1');
    expect(response.body).toMatchObject({ outcomeCode: 'needs-input', reportFailureStage: null });
  });
});
