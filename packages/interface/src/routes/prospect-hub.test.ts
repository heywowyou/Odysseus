import { Readable } from 'node:stream';
import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deletePreview } = vi.hoisted(() => ({ deletePreview: vi.fn() }));

vi.mock('@odysseus/store', () => ({
  addDirectoryEntriesToProspects: vi.fn(),
  appendProspectEvent: vi.fn(),
  attachAuditToProspect: vi.fn(),
  checkOutreachAction: vi.fn(),
  createProspectHub: vi.fn(),
  deleteProspect: vi.fn(),
  findProspectsByDomain: vi.fn(),
  findOutreachThreadByProspect: vi.fn(),
  getProspectHub: vi.fn(),
  listOutreachDrafts: vi.fn(),
  listOutreachPreviews: vi.fn(),
  listDirectory: vi.fn(),
  listProspectAudits: vi.fn(),
  listProspectEvents: vi.fn(),
  listProspectTodo: vi.fn(),
  listProspects: vi.fn(),
  loadProspectWork: vi.fn(),
  recordProspectOutcome: vi.fn(),
  setProspectStatus: vi.fn(),
  updateProspect: vi.fn(),
}));
vi.mock('../outreach/draft-runtime.js', () => ({
  createFirstEmailForProspect: vi.fn(),
  createFollowUpForProspect: vi.fn(),
}));
vi.mock('../outreach/configured-preview-publisher.js', () => ({
  createConfiguredPreviewPublisher: vi.fn(() => ({
    delete: deletePreview,
    get: vi.fn(),
    put: vi.fn(),
  })),
}));

import {
  checkOutreachAction,
  deleteProspect,
  findOutreachThreadByProspect,
  getProspectHub,
  listOutreachDrafts,
  listOutreachPreviews,
  listDirectory,
  listProspectAudits,
  listProspectEvents,
  listProspectTodo,
  loadProspectWork,
  listProspects,
  recordProspectOutcome,
  setProspectStatus,
  type ProspectTodoRow,
} from '@odysseus/store';
import { buildAuditDir } from '@odysseus/scanner';
import {
  createFirstEmailForProspect,
  createFollowUpForProspect,
} from '../outreach/draft-runtime.js';
import { Router } from '../router.js';
import { registerProspectHubRoutes } from './prospect-hub.js';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

function fakeReq(url: string, method: Method = 'GET', body?: unknown): IncomingMessage {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Readable.from(payload) as unknown as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers =
    body === undefined
      ? {}
      : { 'content-type': 'application/json', 'content-length': String(payload[0]?.length ?? 0) };
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
const emptyPage = {
  rows: [],
  page: 1,
  pageSize: 50,
  total: 0,
  statusCounts: {
    contacted: 0,
    'follow-up': 0,
    replied: 0,
    call: 0,
    quoted: 0,
    won: 0,
    lost: 0,
    'opted-out': 0,
  },
};

async function handle(url: string, method: Method = 'GET', body?: unknown) {
  const router = new Router();
  registerProspectHubRoutes(router, fakeConnection);
  const res = fakeRes();
  await router.handle(fakeReq(url, method, body), res);
  return { statusCode: res.statusCode, body: JSON.parse(res.body ?? '{}') as unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listProspects).mockResolvedValue(emptyPage as never);
  vi.mocked(listDirectory).mockResolvedValue(emptyPage as never);
  vi.mocked(setProspectStatus).mockResolvedValue({ status: 'audited' } as never);
  vi.mocked(recordProspectOutcome).mockResolvedValue({ status: 'replied' } as never);
  vi.mocked(deleteProspect).mockResolvedValue({ deleted: true } as never);
  vi.mocked(getProspectHub).mockResolvedValue({ prospectId: 'p-1' } as never);
  vi.mocked(checkOutreachAction).mockResolvedValue({ allowed: true } as never);
  vi.mocked(findOutreachThreadByProspect).mockResolvedValue(null);
  vi.mocked(listOutreachDrafts).mockResolvedValue([]);
  vi.mocked(listOutreachPreviews).mockResolvedValue([] as never);
  vi.mocked(listProspectAudits).mockResolvedValue([]);
  vi.mocked(listProspectEvents).mockResolvedValue([]);
  vi.mocked(loadProspectWork).mockResolvedValue([]);
  vi.mocked(createFirstEmailForProspect).mockResolvedValue({
    configured: true,
    created: true,
  });
  vi.mocked(createFollowUpForProspect).mockResolvedValue({
    configured: true,
    created: true,
  } as never);
  deletePreview.mockResolvedValue(undefined);
});

