import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  addWaveRosterEntry: vi.fn(),
  findActiveScanJobForHost: vi.fn(),
  getHotelCandidate: vi.fn(),
  getLatestScoreCohort: vi.fn(),
  listOperatorProspects: vi.fn(),
  getOperatorProspect: vi.fn(),
  getProspectQualificationHistory: vi.fn(),
  recordHotelCandidateReview: vi.fn(),
  findOutreachThreadByCandidate: vi.fn(),
  getProspectPreviewView: vi.fn(),
  planOutreachFullScan: vi.fn(),
  createJob: vi.fn(),
  getOutreachAuditStatus: vi.fn(),
  listOutreachAudits: vi.fn(),
  getSeverityRollup: vi.fn(),
  getSelectionVerdict: vi.fn(),
  listRecentScoreCohorts: vi.fn(),
  listWaveRoster: vi.fn(),
  revokeWaveRosterEntry: vi.fn(),
}));

vi.mock('../outreach/draft-runtime.js', () => ({
  createTouchOneDraft: vi.fn(),
  createFollowUpForCandidate: vi.fn(),
}));

vi.mock('../outreach/configured-preview-publisher.js', () => ({
  createConfiguredPreviewPublisher: vi.fn(() => ({ configured: true })),
}));

vi.mock('../outreach/publish-preview.js', () => ({
  revokePreviewsForDomain: vi.fn(),
}));

vi.mock('../prospecting/hotel-scoring/score-on-demand.js', () => ({
  scoreHotelOnDemandForConnection: vi.fn(),
}));

