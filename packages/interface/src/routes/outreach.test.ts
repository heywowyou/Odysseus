import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  listOutreachReviewDrafts: vi.fn(),
  findOutreachDraftById: vi.fn(),
  getHotelCandidate: vi.fn(),
  recordOutreachDraftReview: vi.fn(),
  listRepliesNeedingReview: vi.fn(),
  findOutreachThreadById: vi.fn(),
  markOutreachThreadSynced: vi.fn(),
  isSuppressed: vi.fn(),
  getOutcomeSummary: vi.fn(),
  listOutreachOutcomes: vi.fn(),
  recordOutreachOutcome: vi.fn(),
  addSuppressionEntry: vi.fn(),
  listLivePreviewsForDomain: vi.fn(),
  revokeOutreachPreview: vi.fn(),
  closeOutreachThreadsForDomain: vi.fn(),
  createJob: vi.fn(),
}));

import {
  addSuppressionEntry,
  closeOutreachThreadsForDomain,
  createJob,
  findOutreachDraftById,
  findOutreachThreadById,
  getHotelCandidate,
  getOutcomeSummary,
  isSuppressed,
  listLivePreviewsForDomain,
  listOutreachOutcomes,
  listOutreachReviewDrafts,
  listRepliesNeedingReview,
  markOutreachThreadSynced,
  recordOutreachDraftReview,
  recordOutreachOutcome,
  revokeOutreachPreview,
  type HotelCandidateDocument,
  type OutreachDraftDocument,
} from '@odysseus/store';
import { Router } from '../router.js';
import type { JobQueue } from '../queue/job-queue.js';
import { registerOutreachRoutes } from './outreach.js';

const DRAFT_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const THREAD_ID = '9b2f8c60-7a1e-4c3d-9b2a-1f0e2d3c4b5a';

function fakeGetReq(url: string): IncomingMessage {
  const req = Readable.from([]) as unknown as IncomingMessage;
  req.method = 'GET';
  req.url = url;
  req.headers = {};
  return req;
}

function fakePostReq(url: string, body?: unknown): IncomingMessage {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const req = Readable.from(
    payload === '' ? [] : [Buffer.from(payload, 'utf-8')],
  ) as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = url;
  req.headers =
    payload === ''
      ? {}
      : {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(payload, 'utf-8')),
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
const fakeQueue = { notify: vi.fn(), requestCancel: vi.fn() } as unknown as JobQueue;

/** Registers the routes on a router that records every registered pattern
 *  alongside the real ones, so tests can assert what this module exposes
 *  without reaching into Router internals. */
function registerAndCapture(): { patterns: string[] } {
  const patterns: string[] = [];
  const router = new Router();
  for (const method of ['get', 'post', 'patch'] as const) {
    const original = router[method].bind(router);
    router[method] = ((pattern: string, handler: never) => {
      patterns.push(`${method.toUpperCase()} ${pattern}`);
      original(pattern, handler);
    }) as never;
  }
  registerOutreachRoutes(router, fakeConnection, fakeQueue);
  return { patterns };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/outreach/drafts', () => {
  it('pages with the limit and offset the query asks for', async () => {
    vi.mocked(listOutreachReviewDrafts).mockResolvedValue({
      rows: [
        {
          draftId: DRAFT_ID,
          threadId: THREAD_ID,
          candidateId: 'c-1',
          touch: 1,
          language: 'fr',
          touch1EvidenceSlot: null,
          hasProviderDraft: true,
          createdAt: new Date('2026-08-30T08:00:00.000Z'),
        },
      ],
      total: 11,
      limit: 5,
      offset: 10,
    });

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeGetReq('/api/outreach/drafts?limit=5&offset=10'), res);

    expect(res.statusCode).toBe(200);
    expect(listOutreachReviewDrafts).toHaveBeenCalledWith(fakeConnection, { limit: 5, offset: 10 });
    const body = JSON.parse(res.body ?? '{}');
    expect(body.total).toBe(11);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].draftId).toBe(DRAFT_ID);
  });

  it('falls back to the default page window when the query is empty', async () => {
    vi.mocked(listOutreachReviewDrafts).mockResolvedValue({
      rows: [],
      total: 0,
      limit: 50,
      offset: 0,
    });

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeGetReq('/api/outreach/drafts'), res);

    expect(listOutreachReviewDrafts).toHaveBeenCalledWith(fakeConnection, { limit: 50, offset: 0 });
    expect(JSON.parse(res.body ?? '{}').rows).toEqual([]);
  });
});

