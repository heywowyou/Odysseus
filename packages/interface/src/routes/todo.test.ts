import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  listOutreachReviewDrafts: vi.fn(),
  listRepliesNeedingReview: vi.fn(),
  listOperatorProspects: vi.fn(),
  listJobs: vi.fn(),
  getAuditManualFields: vi.fn(),
  listReportLanguages: vi.fn(),
  getLatestReportApproval: vi.fn(),
  getHotelCandidatesByIds: vi.fn(),
}));

vi.mock('@odysseus/report', () => ({
  findUnconfirmedIdentityFields: vi.fn(),
}));

import {
  getAuditManualFields,
  getHotelCandidatesByIds,
  getLatestReportApproval,
  listJobs,
  listOperatorProspects,
  listOutreachReviewDrafts,
  listReportLanguages,
  listRepliesNeedingReview,
} from '@odysseus/store';
import { findUnconfirmedIdentityFields } from '@odysseus/report';
import { Router } from '../router.js';
import { registerTodoRoutes } from './todo.js';

function fakeGetReq(url: string): IncomingMessage {
  const req = Readable.from([]) as unknown as IncomingMessage;
  req.method = 'GET';
  req.url = url;
  req.headers = {};
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

const emptyPage = { rows: [], total: 0, limit: 50, offset: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listOutreachReviewDrafts).mockResolvedValue(emptyPage as never);
  vi.mocked(listRepliesNeedingReview).mockResolvedValue(emptyPage as never);
  vi.mocked(listOperatorProspects).mockResolvedValue(emptyPage as never);
  vi.mocked(listJobs).mockResolvedValue([]);
  vi.mocked(getHotelCandidatesByIds).mockResolvedValue([]);
  vi.mocked(getAuditManualFields).mockResolvedValue({} as never);
  vi.mocked(listReportLanguages).mockResolvedValue([]);
  vi.mocked(getLatestReportApproval).mockResolvedValue(null);
  vi.mocked(findUnconfirmedIdentityFields).mockReturnValue([]);
});

async function handle(): Promise<{ statusCode: number; body: { rows: unknown[] } }> {
  const router = new Router();
  registerTodoRoutes(router, fakeConnection);
  const res = fakeRes();
  await router.handle(fakeGetReq('/api/todo'), res);
  return { statusCode: res.statusCode, body: JSON.parse(res.body ?? '{}') };
}

