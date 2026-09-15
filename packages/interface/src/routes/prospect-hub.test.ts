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
  isSuppressed: vi.fn(),
  listOutreachDrafts: vi.fn(),
  listOutreachPreviews: vi.fn(),
  listDirectory: vi.fn(),
  listProspectAudits: vi.fn(),
  listProspectEvents: vi.fn(),
  listProspectTodo: vi.fn(),
  listProspects: vi.fn(),
  loadProspectWork: vi.fn(),
  recordOutreachDraftReview: vi.fn(),
  recordProspectOutcome: vi.fn(),
  removeProspectEmail: vi.fn(),
  removeProspectWebsite: vi.fn(),
  setOutreachProspectEmail: vi.fn(),
  setPrimaryProspectWebsite: vi.fn(),
  setProspectStatus: vi.fn(),
  updateProspect: vi.fn(),
  withdrawProspectOutreach: vi.fn(),
}));
const { syncMailbox } = vi.hoisted(() => ({ syncMailbox: vi.fn() }));
vi.mock('../outreach/mailbox-sync.js', () => ({ syncMailbox }));
vi.mock('../outreach/draft-runtime.js', () => ({
  createFirstEmailForProspect: vi.fn(),
  createFollowUpForProspect: vi.fn(),
}));
const { deleteMailboxDraft } = vi.hoisted(() => ({ deleteMailboxDraft: vi.fn() }));
vi.mock('../outreach/configured-mailbox-draft-adapter.js', () => ({
  createConfiguredMailboxDraftAdapter: vi.fn(() => ({ deleteDraft: deleteMailboxDraft })),
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
  isSuppressed,
  listOutreachDrafts,
  listOutreachPreviews,
  listDirectory,
  listProspectAudits,
  listProspectEvents,
  listProspectTodo,
  loadProspectWork,
  listProspects,
  recordOutreachDraftReview,
  recordProspectOutcome,
  removeProspectEmail,
  removeProspectWebsite,
  setOutreachProspectEmail,
  setPrimaryProspectWebsite,
  setProspectStatus,
  withdrawProspectOutreach,
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
  vi.mocked(listOutreachPreviews).mockResolvedValue([]);
  vi.mocked(withdrawProspectOutreach).mockResolvedValue({
    drafts: 0,
    previews: 0,
    threadClosed: false,
    providerDraftIds: [],
    previewObjectKeys: [],
  });
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
    expect(deleteProspect).toHaveBeenCalledWith(fakeConnection, 'p-1');
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
      previewObjectKeys: ['k/preview.html'],
    });
    deleteMailboxDraft.mockResolvedValue(undefined);

    const response = await handle('/api/prospects/p-1/outcome', 'POST', { outcome: 'opt-out' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      status: 'opted-out',
      withdrawn: { drafts: 1, previews: 1, threadClosed: true },
    });
    expect(deletePreview).toHaveBeenCalledWith('k/preview.html');
    expect(withdrawProspectOutreach).toHaveBeenCalledWith(fakeConnection, 'p-1', 'opted-out');
    expect(deleteMailboxDraft).toHaveBeenCalledWith('gmail-draft-9');
  });

  it('withdraws the mailbox draft when a prospect is deleted', async () => {
    vi.mocked(listProspectAudits).mockResolvedValue([]);
    vi.mocked(withdrawProspectOutreach).mockResolvedValue({
      drafts: 1,
      previews: 0,
      threadClosed: true,
      providerDraftIds: ['gmail-draft-2'],
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
      'Hotel-Exemple.fr',
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
    expect(recordOutreachDraftReview).toHaveBeenCalledWith(fakeConnection, 'd-1', 'skipped');
    expect(deleteMailboxDraft).toHaveBeenCalledWith('g-1');

    const missing = await handle('/api/prospects/p-1/drafts/nope/discard', 'POST', {});
    expect(missing.statusCode).toBe(404);
  });
});