describe('GET /api/outreach/drafts/:draftId/text', () => {
  // Only the fields the text endpoint reads; the stored row carries more.
  const liveDraft = {
    draftId: DRAFT_ID,
    threadId: THREAD_ID,
    candidateId: 'c-1',
    touch: 2,
    language: 'fr',
    roleAddress: 'role@hotel-exemple.fr',
    subject: 'Objet du brouillon',
    body: 'Corps du brouillon',
    status: 'created',
    createdAt: new Date('2026-09-01T08:30:00.000Z'),
  } as unknown as OutreachDraftDocument;

  it('serves the exact persisted text of a live draft with the candidate name', async () => {
    vi.mocked(findOutreachDraftById).mockResolvedValue(liveDraft);
    vi.mocked(getHotelCandidate).mockResolvedValue({
      candidateId: 'c-1',
      name: 'Hôtel Exemple',
    } as unknown as HotelCandidateDocument);

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeGetReq(`/api/outreach/drafts/${DRAFT_ID}/text`), res);

    expect(res.statusCode).toBe(200);
    expect(findOutreachDraftById).toHaveBeenCalledWith(fakeConnection, DRAFT_ID);
    expect(getHotelCandidate).toHaveBeenCalledWith(fakeConnection, 'c-1');
    expect(JSON.parse(res.body ?? '{}')).toEqual({
      draftId: DRAFT_ID,
      threadId: THREAD_ID,
      candidateId: 'c-1',
      businessName: 'Hôtel Exemple',
      touch: 2,
      language: 'fr',
      recipient: 'role@hotel-exemple.fr',
      subject: 'Objet du brouillon',
      body: 'Corps du brouillon',
      createdAt: '2026-09-01T08:30:00.000Z',
    });
  });

  it('degrades businessName to null when the candidate row is gone', async () => {
    vi.mocked(findOutreachDraftById).mockResolvedValue(liveDraft);
    vi.mocked(getHotelCandidate).mockResolvedValue(null);

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeGetReq(`/api/outreach/drafts/${DRAFT_ID}/text`), res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}').businessName).toBeNull();
  });

  it('serves no text once the draft has left the live set', async () => {
    vi.mocked(findOutreachDraftById).mockResolvedValue({ ...liveDraft, status: 'deleted' });

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeGetReq(`/api/outreach/drafts/${DRAFT_ID}/text`), res);

    expect(res.statusCode).toBe(404);
    expect(getHotelCandidate).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown draft id', async () => {
    vi.mocked(findOutreachDraftById).mockResolvedValue(null);

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeGetReq(`/api/outreach/drafts/${DRAFT_ID}/text`), res);

    expect(res.statusCode).toBe(404);
  });

  it('rejects a malformed draft id with 400 and reads nothing', async () => {
    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeGetReq('/api/outreach/drafts/not-a-uuid/text'), res);

    expect(res.statusCode).toBe(400);
    expect(findOutreachDraftById).not.toHaveBeenCalled();
  });
});