describe('GET /api/todo', () => {
  it('returns an empty table when every source is empty', async () => {
    const { statusCode, body } = await handle();
    expect(statusCode).toBe(200);
    expect(body.rows).toEqual([]);
  });

  it('maps a pending draft to a review-draft row', async () => {
    vi.mocked(listOutreachReviewDrafts).mockResolvedValue({
      rows: [
        {
          draftId: 'd-1',
          threadId: 't-1',
          candidateId: 'c-1',
          hotelName: 'Hôtel Exemple',
          touch: 1,
          language: 'fr',
          touch1EvidenceSlot: null,
          hasProviderDraft: true,
          createdAt: new Date('2026-09-01T08:00:00.000Z'),
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    } as never);

    const { body } = await handle();
    expect(body.rows).toEqual([
      {
        kind: 'draft',
        subject: 'Hôtel Exemple',
        action: 'review-draft',
        href: '/prospects/c-1#hub-emails',
        since: '2026-09-01T08:00:00.000Z',
      },
    ]);
  });

  it('maps a reply needing review to a review-reply row', async () => {
    vi.mocked(listRepliesNeedingReview).mockResolvedValue({
      rows: [
        {
          threadId: 't-1',
          candidateId: 'c-1',
          hotelName: 'Hôtel Exemple',
          domain: 'example.com',
          language: 'fr',
          state: 'replied',
          currentTouch: 1,
          reviewReason: 'ambiguous',
          reviewDetectedAt: new Date('2026-09-02T08:00:00.000Z'),
          lastSyncedAt: null,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    } as never);

    const { body } = await handle();
    expect(body.rows).toEqual([
      {
        kind: 'reply',
        subject: 'Hôtel Exemple',
        action: 'review-reply',
        href: '/prospects/c-1#hub-outcome',
        since: '2026-09-02T08:00:00.000Z',
      },
    ]);
  });

  it('maps a join-review hotel to a review-hotel row with no timestamp', async () => {
    vi.mocked(listOperatorProspects).mockResolvedValue({
      rows: [{ candidateId: 'c-2', name: 'Hôtel Deux' }],
      total: 1,
      limit: 50,
      offset: 0,
      selection: null,
      selectedCount: 0,
      catalogueTotal: 1,
    } as never);

    const { body } = await handle();
    expect(body.rows).toEqual([
      {
        kind: 'hotel',
        subject: 'Hôtel Deux',
        action: 'review-hotel',
        href: '/prospects/c-2',
        since: null,
      },
    ]);
    expect(listOperatorProspects).toHaveBeenCalledWith(fakeConnection, {
      queue: 'join-review',
      limit: 50,
      offset: 0,
    });
  });

  it('skips a needs-input job whose audit has cleared every gate', async () => {
    vi.mocked(listJobs).mockResolvedValue([
      {
        jobId: 'j-1',
        status: 'needs-input',
        auditId: 'a-1',
        createdAt: new Date('2026-09-03T08:00:00.000Z'),
      },
    ] as never);
    vi.mocked(findUnconfirmedIdentityFields).mockReturnValue([]);
    vi.mocked(listReportLanguages).mockResolvedValue(['fr', 'en'] as never);
    vi.mocked(getLatestReportApproval).mockResolvedValue({} as never);

    const { body } = await handle();
    expect(body.rows).toEqual([]);
  });

  it('surfaces a needs-input job missing identity confirmation, named by its hostname', async () => {
    vi.mocked(listJobs).mockResolvedValue([
      {
        jobId: 'j-1',
        status: 'needs-input',
        auditId: 'a-1',
        siteUrl: 'https://example.com/',
        createdAt: new Date('2026-09-03T08:00:00.000Z'),
      },
    ] as never);
    vi.mocked(findUnconfirmedIdentityFields).mockReturnValue([{ field: 'name' } as never]);

    const { body } = await handle();
    expect(body.rows).toEqual([
      {
        kind: 'audit',
        subject: 'example.com',
        action: 'confirm-identity',
        href: '/audits/a-1',
        since: '2026-09-03T08:00:00.000Z',
      },
    ]);
  });

  it('names an audit row by its outreach candidate when one resolves', async () => {
    vi.mocked(listJobs).mockResolvedValue([
      {
        jobId: 'j-1',
        status: 'failed',
        auditId: 'a-1',
        outreachCandidateId: 'c-3',
        createdAt: new Date('2026-09-03T08:00:00.000Z'),
      },
    ] as never);
    vi.mocked(getHotelCandidatesByIds).mockResolvedValue([
      { candidateId: 'c-3', name: 'Hôtel Trois' },
    ] as never);
    vi.mocked(listReportLanguages).mockResolvedValue([]);

    const { body } = await handle();
    expect(body.rows).toEqual([
      {
        kind: 'audit',
        subject: 'Hôtel Trois',
        action: 'generate-pdfs',
        href: '/audits/a-1',
        since: '2026-09-03T08:00:00.000Z',
      },
    ]);
  });

  it('ignores a failed job that never persisted an audit', async () => {
    vi.mocked(listJobs).mockResolvedValue([
      { jobId: 'j-1', status: 'failed', createdAt: new Date('2026-09-03T08:00:00.000Z') },
    ] as never);

    const { body } = await handle();
    expect(body.rows).toEqual([]);
    expect(getAuditManualFields).not.toHaveBeenCalled();
  });

  it('sorts every row newest-first across sources, with timestampless rows last', async () => {
    vi.mocked(listOutreachReviewDrafts).mockResolvedValue({
      rows: [
        {
          draftId: 'd-1',
          threadId: 't-1',
          candidateId: 'c-1',
          hotelName: 'Ancien',
          touch: 1,
          language: 'fr',
          touch1EvidenceSlot: null,
          hasProviderDraft: true,
          createdAt: new Date('2026-08-01T08:00:00.000Z'),
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    } as never);
    vi.mocked(listRepliesNeedingReview).mockResolvedValue({
      rows: [
        {
          threadId: 't-2',
          candidateId: 'c-2',
          hotelName: 'Récent',
          domain: 'example.com',
          language: 'fr',
          state: 'replied',
          currentTouch: 1,
          reviewReason: 'ambiguous',
          reviewDetectedAt: new Date('2026-09-10T08:00:00.000Z'),
          lastSyncedAt: null,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    } as never);
    vi.mocked(listOperatorProspects).mockResolvedValue({
      rows: [{ candidateId: 'c-3', name: 'Sans date' }],
      total: 1,
      limit: 50,
      offset: 0,
      selection: null,
      selectedCount: 0,
      catalogueTotal: 1,
    } as never);

    const { body } = await handle();
    expect(body.rows.map((row) => (row as { subject: string }).subject)).toEqual([
      'Récent',
      'Ancien',
      'Sans date',
    ]);
  });
});
