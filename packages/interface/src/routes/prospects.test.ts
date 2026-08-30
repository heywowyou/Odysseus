import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  listOperatorProspects: vi.fn(),
  getOperatorProspect: vi.fn(),
  getProspectQualificationHistory: vi.fn(),
  recordHotelCandidateReview: vi.fn(),
}));

import {
  getOperatorProspect,
  getProspectQualificationHistory,
  listOperatorProspects,
  recordHotelCandidateReview,
} from '@odysseus/store';
import { Router } from '../router.js';
import { registerProspectRoutes } from './prospects.js';

type Method = 'GET' | 'POST';

interface FakeReqOptions {
  method?: Method;
  body?: unknown;
  headers?: Record<string, string>;
}

function fakeReq(url: string, options: FakeReqOptions = {}): IncomingMessage {
  const { method = 'GET', body, headers } = options;
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Readable.from(payload) as unknown as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers =
    headers ??
    (body === undefined ? {} : { 'content-type': 'application/json', 'content-length': '1' });
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

function makeDetail(): Record<string, unknown> {
  // Every key of OperatorProspectDetail (packages/store/src/operator-views.ts),
  // populated just enough to prove pass-through composition.
  return {
    candidateId: 'cand-1',
    resolutionVersion: 'r1',
    identityKey: 'key-1',
    identityStatus: 'needs-review',
    matchedOn: { kind: 'name-postcode', value: 'hotel exemple 75001' },
    siret: '12345678900011',
    siren: '123456789',
    name: 'Hotel Exemple',
    commune: 'Paris',
    postcode: '75001',
    starRating: 3,
    roomCount: 40,
    capacity: 80,
    campaignEligibility: 'eligible',
    groupStatus: 'independent',
    groupDomain: null,
    groupSize: null,
    ownRegistrableDomain: 'hotel-exemple.fr',
    domainProvenance: 'declared',
    declaredRegistrableDomain: 'hotel-exemple.fr',
    reviewState: 'pending',
    review: { queuedReason: 'identity-needs-review', actor: null, reason: null, decidedAt: null },
    qualificationOutcome: 'qualified',
    prescanStatus: 'complete',
    websites: [
      {
        raw: 'https://hotel-exemple.fr',
        kind: 'own-domain',
        hostname: 'hotel-exemple.fr',
        registrableDomain: 'hotel-exemple.fr',
        unusableReason: null,
      },
    ],
    conflicts: [
      {
        kind: 'own-domain-disagreement',
        detail: 'two declared domains',
        candidateIds: ['cand-1', 'cand-2'],
      },
    ],
    sourceRefs: [
      { source: 'atout-france', sourceId: 'af-1', sourceVersion: 'v1', ingestRunId: 'run-1' },
    ],
    qualification: {
      qualificationId: 'q-1',
      qualificationVersion: 'v1',
      domain: 'hotel-exemple.fr',
      outcome: 'qualified',
      reasons: ['three-stars-or-more'],
      notes: [],
      sireneStatus: 'active',
      effectifBandCode: '12',
      evaluatedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    prescan: null,
    evidence: null,
    score: null,
    contact: {
      contactId: 'ct-1',
      contactVersion: 'v1',
      cohortId: 'co-1',
      domain: 'hotel-exemple.fr',
      state: 'found',
      reason: 'published role address',
      mxStatus: 'deliverable',
      sourceKind: 'contact-page',
      validatedAt: new Date('2026-08-02T00:00:00.000Z'),
    },
    thread: null,
    preview: null,
    outcomes: { rows: [], total: 0, limit: 10, offset: 0 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listOperatorProspects).mockResolvedValue({
    rows: [],
    total: 0,
    limit: 50,
    offset: 0,
  } as never);
  vi.mocked(getOperatorProspect).mockResolvedValue(makeDetail() as never);
  vi.mocked(getProspectQualificationHistory).mockResolvedValue({
    rows: [],
    total: 0,
    limit: 10,
    offset: 0,
  } as never);
  vi.mocked(recordHotelCandidateReview).mockResolvedValue({ changed: true, found: true } as never);
});

async function handle(url: string, options: FakeReqOptions = {}) {
  const router = new Router();
  registerProspectRoutes(router, fakeConnection);
  const res = fakeRes();
  await router.handle(fakeReq(url, options), res);
  return res;
}

describe('GET /api/prospects', () => {
  it('passes queue, filters, and paging through to the store', async () => {
    const res = await handle(
      '/api/prospects?queue=join-review&identityStatus=resolved&reviewState=pending&qualificationOutcome=not-evaluated&limit=10&offset=20',
    );
    expect(res.statusCode).toBe(200);
    expect(listOperatorProspects).toHaveBeenCalledWith(fakeConnection, {
      queue: 'join-review',
      identityStatus: 'resolved',
      reviewState: 'pending',
      qualificationOutcome: 'not-evaluated',
      limit: 10,
      offset: 20,
    });
    expect(JSON.parse(res.body ?? '{}')).toEqual({ rows: [], total: 0, limit: 50, offset: 0 });
  });

  it('treats queue=all as no queue constraint', async () => {
    await handle('/api/prospects?queue=all');
    expect(vi.mocked(listOperatorProspects).mock.calls[0]?.[1]).toEqual({});
  });

  it.each([
    ['queue=does-not-exist', /queue/],
    ['identityStatus=banana', /identityStatus/],
    ['groupStatus=banana', /groupStatus/],
    ['reviewState=banana', /reviewState/],
    ['qualificationOutcome=banana', /qualificationOutcome/],
    ['campaignEligibility=banana', /campaignEligibility/],
    ['resolutionVersion=', /resolutionVersion/],
    ['limit=0', /limit/],
    ['limit=-3', /limit/],
    ['limit=2.5', /limit/],
    ['limit=ten', /limit/],
    ['offset=-1', /offset/],
    ['offset=1.5', /offset/],
  ])('rejects %s with 400 and never reaches the store', async (queryString, pattern) => {
    const res = await handle(`/api/prospects?${queryString}`);
    expect(res.statusCode).toBe(400);
    expect(res.body ?? '').toMatch(pattern as RegExp);
    expect(listOperatorProspects).not.toHaveBeenCalled();
  });
});

describe('GET /api/prospects/:candidateId', () => {
  it('composes the detail and the qualification history into one payload', async () => {
    const res = await handle('/api/prospects/cand-1');
    expect(res.statusCode).toBe(200);
    expect(getOperatorProspect).toHaveBeenCalledWith(fakeConnection, 'cand-1');
    expect(getProspectQualificationHistory).toHaveBeenCalledWith(fakeConnection, 'cand-1', {
      limit: 10,
      offset: 0,
    });
    const body = JSON.parse(res.body ?? '{}');
    expect(body.candidateId).toBe('cand-1');
    expect(body.conflicts).toHaveLength(1);
    expect(body.contact.state).toBe('found');
    expect(body.qualificationHistory).toEqual({ rows: [], total: 0, limit: 10, offset: 0 });
  });

  it('returns 404 for an unknown candidateId', async () => {
    vi.mocked(getOperatorProspect).mockResolvedValue(null as never);
    const res = await handle('/api/prospects/missing');
    expect(res.statusCode).toBe(404);
    expect(getProspectQualificationHistory).not.toHaveBeenCalled();
  });

  it('rejects a malformed candidateId with 400', async () => {
    const res = await handle('/api/prospects/bad%0Aid');
    expect(res.statusCode).toBe(400);
    expect(getOperatorProspect).not.toHaveBeenCalled();
  });

  it('never carries contact-address, message-body, or hash fields', async () => {
    const res = await handle('/api/prospects/cand-1');
    const body = JSON.parse(res.body ?? '{}') as Record<string, unknown>;
    // The route may add qualificationHistory and nothing else.
    expect(Object.keys(body).sort()).toEqual(
      [...Object.keys(makeDetail()), 'qualificationHistory'].sort(),
    );
    const serialized = res.body ?? '';
    for (const forbidden of [
      'address',
      'localPart',
      'sourceUrl',
      'tokenHash',
      'subject',
      'body',
      'siteFacts',
    ]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });
});

describe('POST /api/prospects/:candidateId/review', () => {
  it('records an accept through the store helper', async () => {
    const res = await handle('/api/prospects/cand-1/review', {
      method: 'POST',
      body: { action: 'accept' },
    });
    expect(res.statusCode).toBe(200);
    expect(recordHotelCandidateReview).toHaveBeenCalledWith(fakeConnection, {
      candidateId: 'cand-1',
      decision: 'accepted',
      actor: 'dashboard',
      reason: 'dashboard-review',
    });
    expect(JSON.parse(res.body ?? '{}')).toEqual({
      candidateId: 'cand-1',
      reviewState: 'accepted',
      changed: true,
    });
  });

  it('records a reject with the operator reason', async () => {
    await handle('/api/prospects/cand-1/review', {
      method: 'POST',
      body: { action: 'reject', reason: 'wrong establishment' },
    });
    expect(recordHotelCandidateReview).toHaveBeenCalledWith(fakeConnection, {
      candidateId: 'cand-1',
      decision: 'rejected',
      actor: 'dashboard',
      reason: 'wrong establishment',
    });
  });

  it('is idempotent: a repeat decision is 200 with changed false', async () => {
    vi.mocked(recordHotelCandidateReview).mockResolvedValue({
      changed: false,
      found: true,
    } as never);
    const res = await handle('/api/prospects/cand-1/review', {
      method: 'POST',
      body: { action: 'accept' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}').changed).toBe(false);
  });

  it('returns 404 when no candidate carries the id', async () => {
    vi.mocked(recordHotelCandidateReview).mockResolvedValue({
      changed: false,
      found: false,
    } as never);
    const res = await handle('/api/prospects/missing/review', {
      method: 'POST',
      body: { action: 'accept' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an unknown action with 400 and never reaches the store', async () => {
    const res = await handle('/api/prospects/cand-1/review', {
      method: 'POST',
      body: { action: 'send' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body ?? '').toMatch(/action/);
    expect(recordHotelCandidateReview).not.toHaveBeenCalled();
  });

  it('rejects a non-object body and a non-string reason with 400', async () => {
    expect(
      (await handle('/api/prospects/cand-1/review', { method: 'POST', body: [1] })).statusCode,
    ).toBe(400);
    expect(
      (
        await handle('/api/prospects/cand-1/review', {
          method: 'POST',
          body: { action: 'accept', reason: 42 },
        })
      ).statusCode,
    ).toBe(400);
    expect(recordHotelCandidateReview).not.toHaveBeenCalled();
  });

  it('enforces the router CSRF pattern: a cross-origin POST is 403', async () => {
    const res = await handle('/api/prospects/cand-1/review', {
      method: 'POST',
      body: { action: 'accept' },
      headers: {
        'content-type': 'application/json',
        'content-length': '1',
        origin: 'https://evil.example',
        host: '127.0.0.1:4310',
      },
    });
    expect(res.statusCode).toBe(403);
    expect(recordHotelCandidateReview).not.toHaveBeenCalled();
  });

  it('enforces the router CSRF pattern: a same-origin POST passes the origin check', async () => {
    const res = await handle('/api/prospects/cand-1/review', {
      method: 'POST',
      body: { action: 'accept' },
      headers: {
        'content-type': 'application/json',
        'content-length': '1',
        origin: 'http://127.0.0.1:4310',
        host: '127.0.0.1:4310',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(recordHotelCandidateReview).toHaveBeenCalledTimes(1);
  });

  it('rejects a body-bearing POST without the JSON content type with 415', async () => {
    const res = await handle('/api/prospects/cand-1/review', {
      method: 'POST',
      body: { action: 'accept' },
      headers: { 'content-type': 'text/plain', 'content-length': '1' },
    });
    expect(res.statusCode).toBe(415);
    expect(recordHotelCandidateReview).not.toHaveBeenCalled();
  });
});