describe('POST /api/outreach/drafts/:draftId/review', () => {
  it('persists the approved outcome on approve without any other store write', async () => {
    vi.mocked(findOutreachDraftById).mockResolvedValue({
      draftId: DRAFT_ID,
      status: 'created',
    } as never);
    vi.mocked(recordOutreachDraftReview).mockResolvedValue({ changed: true });

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(
      fakePostReq(`/api/outreach/drafts/${DRAFT_ID}/review`, { action: 'approve' }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(recordOutreachDraftReview).toHaveBeenCalledWith(fakeConnection, DRAFT_ID, 'approved');
    const body = JSON.parse(res.body ?? '{}');
    expect(body).toEqual({ draftId: DRAFT_ID, action: 'approve', changed: true });
  });

  it('persists the skipped outcome on skip, distinct from approve (issue #96)', async () => {
    vi.mocked(findOutreachDraftById).mockResolvedValue({
      draftId: DRAFT_ID,
      status: 'created',
    } as never);
    vi.mocked(recordOutreachDraftReview).mockResolvedValue({ changed: true });

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(
      fakePostReq(`/api/outreach/drafts/${DRAFT_ID}/review`, { action: 'skip' }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(recordOutreachDraftReview).toHaveBeenCalledWith(fakeConnection, DRAFT_ID, 'skipped');
    expect(JSON.parse(res.body ?? '{}').action).toBe('skip');
  });

  it('stays silent but succeeds on a repeat review of the same draft', async () => {
    vi.mocked(findOutreachDraftById).mockResolvedValue({
      draftId: DRAFT_ID,
      status: 'deleted',
    } as never);
    vi.mocked(recordOutreachDraftReview).mockResolvedValue({ changed: false });

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(
      fakePostReq(`/api/outreach/drafts/${DRAFT_ID}/review`, { action: 'approve' }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}').changed).toBe(false);
  });

  it('rejects an unknown action with 400 and never touches the draft', async () => {
    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(
      fakePostReq(`/api/outreach/drafts/${DRAFT_ID}/review`, { action: 'send' }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(findOutreachDraftById).not.toHaveBeenCalled();
    expect(recordOutreachDraftReview).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown draft', async () => {
    vi.mocked(findOutreachDraftById).mockResolvedValue(null);

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(
      fakePostReq(`/api/outreach/drafts/${DRAFT_ID}/review`, { action: 'approve' }),
      res,
    );

    expect(res.statusCode).toBe(404);
    expect(recordOutreachDraftReview).not.toHaveBeenCalled();
  });
});

describe('GET /api/outreach/replies', () => {
  it('returns metadata-only rows with exactly the review shape', async () => {
    vi.mocked(listRepliesNeedingReview).mockResolvedValue({
      rows: [
        {
          threadId: THREAD_ID,
          candidateId: 'c-1',
          domain: 'hotel-exemple.fr',
          language: 'fr',
          state: 'e1-sent',
          currentTouch: 1,
          reviewReason: 'unclassified-reply',
          reviewDetectedAt: new Date('2026-08-30T09:00:00.000Z'),
          lastSyncedAt: new Date('2026-08-30T09:00:00.000Z'),
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeGetReq('/api/outreach/replies'), res);

    expect(res.statusCode).toBe(200);
    const row = JSON.parse(res.body ?? '{}').rows[0];
    expect(Object.keys(row).sort()).toEqual(
      [
        'candidateId',
        'currentTouch',
        'domain',
        'language',
        'lastSyncedAt',
        'reviewDetectedAt',
        'reviewReason',
        'state',
        'threadId',
      ].sort(),
    );
  });
});

describe('POST /api/outreach/replies/:threadId/review', () => {
  it('clears the ambiguity flag through the sync transition helper', async () => {
    vi.mocked(findOutreachThreadById).mockResolvedValue({
      threadId: THREAD_ID,
      needsReview: { reason: 'unclassified-reply', detectedAt: new Date() },
    } as never);

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakePostReq(`/api/outreach/replies/${THREAD_ID}/review`), res);

    expect(res.statusCode).toBe(200);
    expect(markOutreachThreadSynced).toHaveBeenCalledWith(
      fakeConnection,
      THREAD_ID,
      expect.any(Date),
    );
  });

  it('returns 404 for an unknown thread', async () => {
    vi.mocked(findOutreachThreadById).mockResolvedValue(null);

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakePostReq(`/api/outreach/replies/${THREAD_ID}/review`), res);

    expect(res.statusCode).toBe(404);
    expect(markOutreachThreadSynced).not.toHaveBeenCalled();
  });
});

describe('POST /api/outreach/suppression-check', () => {
  it('reports a suppressed address', async () => {
    vi.mocked(isSuppressed).mockResolvedValue(true);

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(
      fakePostReq('/api/outreach/suppression-check', { address: 'Role@Hotel-Exemple.fr' }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(isSuppressed).toHaveBeenCalledWith(
      fakeConnection,
      'Hotel-Exemple.fr',
      'Role@Hotel-Exemple.fr',
    );
    expect(Object.keys(JSON.parse(res.body ?? '{}'))).toEqual(['suppressed']);
    expect(JSON.parse(res.body ?? '{}').suppressed).toBe(true);
  });

  it('reports a not-suppressed address', async () => {
    vi.mocked(isSuppressed).mockResolvedValue(false);

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(
      fakePostReq('/api/outreach/suppression-check', { address: 'someone@example.com' }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}').suppressed).toBe(false);
  });

  it('rejects a malformed address with 400 and checks nothing', async () => {
    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(
      fakePostReq('/api/outreach/suppression-check', { address: 'not-an-address' }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(isSuppressed).not.toHaveBeenCalled();
  });

  it('persists nothing: no suppression write helper is ever called', async () => {
    vi.mocked(isSuppressed).mockResolvedValue(false);

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(
      fakePostReq('/api/outreach/suppression-check', { address: 'someone@example.com' }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(addSuppressionEntry).not.toHaveBeenCalled();
  });
});

describe('GET /api/outreach/outcomes', () => {
  it('returns the aggregate summary and the newest event rows', async () => {
    vi.mocked(getOutcomeSummary).mockResolvedValue({
      total: 3,
      byOutcome: { 'no-reply': 2, won: 1 },
      byLostReason: {},
    });
    vi.mocked(listOutreachOutcomes).mockResolvedValue([
      {
        outcomeId: 'o-1',
        idempotencyKey: 'k-1',
        threadId: THREAD_ID,
        candidateId: 'c-1',
        outcome: 'won',
        actor: 'operator',
        recordedAt: new Date('2026-08-30T10:00:00.000Z'),
        expiresAt: new Date('2026-11-28T10:00:00.000Z'),
      },
    ]);

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakeGetReq('/api/outreach/outcomes?limit=50&offset=0'), res);

    expect(res.statusCode).toBe(200);
    expect(getOutcomeSummary).toHaveBeenCalledWith(fakeConnection);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.summary.total).toBe(3);
    expect(body.total).toBe(3);
    // Internal fields (idempotencyKey, expiresAt) stay out of the response.
    expect(Object.keys(body.rows[0]).sort()).toEqual(
      [
        'actor',
        'candidateId',
        'lostReason',
        'outcome',
        'outcomeId',
        'recordedAt',
        'threadId',
      ].sort(),
    );
  });
});

describe('POST /api/outreach/threads/:threadId/outcome', () => {
  it('records a categorical outcome through recordOutreachOutcome', async () => {
    vi.mocked(recordOutreachOutcome).mockResolvedValue({
      recorded: true,
      outcome: {
        outcomeId: 'o-1',
        threadId: THREAD_ID,
        candidateId: 'c-1',
        outcome: 'won',
        actor: 'operator',
        recordedAt: new Date('2026-08-30T10:00:00.000Z'),
      },
    } as never);

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(
      fakePostReq(`/api/outreach/threads/${THREAD_ID}/outcome`, { outcome: 'won' }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(recordOutreachOutcome).toHaveBeenCalledWith(
      fakeConnection,
      expect.objectContaining({ threadId: THREAD_ID, outcome: 'won', actor: 'operator' }),
    );
    expect(JSON.parse(res.body ?? '{}').recorded).toBe(true);
  });

  it('rejects an unknown outcome value with 400 and records nothing', async () => {
    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(
      fakePostReq(`/api/outreach/threads/${THREAD_ID}/outcome`, { outcome: 'maybe' }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(recordOutreachOutcome).not.toHaveBeenCalled();
  });

  it('rejects a lost reason outside the controlled vocabulary', async () => {
    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(
      fakePostReq(`/api/outreach/threads/${THREAD_ID}/outcome`, {
        outcome: 'lost',
        lostReason: 'vibes',
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(recordOutreachOutcome).not.toHaveBeenCalled();
  });

  it('rejects a lost reason on an outcome that is not lost', async () => {
    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(
      fakePostReq(`/api/outreach/threads/${THREAD_ID}/outcome`, {
        outcome: 'won',
        lostReason: 'budget',
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(recordOutreachOutcome).not.toHaveBeenCalled();
  });

  it('returns 404 when the thread is unknown', async () => {
    vi.mocked(recordOutreachOutcome).mockResolvedValue({
      recorded: false,
      reason: 'thread-unknown',
    });

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(
      fakePostReq(`/api/outreach/threads/${THREAD_ID}/outcome`, { outcome: 'won' }),
      res,
    );

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/outreach/threads/:threadId/opt-out', () => {
  // Only the fields this flow reads; the store document carries more.
  const thread = {
    threadId: THREAD_ID,
    domain: 'hotel-exemple.fr',
    roleAddress: 'role@hotel-exemple.fr',
    state: 'e1-sent',
  } as never;

  it('suppresses, revokes live previews, and closes threads in order', async () => {
    vi.mocked(findOutreachThreadById).mockResolvedValue(thread);
    vi.mocked(listLivePreviewsForDomain).mockResolvedValue([
      { previewId: 'p-1' },
      { previewId: 'p-2' },
    ] as never);
    vi.mocked(revokeOutreachPreview).mockResolvedValue({ changed: true, preview: null });
    vi.mocked(closeOutreachThreadsForDomain).mockResolvedValue({ closed: 1 });

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakePostReq(`/api/outreach/threads/${THREAD_ID}/opt-out`), res);

    expect(res.statusCode).toBe(200);
    expect(addSuppressionEntry).toHaveBeenCalledWith(
      fakeConnection,
      expect.objectContaining({ domain: 'hotel-exemple.fr', reasonCode: 'objection' }),
    );
    expect(revokeOutreachPreview).toHaveBeenCalledTimes(2);
    expect(closeOutreachThreadsForDomain).toHaveBeenCalledWith(
      fakeConnection,
      'hotel-exemple.fr',
      expect.any(String),
    );
    const body = JSON.parse(res.body ?? '{}');
    expect(body).toEqual({
      threadId: THREAD_ID,
      suppressed: true,
      previewsRevoked: 2,
      threadsClosed: 1,
    });
    // The role address never crosses the response boundary.
    expect(res.body).not.toContain('role@hotel-exemple.fr');
  });

  it('is idempotent: a repeat reaches the same end state with zero changes', async () => {
    vi.mocked(findOutreachThreadById).mockResolvedValue(thread);
    // First call finds two live previews, the repeat finds none left.
    vi.mocked(listLivePreviewsForDomain)
      .mockResolvedValueOnce([{ previewId: 'p-1' }, { previewId: 'p-2' }] as never)
      .mockResolvedValue([]);
    vi.mocked(revokeOutreachPreview).mockResolvedValue({ changed: true, preview: null });
    vi.mocked(closeOutreachThreadsForDomain)
      .mockResolvedValueOnce({ closed: 1 })
      .mockResolvedValue({ closed: 0 });

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const first = fakeRes();
    await router.handle(fakePostReq(`/api/outreach/threads/${THREAD_ID}/opt-out`), first);
    const repeat = fakeRes();
    await router.handle(fakePostReq(`/api/outreach/threads/${THREAD_ID}/opt-out`), repeat);

    expect(first.statusCode).toBe(200);
    expect(repeat.statusCode).toBe(200);
    expect(JSON.parse(repeat.body ?? '{}')).toEqual({
      threadId: THREAD_ID,
      suppressed: true,
      previewsRevoked: 0,
      threadsClosed: 0,
    });
  });

  it('returns 404 for an unknown thread and writes no suppression', async () => {
    vi.mocked(findOutreachThreadById).mockResolvedValue(null);

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakePostReq(`/api/outreach/threads/${THREAD_ID}/opt-out`), res);

    expect(res.statusCode).toBe(404);
    expect(addSuppressionEntry).not.toHaveBeenCalled();
    expect(listLivePreviewsForDomain).not.toHaveBeenCalled();
    expect(closeOutreachThreadsForDomain).not.toHaveBeenCalled();
  });
});

describe('POST /api/outreach/draft-batch', () => {
  it('enqueues an outreach-draft-batch job and notifies the queue', async () => {
    vi.mocked(createJob).mockResolvedValue({ jobId: 'job-1' } as never);

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(
      fakePostReq('/api/outreach/draft-batch', { limit: 5, language: 'en' }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(createJob).toHaveBeenCalledWith(fakeConnection, {
      type: 'outreach-draft-batch',
      options: { limit: 5, language: 'en' },
    });
    expect(fakeQueue.notify).toHaveBeenCalled();
    expect(JSON.parse(res.body ?? '{}')).toEqual({ jobId: 'job-1' });
  });

  it('rejects a missing or non-positive limit without creating a job', async () => {
    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakePostReq('/api/outreach/draft-batch', { limit: 0 }), res);

    expect(res.statusCode).toBe(400);
    expect(createJob).not.toHaveBeenCalled();
  });

  it('rejects an unsupported language', async () => {
    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(
      fakePostReq('/api/outreach/draft-batch', { limit: 5, language: 'de' }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(createJob).not.toHaveBeenCalled();
  });
});

describe('POST /api/outreach/followup-batch', () => {
  it('enqueues an outreach-followup-batch job and notifies the queue', async () => {
    vi.mocked(createJob).mockResolvedValue({ jobId: 'job-2' } as never);

    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakePostReq('/api/outreach/followup-batch', { limit: 3 }), res);

    expect(res.statusCode).toBe(201);
    expect(createJob).toHaveBeenCalledWith(fakeConnection, {
      type: 'outreach-followup-batch',
      options: { limit: 3 },
    });
    expect(fakeQueue.notify).toHaveBeenCalled();
    expect(JSON.parse(res.body ?? '{}')).toEqual({ jobId: 'job-2' });
  });

  it('rejects a missing or non-positive limit without creating a job', async () => {
    const router = new Router();
    registerOutreachRoutes(router, fakeConnection, fakeQueue);
    const res = fakeRes();
    await router.handle(fakePostReq('/api/outreach/followup-batch', {}), res);

    expect(res.statusCode).toBe(400);
    expect(createJob).not.toHaveBeenCalled();
  });
});

describe('registered route paths', () => {
  it('contains no send or deliver endpoint anywhere in the module', () => {
    const { patterns } = registerAndCapture();
    expect(patterns.length).toBeGreaterThanOrEqual(7);
    for (const pattern of patterns) {
      const path = pattern.split(' ')[1] ?? '';
      expect(path).toMatch(/^\/api\/outreach\//);
      expect(pattern).not.toMatch(/send|deliver/i);
    }
    expect(patterns).toContain('GET /api/outreach/drafts');
    expect(patterns).toContain('GET /api/outreach/replies');
    expect(patterns).toContain('GET /api/outreach/outcomes');
    expect(patterns).toContain('POST /api/outreach/suppression-check');
  });
});