describe('prospect hub routes', () => {
  it('forwards the complete prospect filter set', async () => {
    const response = await handle(
      '/api/prospects?q=Paris&status=audited&sector=hotel&stars=4&groupStatus=group-member&websiteKind=vendor-hosted&department=75&commune=Paris&roomsMin=10&roomsMax=50&hasScan=true&inactive=false&page=2&pageSize=20',
    );

    expect(response.statusCode).toBe(200);
    expect(listProspects).toHaveBeenCalledWith(fakeConnection, {
      q: 'Paris',
      view: 'all',
      status: 'audited',
      sector: 'hotel',
      stars: 4,
      groupStatus: 'group-member',
      websiteKind: 'vendor-hosted',
      department: '75',
      commune: 'Paris',
      roomsMin: 10,
      roomsMax: 50,
      hasScan: true,
      inactive: false,
      page: 2,
      pageSize: 20,
    });
  });

  it('routes the results view through the prospects endpoint', async () => {
    const response = await handle('/api/prospects?view=results&status=won&page=2');

    expect(response.statusCode).toBe(200);
    expect(listProspects).toHaveBeenCalledWith(fakeConnection, {
      q: undefined,
      view: 'results',
      status: 'won',
      sector: undefined,
      stars: undefined,
      groupStatus: undefined,
      websiteKind: undefined,
      department: undefined,
      commune: undefined,
      roomsMin: undefined,
      roomsMax: undefined,
      hasScan: undefined,
      inactive: undefined,
      page: 2,
      pageSize: undefined,
    });
  });

  it('rejects an unknown prospect view', async () => {
    const response = await handle('/api/prospects?view=archive');

    expect(response.statusCode).toBe(400);
    expect(listProspects).toHaveBeenCalledTimes(0);
  });

  it('serves the shared work rows consumed by both To do and the shell badge', async () => {
    const rows: ProspectTodoRow[] = [
      {
        kind: 'first-email',
        subject: 'ARK Hôtel',
        action: 'create-first-email',
        prospectId: 'p-1',
        href: '/prospects/p-1#emails',
        since: '2026-09-15T00:00:00.000Z',
      },
    ];
    vi.mocked(listProspectTodo).mockResolvedValue(rows);

    const response = await handle('/api/prospect-hub/todo');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ rows });
    expect(listProspectTodo).toHaveBeenCalledWith(fakeConnection);
  });

  it('forwards directory facets and rejects invalid status values', async () => {
    const directory = await handle(
      '/api/directory?sector=hotel&stars=3&groupStatus=independent&websiteKind=own&department=13&commune=Aix&postcode=13100&roomsMin=5&roomsMax=25',
    );
    expect(directory.statusCode).toBe(200);
    expect(listDirectory).toHaveBeenCalledWith(fakeConnection, {
      q: undefined,
      sector: 'hotel',
      stars: 3,
      groupStatus: 'independent',
      websiteKind: 'own',
      department: '13',
      commune: 'Aix',
      roomsMin: 5,
      roomsMax: 25,
      hasScan: undefined,
      inactive: undefined,
      page: undefined,
      pageSize: undefined,
      postcode: '13100',
    });

    const invalid = await handle('/api/prospects?status=banana');
    expect(invalid.statusCode).toBe(400);
    expect(listProspects).toHaveBeenCalledTimes(0);

    const invalidBoolean = await handle('/api/prospects?hasScan=maybe');
    expect(invalidBoolean.statusCode).toBe(400);
    expect(listProspects).toHaveBeenCalledTimes(0);
  });

  it('routes explicit status, outcome, and deletion actions', async () => {
    const status = await handle('/api/prospects/p-1/status', 'PATCH', { status: 'audited' });
    expect(status.statusCode).toBe(200);
    expect(setProspectStatus).toHaveBeenCalledWith(fakeConnection, 'p-1', 'audited');

    const outcome = await handle('/api/prospects/p-1/outcome', 'POST', {
      outcome: 'reply-positive',
    });
    expect(outcome.statusCode).toBe(200);
    expect(recordProspectOutcome).toHaveBeenCalledWith(fakeConnection, 'p-1', 'reply-positive');

    const deleted = await handle('/api/prospects/p-1', 'DELETE');
    expect(deleted.statusCode).toBe(200);
    expect(deleteProspect).toHaveBeenCalledWith(fakeConnection, 'p-1');
  });

  it('removes audit artifacts and live preview objects before the cascade', async () => {
    const artifactsRoot = await fs.mkdtemp(join(tmpdir(), 'odysseus-prospect-delete-'));
    const startedAt = new Date('2026-09-15T10:20:30.000Z');
    const auditDir = buildAuditDir(artifactsRoot, 'example.fr', startedAt);
    await fs.mkdir(auditDir, { recursive: true });
    await fs.writeFile(join(auditDir, 'report.html'), 'report');
    const previousArtifactsRoot = process.env['ODYSSEUS_ARTIFACTS_ROOT'];
    process.env['ODYSSEUS_ARTIFACTS_ROOT'] = artifactsRoot;
    vi.mocked(listProspectAudits).mockResolvedValue([
      {
        auditId: 'audit-1',
        siteUrl: 'https://example.fr/',
        kind: 'audit',
        startedAt,
        finishedAt: new Date('2026-09-15T10:25:30.000Z'),
      },
    ]);
    vi.mocked(listOutreachPreviews).mockResolvedValue([
      { objectKey: 'example.fr/preview.html', status: 'live' },
    ] as never);

    try {
      const response = await handle('/api/prospects/p-1', 'DELETE');

      expect(response.statusCode).toBe(200);
      await expect(fs.access(auditDir)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(deletePreview).toHaveBeenCalledWith('example.fr/preview.html');
      expect(deleteProspect).toHaveBeenCalledWith(fakeConnection, 'p-1');
      expect(deletePreview.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(deleteProspect).mock.invocationCallOrder[0]!,
      );
    } finally {
      if (previousArtifactsRoot === undefined) delete process.env['ODYSSEUS_ARTIFACTS_ROOT'];
      else process.env['ODYSSEUS_ARTIFACTS_ROOT'] = previousArtifactsRoot;
      await fs.rm(artifactsRoot, { recursive: true, force: true });
    }
  });

  it('returns central outreach actionability and rejects unknown actions', async () => {
    const response = await handle('/api/prospects/p-1/actionability?action=first-email');
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ state: 'available' });
    expect(checkOutreachAction).toHaveBeenCalledWith(fakeConnection, {
      prospect: { prospectId: 'p-1' },
      action: 'first-email',
    });

    const invalid = await handle('/api/prospects/p-1/actionability?action=qualify');
    expect(invalid.statusCode).toBe(400);
  });

  it('keeps prospect-native first-email and follow-up actions behind the central guard', async () => {
    const first = await handle('/api/prospects/p-1/outreach/first-email', 'POST', {
      language: 'en',
    });
    expect(first.statusCode).toBe(200);
    expect(createFirstEmailForProspect).toHaveBeenCalledWith(fakeConnection, 'p-1', {
      language: 'en',
    });

    vi.mocked(checkOutreachAction).mockResolvedValueOnce({
      allowed: false,
      refusal: 'suppressed',
    });
    const follow = await handle('/api/prospects/p-1/outreach/follow-up', 'POST');
    expect(follow.statusCode).toBe(200);
    expect(follow.body).toEqual({ created: false, refusal: 'suppressed' });
    expect(createFollowUpForProspect).not.toHaveBeenCalled();
  });
});
