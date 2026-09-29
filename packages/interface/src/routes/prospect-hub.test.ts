import { Readable } from 'node:stream';
import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deletePreview } = vi.hoisted(() => ({ deletePreview: vi.fn() }));

vi.mock('@odysseus/store', async (importOriginal) => ({
  isEditableProspectField: (await importOriginal<typeof import('@odysseus/store')>())
    .isEditableProspectField,
  addDirectoryEntriesToProspects: vi.fn(),
  appendProspectEvent: vi.fn(),
  attachAuditToProspect: vi.fn(),
  checkOutreachAction: vi.fn(),
  confirmOutreachSentByOperator: vi.fn(),
  createProspectHub: vi.fn(),
  applyAutomaticProspectStatus: vi.fn(),
  createRandomIndependentProspectFromDirectory: vi.fn(),
  archiveProspect: vi.fn(),
  countActiveProspectDeletionJobs: vi.fn(),
  countProspectDeletionImpact: vi.fn(),
  deleteProspectPermanently: vi.fn(),
  deleteAuditCascade: vi.fn(),
  deleteFinishedScanJobsForAudit: vi.fn(),
  restoreProspect: vi.fn(),
  findProspectsByDomain: vi.fn(),
  findOutreachThreadByProspect: vi.fn(),
  getLatestOutreachSyncAt: vi.fn(),
  getProspectHub: vi.fn(),
  isSuppressed: vi.fn(),
  listOutreachDrafts: vi.fn(),
  listOutreachPreviews: vi.fn(),
  listDirectory: vi.fn(),
  listProspectAudits: vi.fn(),
  listProspectScopeJobIds: vi.fn(),
  listProspectScopeJobRuns: vi.fn(async () => []),
  listProspectEvents: vi.fn(),
  listProspectTodo: vi.fn(),
  listProspects: vi.fn(),
  loadRetentionSnapshot: vi.fn(async () => ({
    audits: [],
    reports: [],
    analyses: [],
    approvals: [],
    bundles: [],
    activeBundles: [],
    qualityRuns: [],
    livePreviewAuditIds: [],
    archivedProspectIds: [],
  })),
  markAuditSlimmed: vi.fn(),
  countActiveAndAuditedProspects: vi.fn(),
  aggregateOutreachFunnel: vi.fn(),
  loadProspectWork: vi.fn(),
  markOutreachDraftDeletionPending: vi.fn(),
  markOutreachDraftDeleted: vi.fn(),
  revokeOutreachPreview: vi.fn(),
  recordProspectOutcome: vi.fn(),
  removeProspectEmail: vi.fn(),
  removeProspectWebsite: vi.fn(),
  setOutreachProspectEmail: vi.fn(),
  setPrimaryProspectWebsite: vi.fn(),
  setProspectStatus: vi.fn(),
  updateProspect: vi.fn(),
  withdrawProspectOutreach: vi.fn(),
  PROSPECT_TODO_KINDS: [
    'draft',
    'reply',
    'follow-up',
    'first-email',
    'audit-input',
    'audit-report',
    'report-quality-review',
  ],
}));
const { syncMailbox } = vi.hoisted(() => ({ syncMailbox: vi.fn() }));
vi.mock('../outreach/mailbox-sync.js', () => ({ syncMailbox }));
vi.mock('../outreach/draft-runtime.js', () => ({
  createFirstEmailForProspect: vi.fn(),
  createFollowUpForProspect: vi.fn(),
}));
const { deleteMailboxDraft, getMailboxDraft } = vi.hoisted(() => ({
  deleteMailboxDraft: vi.fn(),
  getMailboxDraft: vi.fn(),
}));
vi.mock('../outreach/configured-mailbox-draft-adapter.js', () => ({
  createConfiguredMailboxDraftAdapter: vi.fn(() => ({
    deleteDraft: deleteMailboxDraft,
    getDraft: getMailboxDraft,
  })),
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
vi.mock('../outreach/configured-preview-publisher.js', () => ({
  createConfiguredPreviewPublisher: vi.fn(() => ({
    delete: deletePreview,
    get: vi.fn(),
    put: vi.fn(),
  })),
}));

import {
  checkOutreachAction,
  confirmOutreachSentByOperator,
  createProspectHub,
  applyAutomaticProspectStatus,
  createRandomIndependentProspectFromDirectory,
  archiveProspect,
  countActiveProspectDeletionJobs,
  countProspectDeletionImpact,
  deleteProspectPermanently,
  deleteAuditCascade,
  deleteFinishedScanJobsForAudit,
  restoreProspect,
  findOutreachThreadByProspect,
  getLatestOutreachSyncAt,
  getProspectHub,
  isSuppressed,
  listOutreachDrafts,
  listOutreachPreviews,
  listDirectory,
  listProspectAudits,
  listProspectScopeJobIds,
  listProspectEvents,
  listProspectTodo,
  loadProspectWork,
  listProspects,
  countActiveAndAuditedProspects,
  aggregateOutreachFunnel,
  markOutreachDraftDeletionPending,
  markOutreachDraftDeleted,
  revokeOutreachPreview,
  recordProspectOutcome,
  removeProspectEmail,
  removeProspectWebsite,
  setOutreachProspectEmail,
  setPrimaryProspectWebsite,
  setProspectStatus,
  updateProspect,
  withdrawProspectOutreach,
  type ProspectTodoRow,
} from '@odysseus/store';
import { buildAuditDir } from '@odysseus/scanner';
import {
  releaseReportProduction,
  tryAcquireReportProduction,
} from '../pipeline/report-production-lock.js';
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

const fakeQueue = { isJobInFlight: vi.fn((_jobId: string) => false) };

async function handle(url: string, method: Method = 'GET', body?: unknown) {
  const router = new Router();
  registerProspectHubRoutes(router, fakeConnection, fakeQueue);
  const res = fakeRes();
  await router.handle(fakeReq(url, method, body), res);
  return { statusCode: res.statusCode, body: JSON.parse(res.body ?? '{}') as unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
  getMailboxDraft.mockResolvedValue({ providerDraftId: 'g-1' });
  syncMailbox.mockResolvedValue({ configured: true });
  vi.mocked(listProspects).mockResolvedValue(emptyPage as never);
  vi.mocked(countActiveAndAuditedProspects).mockResolvedValue({ active: 0, audited: 0 });
  vi.mocked(listDirectory).mockResolvedValue(emptyPage as never);
  vi.mocked(setProspectStatus).mockResolvedValue({ status: 'audited' } as never);
  vi.mocked(applyAutomaticProspectStatus).mockResolvedValue({ status: 'opted-out' } as never);
  vi.mocked(recordProspectOutcome).mockResolvedValue({ status: 'replied' } as never);
  vi.mocked(deleteProspectPermanently).mockResolvedValue({ deleted: true } as never);
  vi.mocked(countActiveProspectDeletionJobs).mockResolvedValue(0);
  vi.mocked(getProspectHub).mockResolvedValue({ prospectId: 'p-1' } as never);
  vi.mocked(getLatestOutreachSyncAt).mockResolvedValue(null);
  vi.mocked(listOutreachPreviews).mockResolvedValue([]);
  vi.mocked(withdrawProspectOutreach).mockResolvedValue({
    drafts: 0,
    previews: 0,
    threadClosed: false,
    providerDraftIds: [],
    providerDrafts: [],
    previewObjectKeys: [],
  });
  vi.mocked(checkOutreachAction).mockResolvedValue({ allowed: true } as never);
  vi.mocked(findOutreachThreadByProspect).mockResolvedValue(null);
  vi.mocked(listOutreachDrafts).mockResolvedValue([]);
  vi.mocked(markOutreachDraftDeletionPending).mockResolvedValue({ changed: true });
  vi.mocked(markOutreachDraftDeleted).mockResolvedValue({ changed: true });
  vi.mocked(listOutreachPreviews).mockResolvedValue([] as never);
  vi.mocked(listProspectAudits).mockResolvedValue([]);
  vi.mocked(listProspectScopeJobIds).mockResolvedValue([]);
  fakeQueue.isJobInFlight.mockReturnValue(false);
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
  it('rejects client-supplied lifecycle, provenance, and directory ownership fields', async () => {
    const response = await handle('/api/prospects', 'POST', {
      sector: 'hotel',
      name: 'Forged prospect',
      websites: [],
      emails: [],
      status: 'opted-out',
      fieldOrigins: { name: 'sirene' },
      directoryRef: { source: 'atout-france', sourceId: 'directory-1' },
    });

    expect(response.statusCode).toBe(400);
    expect(createProspectHub).not.toHaveBeenCalled();
  });

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
    // Plan 060 §8: only attention rows feed the shell badge; the summary
    // keeps audited prospects and actionable work on separate axes.
    expect(response.body).toEqual({
      rows,
      attentionCount: 0,
      summary: {
        activeProspects: 0,
        auditedProspects: 0,
        actionableItems: 1,
        actionableProspects: 1,
        kindCounts: {
          draft: 0,
          reply: 0,
          'follow-up': 0,
          'first-email': 1,
          'audit-input': 0,
          'audit-report': 0,
          'report-quality-review': 0,
        },
        mailboxConfigured: expect.any(Boolean),
        lastSyncAt: null,
      },
    });
    expect(listProspectTodo).toHaveBeenCalledWith(fakeConnection);
    // Issue #514: the two totals come from one count helper, not two full
    // listProspects pages.
    expect(countActiveAndAuditedProspects).toHaveBeenCalledTimes(1);
    expect(listProspects).not.toHaveBeenCalled();
  });

  it('serves the outreach funnel per campaign, counts only (issue #533)', async () => {
    const campaigns = [
      {
        campaignVersion: 'first-100-2026-09',
        threads: 5,
        firstTouchSent: 5,
        replied: 1,
        bounced: 0,
        optedOut: 0,
        won: 0,
        repliesAfterTouch: { 1: 1, 2: 0, 3: 0 },
        outcomes: {},
      },
    ];
    vi.mocked(aggregateOutreachFunnel).mockResolvedValue(campaigns as never);

    const response = await handle('/api/outreach/funnel');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ campaigns });
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

  describe('random independent prospect', () => {
    it('forces independence, drops pagination, and returns the created prospect', async () => {
      vi.mocked(createRandomIndependentProspectFromDirectory).mockResolvedValue({
        prospectId: 'p-random',
      } as never);

      const created = await handle(
        '/api/directory/random-independent?stars=4&department=33&groupStatus=group-member&q=phare&roomsMax=40&page=7&pageSize=1',
        'POST',
        {},
      );

      expect(created.statusCode).toBe(201);
      expect(created.body).toEqual({ prospectId: 'p-random' });
      expect(createRandomIndependentProspectFromDirectory).toHaveBeenCalledWith(fakeConnection, {
        q: 'phare',
        sector: undefined,
        stars: 4,
        groupStatus: 'independent',
        websiteKind: undefined,
        department: '33',
        commune: undefined,
        roomsMin: undefined,
        roomsMax: 40,
        hasScan: undefined,
        inactive: undefined,
        postcode: undefined,
      });
      const [, filter] = vi.mocked(createRandomIndependentProspectFromDirectory).mock.calls[0]!;
      expect(filter).not.toHaveProperty('page');
      expect(filter).not.toHaveProperty('pageSize');
    });

    it('answers a typed 409 when no eligible entry matches', async () => {
      vi.mocked(createRandomIndependentProspectFromDirectory).mockResolvedValue(null);

      const empty = await handle('/api/directory/random-independent?department=33', 'POST', {});

      expect(empty.statusCode).toBe(409);
      expect(empty.body).toMatchObject({ code: 'no-eligible-independent-directory-entry' });
    });

    it('rejects malformed facets without drawing', async () => {
      const invalid = await handle('/api/directory/random-independent?stars=four', 'POST', {});
      const badKind = await handle(
        '/api/directory/random-independent?websiteKind=castle',
        'POST',
        {},
      );

      expect(invalid.statusCode).toBe(400);
      expect(badKind.statusCode).toBe(400);
      expect(createRandomIndependentProspectFromDirectory).not.toHaveBeenCalled();
    });

    it('launches no scan and no outreach work', async () => {
      vi.mocked(createRandomIndependentProspectFromDirectory).mockResolvedValue({
        prospectId: 'p-random',
      } as never);

      await handle('/api/directory/random-independent', 'POST', {});

      expect(createFirstEmailForProspect).not.toHaveBeenCalled();
      expect(createFollowUpForProspect).not.toHaveBeenCalled();
      expect(syncMailbox).not.toHaveBeenCalled();
      expect(setProspectStatus).not.toHaveBeenCalled();
    });
  });

  it('routes explicit status, outcome, and deletion actions', async () => {
    const status = await handle('/api/prospects/p-1/status', 'PATCH', { status: 'audited' });
    expect(status.statusCode).toBe(200);
    expect(setProspectStatus).toHaveBeenCalledWith(fakeConnection, 'p-1', 'audited');

    vi.mocked(findOutreachThreadByProspect).mockResolvedValueOnce({
      touches: [{ touch: 1 }],
    } as never);
    const outcome = await handle('/api/prospects/p-1/outcome', 'POST', {
      outcome: 'reply-positive',
    });
    expect(outcome.statusCode).toBe(200);
    expect(recordProspectOutcome).toHaveBeenCalledWith(fakeConnection, 'p-1', 'reply-positive');

    const deleted = await handle('/api/prospects/p-1', 'DELETE');
    expect(deleted.statusCode).toBe(200);
    expect(deleteProspectPermanently).toHaveBeenCalledWith(fakeConnection, 'p-1');
  });

  it('refuses to archive while a job is active, and reports an incomplete purge (issue #381)', async () => {
    vi.mocked(countActiveProspectDeletionJobs).mockResolvedValueOnce(1);
    expect((await handle('/api/prospects/p-1/archive', 'POST')).statusCode).toBe(409);
    expect(archiveProspect).not.toHaveBeenCalled();

    vi.mocked(archiveProspect).mockResolvedValueOnce({
      prospect: { prospectId: 'p-1' },
      changed: true,
    } as never);
    vi.mocked(listProspectAudits).mockResolvedValueOnce([
      { auditId: 'audit-1', siteUrl: 'https://hotel.example/', startedAt: new Date() },
    ] as never);
    artifactStore.list.mockRejectedValueOnce(new Error('provider down'));
    expect((await handle('/api/prospects/p-1/archive', 'POST')).statusCode).toBe(503);
    expect(deleteAuditCascade).not.toHaveBeenCalled();
  });

  it('refuses archive and delete while a stopped job is still finishing its stage', async () => {
    vi.mocked(listProspectScopeJobIds).mockResolvedValue(['job-9']);
    fakeQueue.isJobInFlight.mockImplementation((jobId) => jobId === 'job-9');

    expect((await handle('/api/prospects/p-1/archive', 'POST')).statusCode).toBe(409);
    expect(archiveProspect).not.toHaveBeenCalled();
    expect((await handle('/api/prospects/p-1', 'DELETE')).statusCode).toBe(409);
    expect(deleteProspectPermanently).not.toHaveBeenCalled();
  });

  it('refuses archive while one of the prospect audits is in report production', async () => {
    vi.mocked(listProspectAudits).mockResolvedValue([{ auditId: 'audit-7' }] as never);
    expect(tryAcquireReportProduction('audit-7', 'writing')).toBe(true);
    try {
      expect((await handle('/api/prospects/p-1/archive', 'POST')).statusCode).toBe(409);
      expect(archiveProspect).not.toHaveBeenCalled();
    } finally {
      releaseReportProduction('audit-7', 'writing');
    }
  });

  it('purges each audit bucket prefix before the records, keeping them on failure (issue #384)', async () => {
    vi.mocked(listProspectAudits).mockResolvedValue([
      { siteUrl: 'https://hotel.example/', startedAt: new Date('2026-09-16T10:00:00Z') },
    ] as never);
    artifactStore.list.mockRejectedValueOnce(new Error('provider down'));
    const failed = await handle('/api/prospects/p-1', 'DELETE');
    expect(failed.statusCode).toBe(503);
    expect(deleteProspectPermanently).not.toHaveBeenCalled();

    artifactStore.list
      .mockResolvedValueOnce(['hotel.example/2026-09-16T10-00-00Z/manifest.json'])
      .mockResolvedValueOnce([]);
    const retried = await handle('/api/prospects/p-1', 'DELETE');
    expect(retried.statusCode).toBe(200);
    expect(artifactStore.delete).toHaveBeenCalledWith(
      'hotel.example/2026-09-16T10-00-00Z/manifest.json',
    );
    expect(deleteProspectPermanently).toHaveBeenCalledWith(fakeConnection, 'p-1');
  });

  it('archives by purging audits but keeping the prospect, and restores it (issue #381)', async () => {
    vi.mocked(archiveProspect).mockResolvedValue({
      prospect: { prospectId: 'p-1' },
      changed: true,
    } as never);
    vi.mocked(listProspectAudits).mockResolvedValueOnce([
      {
        auditId: 'audit-1',
        siteUrl: 'https://hotel.example/',
        startedAt: new Date('2026-09-16T10:00:00Z'),
      },
    ] as never);
    artifactStore.list
      .mockResolvedValueOnce(['hotel.example/2026-09-16T10-00-00Z/report.pdf'])
      .mockResolvedValueOnce([]);
    const archived = await handle('/api/prospects/p-1/archive', 'POST');
    expect(archived).toMatchObject({
      statusCode: 200,
      body: { changed: true, purged: { audits: 1, auditsKept: 0, remoteObjectsDeleted: 1 } },
    });
    expect(archiveProspect).toHaveBeenCalledWith(fakeConnection, 'p-1');
    expect(artifactStore.delete).toHaveBeenCalledWith(
      'hotel.example/2026-09-16T10-00-00Z/report.pdf',
    );
    expect(deleteAuditCascade).toHaveBeenCalledWith(fakeConnection, 'audit-1');
    expect(deleteFinishedScanJobsForAudit).toHaveBeenCalledWith(fakeConnection, 'audit-1');
    expect(withdrawProspectOutreach).not.toHaveBeenCalled();
    expect(deleteProspectPermanently).not.toHaveBeenCalled();

    vi.mocked(restoreProspect).mockResolvedValueOnce(null);
    expect((await handle('/api/prospects/p-1/restore', 'POST')).statusCode).toBe(404);

    vi.mocked(countProspectDeletionImpact).mockResolvedValueOnce({ audits: 2 } as never);
    const impact = await handle('/api/prospects/p-1/deletion-impact');
    expect(impact).toMatchObject({ statusCode: 200, body: { audits: 2 } });
    expect(deleteProspectPermanently).not.toHaveBeenCalled();

    const patched = await handle('/api/prospects/p-1', 'PATCH', { archivedAt: new Date() });
    expect(patched.statusCode).toBe(400);
    expect(updateProspect).not.toHaveBeenCalled();
  });

  it('passes the archived list filter through and rejects a malformed one', async () => {
    await handle('/api/prospects?archived=true');
    expect(listProspects).toHaveBeenCalledWith(
      fakeConnection,
      expect.objectContaining({ archived: true }),
    );
    expect((await handle('/api/prospects?archived=maybe')).statusCode).toBe(400);
  });

  it('refuses a record patch naming identity or bookkeeping fields', async () => {
    for (const body of [
      { prospectId: 'p-2' },
      { createdAt: '2020-01-01' },
      { directoryRef: { source: 'x', sourceId: 'y' } },
      { notes: 'ok', fieldOrigins: {} },
    ]) {
      const response = await handle('/api/prospects/p-1', 'PATCH', body);
      expect(response.statusCode).toBe(400);
    }
    expect(updateProspect).not.toHaveBeenCalled();
  });

  // Issue #289: an invalid patch (a SIREN failing the 9-digit checksum) is
  // reported as a client error by the record PATCH route, not a 500.
  it('answers 400 when the record patch is rejected by the store', async () => {
    vi.mocked(updateProspect).mockRejectedValueOnce(
      new Error('siren must be a valid 9-digit SIREN'),
    );
    const response = await handle('/api/prospects/p-1', 'PATCH', { siren: '732829321' });
    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({ error: 'siren must be a valid 9-digit SIREN' });

    vi.mocked(updateProspect).mockResolvedValueOnce({ prospectId: 'p-1' } as never);
    const valid = await handle('/api/prospects/p-1', 'PATCH', { siren: '732 829 320' });
    expect(valid.statusCode).toBe(200);
    expect(updateProspect).toHaveBeenCalledWith(fakeConnection, 'p-1', { siren: '732 829 320' });
  });

  it('routes website and email corrections through the explicit contact endpoints', async () => {
    const prospect = { prospectId: 'p-1' };
    vi.mocked(removeProspectWebsite).mockResolvedValue({ ok: true, prospect } as never);
    vi.mocked(setPrimaryProspectWebsite).mockResolvedValue({
      ok: false,
      refusal: 'contact-not-found',
    });
    vi.mocked(setOutreachProspectEmail).mockResolvedValue({ ok: true, prospect } as never);
    vi.mocked(removeProspectEmail).mockResolvedValue({
      ok: true,
      prospect,
      withdrawnProviderDraftIds: ['gmail-draft-1'],
      withdrawnDrafts: [{ draftId: 'd-email', providerDraftId: 'gmail-draft-1' }],
    } as never);
    deleteMailboxDraft.mockResolvedValue(undefined);

    const website = await handle('/api/prospects/p-1/websites', 'DELETE', { url: 'https://a.fr/' });
    expect(website.statusCode).toBe(200);
    expect(removeProspectWebsite).toHaveBeenCalledWith(fakeConnection, 'p-1', 'https://a.fr/');

    const primary = await handle('/api/prospects/p-1/websites/primary', 'POST', {
      url: 'https://missing.fr/',
    });
    expect(primary.statusCode).toBe(404);

    const recipient = await handle('/api/prospects/p-1/emails/primary', 'POST', {
      address: 'b@a.fr',
    });
    expect(recipient.statusCode).toBe(200);

    const email = await handle('/api/prospects/p-1/emails', 'DELETE', {
      address: 'x@a.fr',
      suppress: true,
    });
    expect(email.statusCode).toBe(200);
    expect(removeProspectEmail).toHaveBeenCalledWith(fakeConnection, 'p-1', 'x@a.fr', {
      suppress: true,
    });
    expect(deleteMailboxDraft).toHaveBeenCalledWith('gmail-draft-1');

    const missing = await handle('/api/prospects/p-1/emails', 'DELETE', {});
    expect(missing.statusCode).toBe(400);
  });

  it('refuses a reply outcome while nothing has been sent', async () => {
    vi.mocked(findOutreachThreadByProspect).mockResolvedValueOnce({ touches: [] } as never);
    const response = await handle('/api/prospects/p-1/outcome', 'POST', { outcome: 'no-reply' });
    expect(response.statusCode).toBe(409);
    expect(response.body).toMatchObject({ refusal: 'nothing-sent' });
    expect(recordProspectOutcome).not.toHaveBeenCalled();
  });

  it('withdraws drafts, previews and the thread when an opt-out is recorded', async () => {
    vi.mocked(recordProspectOutcome).mockResolvedValue({
      prospectId: 'p-1',
      status: 'opted-out',
    } as never);
    vi.mocked(listOutreachPreviews).mockResolvedValue([{ objectKey: 'k/preview.html' }] as never);
    vi.mocked(withdrawProspectOutreach).mockResolvedValue({
      drafts: 1,
      previews: 1,
      threadClosed: true,
      providerDraftIds: ['gmail-draft-9'],
      providerDrafts: [{ draftId: 'd-opt-out', providerDraftId: 'gmail-draft-9' }],
      previewObjectKeys: ['k/preview.html'],
    });
    deleteMailboxDraft.mockRejectedValueOnce(new Error('mailbox unavailable'));

    const response = await handle('/api/prospects/p-1/outcome', 'POST', { outcome: 'opt-out' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      status: 'opted-out',
      withdrawn: {
        drafts: 1,
        previews: 1,
        threadClosed: true,
        mailboxDraftsNotRemoved: 1,
        warnings: ['mailbox-draft-deletion-pending'],
      },
    });
    expect(deletePreview).toHaveBeenCalledWith('k/preview.html');
    expect(withdrawProspectOutreach).toHaveBeenCalledWith(fakeConnection, 'p-1', 'opted-out');
    expect(deleteMailboxDraft).toHaveBeenCalledWith('gmail-draft-9');
  });

  it('confirms a drafted first email sent elsewhere when the status is set to contacted', async () => {
    vi.mocked(setProspectStatus).mockResolvedValue({
      prospectId: 'p-1',
      status: 'contacted',
    } as never);
    vi.mocked(confirmOutreachSentByOperator).mockResolvedValue({
      touch: 1,
      threadClosed: true,
      providerDrafts: [{ draftId: 'd-1', providerDraftId: 'gmail-draft-1' }],
    });
    deleteMailboxDraft.mockResolvedValue(undefined);

    const response = await handle('/api/prospects/p-1/status', 'PATCH', { status: 'contacted' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      prospectId: 'p-1',
      status: 'contacted',
      sendConfirmed: { touch: 1, threadClosed: true },
      mailboxDraftsNotRemoved: 0,
    });
    expect(confirmOutreachSentByOperator).toHaveBeenCalledWith(fakeConnection, 'p-1', 'contacted');
    expect(deleteMailboxDraft).toHaveBeenCalledWith('gmail-draft-1');
    expect(markOutreachDraftDeleted).toHaveBeenCalledWith(fakeConnection, 'd-1');
    expect(deletePreview).not.toHaveBeenCalled();
    expect(withdrawProspectOutreach).not.toHaveBeenCalled();
  });

  it('only sets the status when no drafted touch is waiting', async () => {
    vi.mocked(setProspectStatus).mockResolvedValue({
      prospectId: 'p-1',
      status: 'contacted',
    } as never);
    vi.mocked(confirmOutreachSentByOperator).mockResolvedValue({
      threadClosed: false,
      providerDrafts: [],
    });

    const response = await handle('/api/prospects/p-1/status', 'PATCH', { status: 'contacted' });

    expect(response.body).toEqual({ prospectId: 'p-1', status: 'contacted' });
    expect(deleteMailboxDraft).not.toHaveBeenCalled();
  });

  it('withdraws outreach when the status selector records an opt-out', async () => {
    vi.mocked(applyAutomaticProspectStatus).mockResolvedValue({
      prospectId: 'p-1',
      status: 'opted-out',
    } as never);
    vi.mocked(withdrawProspectOutreach).mockResolvedValue({
      drafts: 1,
      previews: 0,
      threadClosed: true,
      providerDraftIds: [],
      providerDrafts: [],
      previewObjectKeys: [],
    });

    const response = await handle('/api/prospects/p-1/status', 'PATCH', {
      status: 'opted-out',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      status: 'opted-out',
      withdrawn: { drafts: 1, previews: 0, threadClosed: true },
    });
    expect(applyAutomaticProspectStatus).toHaveBeenCalledWith(fakeConnection, 'p-1', 'opted-out');
    expect(setProspectStatus).not.toHaveBeenCalled();
    expect(withdrawProspectOutreach).toHaveBeenCalledWith(fakeConnection, 'p-1', 'opted-out');
  });

  it('withdraws the mailbox draft when a prospect is deleted', async () => {
    vi.mocked(listProspectAudits).mockResolvedValue([]);
    vi.mocked(withdrawProspectOutreach).mockResolvedValue({
      drafts: 1,
      previews: 0,
      threadClosed: true,
      providerDraftIds: ['gmail-draft-2'],
      providerDrafts: [{ draftId: 'd-delete', providerDraftId: 'gmail-draft-2' }],
      previewObjectKeys: [],
    });
    deleteMailboxDraft.mockResolvedValue(undefined);

    const response = await handle('/api/prospects/p-1', 'DELETE');

    expect(response.statusCode).toBe(200);
    expect(deleteMailboxDraft).toHaveBeenCalledWith('gmail-draft-2');
    expect(withdrawProspectOutreach).toHaveBeenCalledWith(
      fakeConnection,
      'p-1',
      'prospect-deleted',
    );
  });

  it('returns a conflict when normal outcome recording would overwrite a terminal status', async () => {
    const refusal = new Error('automatic status transition from won to lost is not allowed');
    refusal.name = 'AutomaticStatusTransitionError';
    vi.mocked(recordProspectOutcome).mockRejectedValueOnce(refusal);

    const response = await handle('/api/prospects/p-1/outcome', 'POST', { outcome: 'lost' });

    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({ error: refusal.message });
  });

  async function withAuditArtifacts(run: (auditDir: string) => Promise<void>): Promise<void> {
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
      await run(auditDir);
    } finally {
      if (previousArtifactsRoot === undefined) delete process.env['ODYSSEUS_ARTIFACTS_ROOT'];
      else process.env['ODYSSEUS_ARTIFACTS_ROOT'] = previousArtifactsRoot;
      await fs.rm(artifactsRoot, { recursive: true, force: true });
    }
  }

  it('withdraws previews, runs the cascade, then removes audit artifacts', async () => {
    await withAuditArtifacts(async (auditDir) => {
      const response = await handle('/api/prospects/p-1', 'DELETE');

      expect(response.statusCode).toBe(200);
      await expect(fs.access(auditDir)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(deletePreview).toHaveBeenCalledWith('example.fr/preview.html');
      expect(deleteProspectPermanently).toHaveBeenCalledWith(fakeConnection, 'p-1');
      expect(deletePreview.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(deleteProspectPermanently).mock.invocationCallOrder[0]!,
      );
    });
  });

  it('refuses to delete while a job for the prospect is unfinished', async () => {
    await withAuditArtifacts(async (auditDir) => {
      vi.mocked(countActiveProspectDeletionJobs).mockResolvedValueOnce(1);
      const response = await handle('/api/prospects/p-1', 'DELETE');

      expect(response.statusCode).toBe(409);
      expect(deletePreview).not.toHaveBeenCalled();
      expect(deleteProspectPermanently).not.toHaveBeenCalled();
      await expect(fs.access(auditDir)).resolves.toBeUndefined();
    });
  });

  it('keeps artifacts and records when the preview withdrawal fails', async () => {
    await withAuditArtifacts(async (auditDir) => {
      deletePreview.mockRejectedValueOnce(new Error('bucket unavailable'));
      const response = await handle('/api/prospects/p-1', 'DELETE');

      expect(response.statusCode).toBe(503);
      expect(deleteProspectPermanently).not.toHaveBeenCalled();
      await expect(fs.access(auditDir)).resolves.toBeUndefined();
    });
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

describe('POST /api/outreach/suppression-check', () => {
  it('answers only whether the address is suppressed', async () => {
    vi.mocked(isSuppressed).mockResolvedValue(true);
    const result = await handle('/api/outreach/suppression-check', 'POST', {
      address: ' Role@Hotel-Exemple.fr ',
    });
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ suppressed: true });
    expect(isSuppressed).toHaveBeenCalledWith(
      fakeConnection,
      'hotel-exemple.fr',
      'Role@Hotel-Exemple.fr',
    );
  });

  it('rejects a malformed address without checking', async () => {
    const result = await handle('/api/outreach/suppression-check', 'POST', { address: 'nope' });
    expect(result.statusCode).toBe(400);
    expect(isSuppressed).not.toHaveBeenCalled();
  });
});

describe('POST /api/outreach/mailbox-sync', () => {
  it('reports what the sync found, or 503 without a mailbox', async () => {
    syncMailbox.mockResolvedValueOnce({
      configured: true,
      threads: 2,
      sent: 1,
      replies: 1,
      review: 0,
    });
    const synced = await handle('/api/outreach/mailbox-sync', 'POST', {});
    expect(synced.statusCode).toBe(200);
    expect(synced.body).toMatchObject({ sent: 1, replies: 1 });

    syncMailbox.mockResolvedValueOnce({ configured: false });
    const missing = await handle('/api/outreach/mailbox-sync', 'POST', {});
    expect(missing.statusCode).toBe(503);
  });

  it('returns a provider failure without leaking the raw mailbox error', async () => {
    syncMailbox.mockRejectedValueOnce(new Error('Gmail thread read failed with status 403'));

    const failed = await handle('/api/outreach/mailbox-sync', 'POST', {});

    expect(failed.statusCode).toBe(502);
    expect(failed.body).toEqual({ error: 'mailbox could not be synchronized' });
  });
});

describe('outreach language', () => {
  it('writes the first email in the prospect language, not a default from the dashboard', async () => {
    vi.mocked(getProspectHub).mockResolvedValue({
      prospectId: 'p-1',
      outreachLanguage: 'en',
    } as never);
    vi.mocked(checkOutreachAction).mockResolvedValue({ allowed: true } as never);
    vi.mocked(createFirstEmailForProspect).mockResolvedValue({ configured: true } as never);

    await handle('/api/prospects/p-1/outreach/first-email', 'POST', {});
    expect(createFirstEmailForProspect).toHaveBeenCalledWith(fakeConnection, 'p-1', {
      language: 'en',
    });

    vi.mocked(getProspectHub).mockResolvedValue({ prospectId: 'p-1' } as never);
    await handle('/api/prospects/p-1/outreach/first-email', 'POST', {});
    expect(createFirstEmailForProspect).toHaveBeenLastCalledWith(fakeConnection, 'p-1', {
      language: 'fr',
    });
  });
});

describe('draft review', () => {
  it('discards a pending draft here and in the mailbox', async () => {
    vi.mocked(listOutreachDrafts).mockResolvedValue([
      { draftId: 'd-1', providerDraftId: 'g-1', status: 'created' },
    ] as never);
    deleteMailboxDraft.mockResolvedValue(undefined);

    const response = await handle('/api/prospects/p-1/drafts/d-1/discard', 'POST', {});
    expect(response.statusCode).toBe(200);
    expect(markOutreachDraftDeletionPending).toHaveBeenCalledWith(fakeConnection, 'd-1', 'skipped');
    expect(deleteMailboxDraft).toHaveBeenCalledWith('g-1');

    const missing = await handle('/api/prospects/p-1/drafts/nope/discard', 'POST', {});
    expect(missing.statusCode).toBe(404);
  });

  it('reports a mailbox deletion failure while keeping the draft retryable', async () => {
    vi.mocked(listOutreachDrafts).mockResolvedValue([
      { draftId: 'd-1', providerDraftId: 'g-1', status: 'created' },
    ] as never);
    deleteMailboxDraft.mockRejectedValueOnce(new Error('mailbox unavailable'));

    const response = await handle('/api/prospects/p-1/drafts/d-1/discard', 'POST', {});

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      discarded: true,
      mailboxDraftsNotRemoved: 1,
      warnings: ['mailbox-draft-deletion-pending'],
    });
    expect(markOutreachDraftDeletionPending).toHaveBeenCalledWith(fakeConnection, 'd-1', 'skipped');
    expect(markOutreachDraftDeleted).not.toHaveBeenCalled();
  });

  it('takes the discarded first email preview offline, object first', async () => {
    vi.mocked(listOutreachDrafts).mockResolvedValue([
      {
        draftId: 'd-1',
        prospectId: 'p-1',
        previewId: 'pv-1',
        providerDraftId: 'g-1',
        status: 'created',
      },
    ] as never);
    vi.mocked(listOutreachPreviews).mockResolvedValue([
      { previewId: 'pv-1', objectKey: 'k.html', status: 'live' },
    ] as never);
    deleteMailboxDraft.mockResolvedValue(undefined);

    const response = await handle('/api/prospects/p-1/drafts/d-1/discard', 'POST', {});
    expect(response.body).toEqual({
      discarded: true,
      previewRevoked: true,
      mailboxDraftsNotRemoved: 0,
    });
    expect(deletePreview).toHaveBeenCalledWith('k.html');
    expect(revokeOutreachPreview).toHaveBeenCalledWith(
      fakeConnection,
      'pv-1',
      'draft discarded by the operator',
    );
  });

  it('keeps a draft that is no longer in the mailbox and syncs instead (issue #478)', async () => {
    vi.mocked(listOutreachDrafts).mockResolvedValue([
      {
        draftId: 'd-1',
        prospectId: 'p-1',
        previewId: 'pv-1',
        providerDraftId: 'g-1',
        status: 'created',
      },
    ] as never);
    getMailboxDraft.mockResolvedValue(null);

    const response = await handle('/api/prospects/p-1/drafts/d-1/discard', 'POST', {});

    expect(response.statusCode).toBe(409);
    expect(response.body).toMatchObject({ error: 'draft-not-in-mailbox' });
    expect(markOutreachDraftDeletionPending).not.toHaveBeenCalled();
    expect(deleteMailboxDraft).not.toHaveBeenCalled();
    expect(deletePreview).not.toHaveBeenCalled();
    expect(revokeOutreachPreview).not.toHaveBeenCalled();
    expect(syncMailbox).toHaveBeenCalledWith(fakeConnection);
  });

  it('changes nothing when the mailbox cannot be checked (issue #478)', async () => {
    vi.mocked(listOutreachDrafts).mockResolvedValue([
      { draftId: 'd-1', prospectId: 'p-1', providerDraftId: 'g-1', status: 'created' },
    ] as never);
    getMailboxDraft.mockRejectedValue(new Error('Gmail draft read failed with status 500'));

    const response = await handle('/api/prospects/p-1/drafts/d-1/discard', 'POST', {});

    expect(response.statusCode).toBe(502);
    expect(markOutreachDraftDeletionPending).not.toHaveBeenCalled();
    expect(deleteMailboxDraft).not.toHaveBeenCalled();
    expect(syncMailbox).not.toHaveBeenCalled();
  });

  it('still discards when the preview object cannot be removed', async () => {
    vi.mocked(listOutreachDrafts).mockResolvedValue([
      {
        draftId: 'd-1',
        prospectId: 'p-1',
        previewId: 'pv-1',
        providerDraftId: 'g-1',
        status: 'created',
      },
    ] as never);
    vi.mocked(listOutreachPreviews).mockResolvedValue([
      { previewId: 'pv-1', objectKey: 'k.html', status: 'live' },
    ] as never);
    deleteMailboxDraft.mockResolvedValue(undefined);
    deletePreview.mockRejectedValueOnce(new Error('bucket down'));

    const response = await handle('/api/prospects/p-1/drafts/d-1/discard', 'POST', {});
    expect(response.body).toEqual({
      discarded: true,
      previewRevoked: false,
      previewStillLive: true,
      mailboxDraftsNotRemoved: 0,
    });
    expect(markOutreachDraftDeletionPending).toHaveBeenCalledWith(fakeConnection, 'd-1', 'skipped');
    expect(revokeOutreachPreview).not.toHaveBeenCalled();
  });
});

describe('one preview per outreach attempt', () => {
  it('passes the published preview token to the first email instead of publishing again', async () => {
    vi.mocked(getProspectHub).mockResolvedValue({ prospectId: 'p-1' } as never);
    vi.mocked(checkOutreachAction).mockResolvedValue({ allowed: true } as never);
    vi.mocked(createFirstEmailForProspect).mockResolvedValue({ configured: true } as never);

    await handle('/api/prospects/p-1/outreach/first-email', 'POST', { previewToken: 'tok' });
    expect(createFirstEmailForProspect).toHaveBeenCalledWith(fakeConnection, 'p-1', {
      language: 'fr',
      previewToken: 'tok',
    });
  });

  it('suggests a role address a scan read on the site until the prospect carries it', async () => {
    const roleContact = { address: 'contact@hotel.fr', sourceUrl: 'https://hotel.fr/contact' };
    vi.mocked(listProspectAudits).mockResolvedValue([
      { auditId: 'a-2', siteUrl: 'https://hotel.fr' },
      { auditId: 'a-1', siteUrl: 'https://hotel.fr', siteSignals: { roleContact } },
    ] as never);
    vi.mocked(getProspectHub).mockResolvedValue({ prospectId: 'p-1', emails: [] } as never);
    const suggested = (await handle('/api/prospects/p-1')).body as Record<string, unknown>;
    expect(suggested['contactSuggestion']).toEqual(roleContact);
    expect(suggested['audits']).toEqual([
      { auditId: 'a-2', siteUrl: 'https://hotel.fr' },
      { auditId: 'a-1', siteUrl: 'https://hotel.fr' },
    ]);

    vi.mocked(getProspectHub).mockResolvedValue({
      prospectId: 'p-1',
      emails: [{ address: 'contact@hotel.fr', origin: 'site-discovery' }],
    } as never);
    const accepted = (await handle('/api/prospects/p-1')).body as Record<string, unknown>;
    expect(accepted['contactSuggestion']).toBeNull();
  });

  it('revokes a live preview object first, then its record', async () => {
    vi.mocked(listOutreachPreviews).mockResolvedValue([
      { previewId: 'pv-1', objectKey: 'k.html', status: 'live' },
    ] as never);
    const response = await handle('/api/prospects/p-1/previews/pv-1/revoke', 'POST', {});
    expect(response.statusCode).toBe(200);
    expect(deletePreview).toHaveBeenCalledWith('k.html');
    expect(revokeOutreachPreview).toHaveBeenCalledWith(
      fakeConnection,
      'pv-1',
      'revoked by the operator',
    );
    const missing = await handle('/api/prospects/p-1/previews/nope/revoke', 'POST', {});
    expect(missing.statusCode).toBe(404);
  });
});