import {
  addWaveRosterEntry,
  createJob,
  findActiveScanJobForHost,
  findOutreachThreadByCandidate,
  getHotelCandidate,
  getLatestScoreCohort,
  getOperatorProspect,
  getOutreachAuditStatus,
  listOutreachAudits,
  getProspectPreviewView,
  getProspectQualificationHistory,
  getSelectionVerdict,
  getSeverityRollup,
  listOperatorProspects,
  listRecentScoreCohorts,
  listWaveRoster,
  planOutreachFullScan,
  recordHotelCandidateReview,
  revokeWaveRosterEntry,
} from '@odysseus/store';
import { createFollowUpForCandidate, createTouchOneDraft } from '../outreach/draft-runtime.js';
import { createConfiguredPreviewPublisher } from '../outreach/configured-preview-publisher.js';
import { revokePreviewsForDomain } from '../outreach/publish-preview.js';
import { scoreHotelOnDemandForConnection } from '../prospecting/hotel-scoring/score-on-demand.js';
import { CURRENT_SCORING_VERSION } from '@odysseus/core';
import { CURRENT_PRESCAN_VERSION } from '../prospecting/hotel-prescan/prescan-hotels.js';
import { CURRENT_QUALIFICATION_VERSION } from '../prospecting/hotel-qualification/qualify-hotels.js';
import { CURRENT_RESOLUTION_VERSION } from '../prospecting/hotel-identity/resolve-hotels.js';
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
  vi.mocked(getProspectPreviewView).mockResolvedValue(null);
  vi.mocked(revokePreviewsForDomain).mockResolvedValue({
    revoked: 0,
    alreadyRevoked: 0,
  } as never);
  vi.mocked(planOutreachFullScan).mockResolvedValue({ refused: 'not-selected' } as never);
  vi.mocked(createJob).mockResolvedValue({ jobId: 'job-new-1' } as never);
  vi.mocked(getOutreachAuditStatus).mockResolvedValue({
    audit: null,
    runningJobId: null,
  } as never);
  vi.mocked(listOutreachAudits).mockResolvedValue([] as never);
  vi.mocked(listRecentScoreCohorts).mockResolvedValue([] as never);
  vi.mocked(findActiveScanJobForHost).mockResolvedValue(null as never);
  vi.mocked(getHotelCandidate).mockResolvedValue(null as never);
  vi.mocked(getLatestScoreCohort).mockResolvedValue(null as never);
  vi.mocked(listWaveRoster).mockResolvedValue([] as never);
  vi.mocked(getSeverityRollup).mockResolvedValue({
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  } as never);
  vi.mocked(getSelectionVerdict).mockResolvedValue({
    inSelection: false,
    source: null,
    rank: null,
    cohort: null,
  } as never);
  vi.mocked(scoreHotelOnDemandForConnection).mockResolvedValue({ outcome: 'scored' } as never);
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

  it('passes the search through trimmed', async () => {
    const res = await handle('/api/prospects?q=%20H%C3%B4tel%20Belv%C3%A9d%C3%A8re%20');
    expect(res.statusCode).toBe(200);
    expect(listOperatorProspects).toHaveBeenCalledWith(fakeConnection, {
      search: 'Hôtel Belvédère',
    });
  });

  it('treats a blank search as no search constraint', async () => {
    await handle('/api/prospects?q=%20%20');
    expect(vi.mocked(listOperatorProspects).mock.calls[0]?.[1]).toEqual({});
    await handle('/api/prospects?q=');
    expect(vi.mocked(listOperatorProspects).mock.calls[1]?.[1]).toEqual({});
  });

  it('rejects an oversized search with 400 and never reaches the store', async () => {
    const res = await handle(`/api/prospects?q=${'x'.repeat(101)}`);
    expect(res.statusCode).toBe(400);
    expect(res.body ?? '').toMatch(/q/);
    expect(listOperatorProspects).not.toHaveBeenCalled();
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

  it('carries the selection verdict computed by the store projection', async () => {
    vi.mocked(getSelectionVerdict).mockResolvedValue({
      inSelection: false,
      source: null,
      rank: null,
      cohort: null,
    });
    const res = await handle('/api/prospects/cand-1');
    const body = JSON.parse(res.body ?? '{}');
    expect(getSelectionVerdict).toHaveBeenCalledWith(fakeConnection, 'cand-1');
    expect(body.selectionVerdict).toEqual({
      inSelection: false,
      source: null,
      rank: null,
      cohort: null,
    });
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
    // The route may add qualificationHistory, outreachScan, the audit
    // summary, the running-scan id, the selection verdict, the plan 042
    // audit list, and the paid full-audit gate (issue #182), and nothing
    // else.
    expect(Object.keys(body).sort()).toEqual(
      [
        ...Object.keys(makeDetail()),
        'qualificationHistory',
        'outreachScan',
        'outreachAudit',
        'outreachScanJobId',
        'selectionVerdict',
        'outreachAudits',
        'fullAudit',
      ].sort(),
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

  it('carries the outreach-scan eligibility computed by the store plan', async () => {
    vi.mocked(planOutreachFullScan).mockResolvedValue({
      candidateId: 'cand-1',
      domain: 'hotel-exemple.fr',
      cohortId: 'co-1',
      scoringVersion: 'hotel-outreach-v1',
      authorizedBy: 'cohort',
    });
    const res = await handle('/api/prospects/cand-1');
    const body = JSON.parse(res.body ?? '{}');
    expect(body.outreachScan).toEqual({ canStart: true });
    expect(planOutreachFullScan).toHaveBeenCalledWith(fakeConnection, 'cand-1', {
      qualificationVersion: 'v3',
    });
  });

  it('joins severity totals onto the latest outreach audit and carries the running job id', async () => {
    vi.mocked(getOutreachAuditStatus).mockResolvedValue({
      audit: { auditId: 'audit-1', startedAt: new Date('2026-09-01T00:00:00.000Z') },
      runningJobId: 'job-running-1',
    } as never);
    vi.mocked(getSeverityRollup).mockResolvedValue({
      critical: 1,
      serious: 2,
      moderate: 3,
      minor: 4,
    } as never);
    const res = await handle('/api/prospects/cand-1');
    expect(res.statusCode).toBe(200);
    expect(getSeverityRollup).toHaveBeenCalledWith(fakeConnection, 'audit-1');
    const body = JSON.parse(res.body ?? '{}');
    expect(body.outreachAudit).toEqual({
      auditId: 'audit-1',
      startedAt: '2026-09-01T00:00:00.000Z',
      severityRollup: { critical: 1, serious: 2, moderate: 3, minor: 4 },
    });
    expect(body.outreachScanJobId).toBe('job-running-1');
  });

  it('answers a null audit summary without reading severity counts', async () => {
    vi.mocked(getOutreachAuditStatus).mockResolvedValue({
      audit: null,
      runningJobId: 'job-queued-1',
    } as never);
    const res = await handle('/api/prospects/cand-1');
    expect(res.statusCode).toBe(200);
    expect(getSeverityRollup).not.toHaveBeenCalled();
    const body = JSON.parse(res.body ?? '{}');
    expect(body.outreachAudit).toBeNull();
    expect(body.outreachScanJobId).toBe('job-queued-1');
  });

  it('exposes every outreach audit newest first as an additive sibling field (plan 042)', async () => {
    vi.mocked(listOutreachAudits).mockResolvedValue([
      {
        auditId: 'audit-2',
        startedAt: new Date('2026-09-10T00:00:00.000Z'),
        jobType: 'outreach-full-scan',
      },
      { auditId: 'audit-1', startedAt: new Date('2026-09-01T00:00:00.000Z'), jobType: null },
    ] as never);
    const res = await handle('/api/prospects/cand-1');
    expect(res.statusCode).toBe(200);
    expect(listOutreachAudits).toHaveBeenCalledWith(fakeConnection, 'cand-1');
    const body = JSON.parse(res.body ?? '{}');
    expect(body.outreachAudits).toEqual([
      { auditId: 'audit-2', startedAt: '2026-09-10T00:00:00.000Z', jobType: 'outreach-full-scan' },
      { auditId: 'audit-1', startedAt: '2026-09-01T00:00:00.000Z', jobType: null },
    ]);
    // The singular field the first hub slices read stays untouched.
    expect(body.outreachAudit).toBeDefined();
  });
});

describe('POST /api/prospects/:candidateId/outreach/full-scan', () => {
  it('creates the candidate-linked job with its provenance and no client-supplied domain', async () => {
    vi.mocked(planOutreachFullScan).mockResolvedValue({
      candidateId: 'cand-1',
      domain: 'hotel-exemple.fr',
      cohortId: 'co-1',
      scoringVersion: 'hotel-outreach-v1',
      authorizedBy: 'cohort',
    });
    const res = await handle('/api/prospects/cand-1/outreach/full-scan', {
      method: 'POST',
      body: {},
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body ?? '{}')).toEqual({ started: true, jobId: 'job-new-1' });
    expect(createJob).toHaveBeenCalledWith(fakeConnection, {
      type: 'outreach-full-scan',
      siteUrl: 'https://hotel-exemple.fr',
      options: {
        domain: 'hotel-exemple.fr',
        outreachCandidateId: 'cand-1',
        outreachCohortId: 'co-1',
        outreachScoringVersion: 'hotel-outreach-v1',
        outreachAuthorizedBy: 'cohort',
      },
    });
  });

  it('returns the typed refusal without creating a job', async () => {
    vi.mocked(planOutreachFullScan).mockResolvedValue({ refused: 'already-in-flight' } as never);
    const res = await handle('/api/prospects/cand-1/outreach/full-scan', {
      method: 'POST',
      body: {},
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}')).toEqual({
      started: false,
      refusal: 'already-in-flight',
    });
    expect(createJob).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown candidate', async () => {
    vi.mocked(planOutreachFullScan).mockResolvedValue({ refused: 'candidate-unknown' } as never);
    const res = await handle('/api/prospects/cand-1/outreach/full-scan', {
      method: 'POST',
      body: {},
    });
    expect(res.statusCode).toBe(404);
    expect(createJob).not.toHaveBeenCalled();
  });

  it('rejects a malformed candidateId with 400 and never plans', async () => {
    const res = await handle('/api/prospects/bad%0Aid/outreach/full-scan', {
      method: 'POST',
      body: {},
    });
    expect(res.statusCode).toBe(400);
    expect(planOutreachFullScan).not.toHaveBeenCalled();
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

describe('POST /api/prospects/:candidateId/outreach/draft', () => {
  // Since plan 037 the body must carry the one-time token of the already
  // published v2 preview; drafting never publishes as a side effect.
  it('returns 200 and the result when a draft is created', async () => {
    vi.mocked(createTouchOneDraft).mockResolvedValue({
      configured: true,
      created: true,
      draftId: 'draft-1',
    } as never);
    const res = await handle('/api/prospects/cand-1/outreach/draft', {
      method: 'POST',
      body: { previewToken: 'raw-one-time-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}')).toEqual({ created: true, draftId: 'draft-1' });
    expect(createTouchOneDraft).toHaveBeenCalledWith(
      fakeConnection,
      'cand-1',
      expect.objectContaining({ previewToken: 'raw-one-time-token' }),
    );
  });

  it('refuses without drafting when the body carries no preview token', async () => {
    const res = await handle('/api/prospects/cand-1/outreach/draft', {
      method: 'POST',
      body: {},
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}')).toEqual({
      created: false,
      refusal: 'preview-not-published',
    });
    expect(createTouchOneDraft).not.toHaveBeenCalled();
  });

  it('returns 200 with the refusal code when the orchestrator refuses', async () => {
    vi.mocked(createTouchOneDraft).mockResolvedValue({
      configured: true,
      created: false,
      refusal: 'draft-already-live',
    } as never);
    const res = await handle('/api/prospects/cand-1/outreach/draft', {
      method: 'POST',
      body: { previewToken: 'raw-one-time-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}')).toEqual({
      created: false,
      refusal: 'draft-already-live',
    });
  });

  it('returns 503 when no mailbox is configured', async () => {
    vi.mocked(createTouchOneDraft).mockResolvedValue({
      configured: false,
      refusal: 'no-mailbox-configured',
    } as never);
    const res = await handle('/api/prospects/cand-1/outreach/draft', {
      method: 'POST',
      body: { previewToken: 'raw-one-time-token' },
    });
    expect(res.statusCode).toBe(503);
  });
});

describe('POST /api/prospects/:candidateId/outreach/follow-up', () => {
  it('returns 404 when the candidate has no thread yet', async () => {
    vi.mocked(findOutreachThreadByCandidate).mockResolvedValue(null);
    const res = await handle('/api/prospects/cand-1/outreach/follow-up', {
      method: 'POST',
      body: {},
    });
    expect(res.statusCode).toBe(404);
    expect(createFollowUpForCandidate).not.toHaveBeenCalled();
  });

  it('returns 200 and the result when a follow-up is created', async () => {
    vi.mocked(findOutreachThreadByCandidate).mockResolvedValue({
      threadId: 'thread-1',
      state: 'e1-sent',
      currentTouch: 1,
    } as never);
    vi.mocked(createFollowUpForCandidate).mockResolvedValue({
      configured: true,
      created: true,
      draftId: 'draft-2',
    } as never);
    const res = await handle('/api/prospects/cand-1/outreach/follow-up', {
      method: 'POST',
      body: {},
    });
    expect(res.statusCode).toBe(200);
    expect(createFollowUpForCandidate).toHaveBeenCalledWith(fakeConnection, 'thread-1', {
      dryRun: false,
    });
  });

  it('returns 503 when no mailbox is configured', async () => {
    vi.mocked(findOutreachThreadByCandidate).mockResolvedValue({
      threadId: 'thread-1',
      state: 'e1-sent',
      currentTouch: 1,
    } as never);
    vi.mocked(createFollowUpForCandidate).mockResolvedValue({
      configured: false,
      refusal: 'no-mailbox-configured',
    } as never);
    const res = await handle('/api/prospects/cand-1/outreach/follow-up', {
      method: 'POST',
      body: {},
    });
    expect(res.statusCode).toBe(503);
  });
});

describe('POST /api/prospects/:candidateId/preview/revoke (issue #97)', () => {
  it('withdraws every live preview of the candidate domain through the shared function', async () => {
    vi.mocked(getProspectPreviewView).mockResolvedValue({
      previewId: 'preview-1',
      domain: 'hotel-exemple.fr',
    } as never);
    vi.mocked(revokePreviewsForDomain).mockResolvedValue({
      revoked: 2,
      alreadyRevoked: 0,
    } as never);
    const res = await handle('/api/prospects/cand-1/preview/revoke', {
      method: 'POST',
      body: {},
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}')).toEqual({ revoked: 2, alreadyRevoked: 0 });
    expect(revokePreviewsForDomain).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'hotel-exemple.fr', reason: 'operator request' }),
    );
  });

  it('answers 404 when the candidate has no preview at all', async () => {
    vi.mocked(getProspectPreviewView).mockResolvedValue(null);
    const res = await handle('/api/prospects/cand-1/preview/revoke', {
      method: 'POST',
      body: {},
    });

    expect(res.statusCode).toBe(404);
    expect(revokePreviewsForDomain).not.toHaveBeenCalled();
  });

  it('answers 503 when the preview bucket is not configured', async () => {
    vi.mocked(getProspectPreviewView).mockResolvedValue({
      previewId: 'preview-1',
      domain: 'hotel-exemple.fr',
    } as never);
    vi.mocked(createConfiguredPreviewPublisher).mockImplementationOnce(() => {
      throw new Error('ODYSSEUS_PREVIEW_BUCKET_NAME is not set');
    });
    const res = await handle('/api/prospects/cand-1/preview/revoke', {
      method: 'POST',
      body: {},
    });

    expect(res.statusCode).toBe(503);
    expect(revokePreviewsForDomain).not.toHaveBeenCalled();
  });
});

describe('POST /api/prospects/:candidateId/wave (plan 043 slice 1)', () => {
  it('adds through the store helper with the dashboard actor, then scores the hotel', async () => {
    vi.mocked(addWaveRosterEntry).mockResolvedValue({
      added: true,
      entryId: 'entry-1',
      candidateId: 'cand-1',
      domain: 'hotel-exemple.fr',
    } as never);
    const res = await handle('/api/prospects/cand-1/wave', {
      method: 'POST',
      body: { wave: 'wave-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(addWaveRosterEntry).toHaveBeenCalledWith(fakeConnection, {
      wave: 'wave-1',
      candidateId: 'cand-1',
      scoringVersion: CURRENT_SCORING_VERSION,
      actor: 'dashboard',
    });
    // Issue #199: the add action scores the hotel it just added, so the
    // score columns do not stay empty for a hand-picked hotel.
    expect(scoreHotelOnDemandForConnection).toHaveBeenCalledWith(
      fakeConnection,
      'hotel-exemple.fr',
    );
    expect(JSON.parse(res.body ?? '{}')).toEqual({
      added: true,
      wave: 'wave-1',
      candidateId: 'cand-1',
      domain: 'hotel-exemple.fr',
      scoring: { outcome: 'scored' },
    });
  });

  it('carries a typed scoring skip in the added body', async () => {
    vi.mocked(addWaveRosterEntry).mockResolvedValue({
      added: true,
      entryId: 'entry-2',
      candidateId: 'cand-2',
      domain: 'hotel-hors-population.fr',
    } as never);
    vi.mocked(scoreHotelOnDemandForConnection).mockResolvedValue({
      outcome: 'skipped',
      reason: 'not-in-scoring-population',
    } as never);
    const res = await handle('/api/prospects/cand-2/wave', {
      method: 'POST',
      body: { wave: 'wave-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}')).toEqual({
      added: true,
      wave: 'wave-1',
      candidateId: 'cand-2',
      domain: 'hotel-hors-population.fr',
      scoring: { outcome: 'skipped', reason: 'not-in-scoring-population' },
    });
  });

  it('does not score when the store refuses the add', async () => {
    vi.mocked(addWaveRosterEntry).mockResolvedValue({
      added: false,
      refused: 'already-on-roster',
    } as never);
    const res = await handle('/api/prospects/cand-1/wave', {
      method: 'POST',
      body: { wave: 'wave-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(scoreHotelOnDemandForConnection).not.toHaveBeenCalled();
    expect(JSON.parse(res.body ?? '{}')).toEqual({ added: false, refusal: 'already-on-roster' });
  });

  it('rejects a blank or control-character wave name', async () => {
    const blank = await handle('/api/prospects/cand-1/wave', {
      method: 'POST',
      body: { wave: '   ' },
    });
    expect(blank.statusCode).toBe(400);

    const control = await handle('/api/prospects/cand-1/wave', {
      method: 'POST',
      body: { wave: 'wave\n1' },
    });
    expect(control.statusCode).toBe(400);
  });

  it('revokes through the store helper and answers refusals the same way', async () => {
    vi.mocked(revokeWaveRosterEntry).mockResolvedValue({
      revoked: true,
      entryId: 'entry-1',
      candidateId: 'cand-1',
    } as never);
    const res = await handle('/api/prospects/cand-1/wave/remove', {
      method: 'POST',
      body: { wave: 'wave-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(revokeWaveRosterEntry).toHaveBeenCalledWith(fakeConnection, {
      wave: 'wave-1',
      candidateId: 'cand-1',
      actor: 'dashboard',
    });
    expect(JSON.parse(res.body ?? '{}')).toEqual({
      revoked: true,
      wave: 'wave-1',
      candidateId: 'cand-1',
    });

    vi.mocked(revokeWaveRosterEntry).mockResolvedValue({
      revoked: false,
      refused: 'not-on-roster',
    } as never);
    const refused = await handle('/api/prospects/cand-1/wave/remove', {
      method: 'POST',
      body: { wave: 'wave-1' },
    });
    expect(refused.statusCode).toBe(200);
    expect(JSON.parse(refused.body ?? '{}')).toEqual({ revoked: false, refusal: 'not-on-roster' });
  });
});

describe('GET /api/selection (plan 043 slice 1)', () => {
  it('composes the recent cohorts and the active roster', async () => {
    vi.mocked(listRecentScoreCohorts).mockResolvedValue([
      {
        cohortId: 'cohort-1',
        scoringVersion: 'hotel-outreach-v1',
        approved: true,
        computedAt: new Date('2026-09-08T00:00:00.000Z'),
        populationSize: 42,
        selectedCount: 6,
        abilityCutoff: 60,
        brokennessCutoff: 40,
      },
    ] as never);
    vi.mocked(listWaveRoster).mockResolvedValue([
      {
        entryId: 'entry-1',
        wave: 'wave-1',
        candidateId: 'cand-7',
        domain: 'hotel-extra.fr',
        scoringVersion: 'hotel-outreach-v1',
        actor: 'dashboard',
        state: 'active',
        decidedAt: new Date('2026-09-09T00:00:00.000Z'),
      },
    ] as never);
    const res = await handle('/api/selection');
    expect(res.statusCode).toBe(200);
    expect(listWaveRoster).toHaveBeenCalledWith(fakeConnection, {});
    const body = JSON.parse(res.body ?? '{}');
    expect(body.cohorts).toHaveLength(1);
    expect(body.cohorts[0]).toMatchObject({ cohortId: 'cohort-1', selectedCount: 6 });
    expect(body.roster).toHaveLength(1);
    expect(body.roster[0]).toMatchObject({ wave: 'wave-1', domain: 'hotel-extra.fr' });
  });
});

describe('POST /api/prospects/:candidateId/full-audit (plan 044)', () => {
  it('mints a paid full-audit job carrying the candidate link and selection context', async () => {
    vi.mocked(getHotelCandidate).mockResolvedValue({
      candidateId: 'cand-1',
      ownRegistrableDomain: 'hotel-exemple.fr',
    } as never);
    vi.mocked(getLatestScoreCohort).mockResolvedValue({
      cohortId: 'cohort-1',
      scoringVersion: 'hotel-outreach-v1',
    } as never);
    const res = await handle('/api/prospects/cand-1/full-audit', { method: 'POST' });
    expect(res.statusCode).toBe(201);
    expect(createJob).toHaveBeenCalledWith(fakeConnection, {
      type: 'full-audit',
      siteUrl: 'https://hotel-exemple.fr',
      options: {
        outreachCandidateId: 'cand-1',
        outreachCohortId: 'cohort-1',
        outreachScoringVersion: 'hotel-outreach-v1',
        outreachAuthorizedBy: 'paid',
      },
    });
    expect(JSON.parse(res.body ?? '{}')).toEqual({ started: true, jobId: 'job-new-1' });
  });

  it('answers the typed refusals as 200 bodies and unknown candidates as 404', async () => {
    vi.mocked(getHotelCandidate).mockResolvedValue({
      candidateId: 'cand-1',
      ownRegistrableDomain: null,
    } as never);
    const noDomain = await handle('/api/prospects/cand-1/full-audit', { method: 'POST' });
    expect(noDomain.statusCode).toBe(200);
    expect(JSON.parse(noDomain.body ?? '{}')).toEqual({ started: false, refusal: 'no-own-domain' });

    vi.mocked(getHotelCandidate).mockResolvedValue({
      candidateId: 'cand-1',
      ownRegistrableDomain: 'hotel-exemple.fr',
    } as never);
    vi.mocked(findActiveScanJobForHost).mockResolvedValue({ jobId: 'job-running' } as never);
    const inFlight = await handle('/api/prospects/cand-1/full-audit', { method: 'POST' });
    expect(JSON.parse(inFlight.body ?? '{}')).toEqual({
      started: false,
      refusal: 'already-in-flight',
    });
    expect(createJob).not.toHaveBeenCalled();

    vi.mocked(findActiveScanJobForHost).mockResolvedValue(null as never);
    vi.mocked(getLatestScoreCohort).mockResolvedValue(null as never);
    const noCohort = await handle('/api/prospects/cand-1/full-audit', { method: 'POST' });
    expect(JSON.parse(noCohort.body ?? '{}')).toEqual({ started: false, refusal: 'no-cohort' });

    vi.mocked(getHotelCandidate).mockResolvedValue(null as never);
    const unknown = await handle('/api/prospects/cand-unknown/full-audit', { method: 'POST' });
    expect(unknown.statusCode).toBe(404);
  });
});

describe('POST /api/prospects/:candidateId/prescan (issue #201)', () => {
  it('mints a domain-scoped hotel-prescan job for a hand-added hotel', async () => {
    vi.mocked(getHotelCandidate).mockResolvedValue({
      candidateId: 'cand-1',
      ownRegistrableDomain: 'hotel-exemple.fr',
    } as never);
    const res = await handle('/api/prospects/cand-1/prescan', { method: 'POST' });
    expect(res.statusCode).toBe(201);
    expect(createJob).toHaveBeenCalledWith(fakeConnection, {
      type: 'hotel-prescan',
      options: {
        resolutionVersion: CURRENT_RESOLUTION_VERSION,
        qualificationVersion: CURRENT_QUALIFICATION_VERSION,
        prescanVersion: CURRENT_PRESCAN_VERSION,
        domain: 'hotel-exemple.fr',
        maxPages: 1,
        concurrency: 1,
        rescan: false,
      },
    });
    expect(JSON.parse(res.body ?? '{}')).toEqual({ started: true, jobId: 'job-new-1' });
  });

  it('refuses a candidate with no own domain and 404s an unknown candidate', async () => {
    vi.mocked(getHotelCandidate).mockResolvedValue({
      candidateId: 'cand-1',
      ownRegistrableDomain: null,
    } as never);
    const noDomain = await handle('/api/prospects/cand-1/prescan', { method: 'POST' });
    expect(noDomain.statusCode).toBe(200);
    expect(JSON.parse(noDomain.body ?? '{}')).toEqual({
      started: false,
      refusal: 'no-own-domain',
    });
    expect(createJob).not.toHaveBeenCalled();

    vi.mocked(getHotelCandidate).mockResolvedValue(null as never);
    const unknown = await handle('/api/prospects/cand-unknown/prescan', { method: 'POST' });
    expect(unknown.statusCode).toBe(404);
  });

  it('rejects an implausible candidate id before touching the store', async () => {
    const res = await handle(`/api/prospects/${'x'.repeat(201)}/prescan`, { method: 'POST' });
    expect(res.statusCode).toBe(400);
    expect(getHotelCandidate).not.toHaveBeenCalled();
  });
});
