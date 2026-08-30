import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  getHotelCandidate: vi.fn(),
  getProspectPrescanView: vi.fn(),
  getProspectScoreView: vi.fn(),
  getProspectScoreDiffView: vi.fn(),
  getProspectEvidenceView: vi.fn(),
  getProspectPreviewView: vi.fn(),
  getVendorFingerprintAggregate: vi.fn(),
}));

import {
  getHotelCandidate,
  getProspectEvidenceView,
  getProspectPreviewView,
  getProspectPrescanView,
  getProspectScoreDiffView,
  getProspectScoreView,
  getVendorFingerprintAggregate,
  type OperatorEvidenceView,
  type OperatorPreviewView,
  type OperatorPrescanView,
  type OperatorScoreDiffView,
  type OperatorScoreView,
  type PrescanVendorAggregate,
} from '@odysseus/store';
import { CURRENT_PRESCAN_VERSION } from '../prospecting/hotel-prescan/prescan-hotels.js';
import { Router } from '../router.js';
import { registerProspectInsightRoutes } from './prospect-insights.js';

function fakeReq(url: string): IncomingMessage {
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

const prescanView: OperatorPrescanView = {
  prescanId: 'prescan-1',
  prescanVersion: 'v3',
  status: 'complete',
  domain: 'hotel-exemple.fr',
  startedAt: new Date('2026-08-29T10:00:00.000Z'),
  durationMs: 41_000,
  robotsTxtFound: true,
  absentRoles: [],
  evidenceStatus: 'complete',
  pages: [
    {
      role: 'homepage',
      httpStatus: 200,
      missingPercent: 2.5,
      rawTextLength: 9_000,
      renderedTextLength: 9_500,
      consoleErrorCount: 0,
      axe: {
        violationCount: 1,
        byImpact: { critical: 0, serious: 1, moderate: 0, minor: 0 },
        affectedElementCount: 2,
        ruleIds: ['color-contrast'],
      },
      metrics: null,
      bookingEvidenceKinds: ['booking-form'],
      skippedByRobots: false,
      durationMs: 12_000,
    },
  ],
};

const scoreView: OperatorScoreView = {
  scoreId: 'score-1',
  candidateId: 'cand-1',
  scoringVersion: 'hotel-outreach-v1',
  prescanId: 'prescan-1',
  computedAt: new Date('2026-08-29T11:00:00.000Z'),
  worthy: true,
  evidenceComplete: true,
  brokenness: {
    total: 12,
    components: [{ id: 'render-gap', points: 6, reason: 'render-gap-severe' }],
  },
  ability: {
    total: 3,
    components: [{ id: 'direct-booking', points: 3, reason: 'booking-offsite-only' }],
  },
};

const diffView: OperatorScoreDiffView = {
  candidateId: 'cand-1',
  fromVersion: 'v1',
  toVersion: 'v2',
  from: scoreView,
  to: { ...scoreView, scoringVersion: 'v2', brokenness: { total: 9, components: [] } },
  brokennessDelta: -3,
  abilityDelta: 0,
};

const evidenceView: OperatorEvidenceView = {
  prescanId: 'prescan-1',
  evidenceStatus: 'complete',
  renderComparison: {
    state: 'captured',
    pageRole: 'homepage',
    selectionReason: 'material-render-gap',
    byteSize: 204_800,
    width: 1280,
    height: 720,
  },
  specificFailure: { state: 'omitted', reason: 'no-eligible-failure' },
  summaries: [],
};

const previewView: OperatorPreviewView = {
  previewId: 'preview-1',
  domain: 'hotel-exemple.fr',
  language: 'fr',
  status: 'live',
  publishedAt: new Date('2026-08-29T12:00:00.000Z'),
  publicExpiresAt: new Date('2026-09-28T12:00:00.000Z'),
  revokedAt: null,
  revokedReason: null,
  prescanVersion: 'v3',
  evidenceVersion: '1',
  previewContentVersion: 'v1',
};

const vendorAggregate: PrescanVendorAggregate = {
  prescanVersion: CURRENT_PRESCAN_VERSION,
  prescansRead: 40,
  minimumGroupSize: 5,
  bookingHosts: [{ value: 'booking.example.com', hotels: 12 }],
  bookingMechanisms: [{ value: 'booking-form', hotels: 30 }],
  failureRules: [{ value: 'color-contrast', hotels: 8 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getHotelCandidate).mockResolvedValue({ candidateId: 'cand-1' } as never);
  vi.mocked(getProspectPrescanView).mockResolvedValue(prescanView);
  vi.mocked(getProspectScoreView).mockResolvedValue(scoreView);
  vi.mocked(getProspectScoreDiffView).mockResolvedValue(diffView);
  vi.mocked(getProspectEvidenceView).mockResolvedValue(evidenceView);
  vi.mocked(getProspectPreviewView).mockResolvedValue(previewView);
  vi.mocked(getVendorFingerprintAggregate).mockResolvedValue(vendorAggregate);
});

async function handle(url: string): Promise<{
  statusCode: number;
  body: string | undefined;
}> {
  const router = new Router();
  registerProspectInsightRoutes(router, fakeConnection);
  const res = fakeRes();
  await router.handle(fakeReq(url), res);
  return { statusCode: res.statusCode, body: res.body };
}

describe('GET /api/prospects/:candidateId/prescan', () => {
  it('returns the store prescan projection unchanged', async () => {
    const { statusCode, body } = await handle('/api/prospects/cand-1/prescan');
    expect(statusCode).toBe(200);
    expect(JSON.parse(body ?? '{}')).toEqual({
      ...prescanView,
      startedAt: prescanView.startedAt.toISOString(),
    });
    expect(getProspectPrescanView).toHaveBeenCalledWith(fakeConnection, 'cand-1');
  });

  it('returns 404 when the candidate has no prescan', async () => {
    vi.mocked(getProspectPrescanView).mockResolvedValue(null);
    const { statusCode } = await handle('/api/prospects/cand-1/prescan');
    expect(statusCode).toBe(404);
  });

  it('rejects a malformed candidateId with 400', async () => {
    const { statusCode } = await handle('/api/prospects/%00/prescan');
    expect(statusCode).toBe(400);
  });
});

describe('GET /api/prospects/:candidateId/score', () => {
  it('returns the store score projection with its breakdown', async () => {
    const { statusCode, body } = await handle('/api/prospects/cand-1/score');
    expect(statusCode).toBe(200);
    const parsed = JSON.parse(body ?? '{}') as {
      brokenness: { total: number };
      ability: { total: number };
      scoringVersion: string;
    };
    expect(parsed.brokenness.total).toBe(scoreView.brokenness.total);
    expect(parsed.ability.total).toBe(scoreView.ability.total);
    expect(parsed.scoringVersion).toBe('hotel-outreach-v1');
    expect(parsed).toEqual({
      ...scoreView,
      computedAt: scoreView.computedAt.toISOString(),
    });
  });

  it('returns 404 when the candidate has no score', async () => {
    vi.mocked(getProspectScoreView).mockResolvedValue(null);
    const { statusCode } = await handle('/api/prospects/cand-1/score');
    expect(statusCode).toBe(404);
  });
});

describe('GET /api/prospects/:candidateId/score/diff', () => {
  it('diffs the two requested versions', async () => {
    const { statusCode, body } = await handle('/api/prospects/cand-1/score/diff?from=v1&to=v2');
    expect(statusCode).toBe(200);
    expect(getProspectScoreDiffView).toHaveBeenCalledWith(fakeConnection, 'cand-1', 'v1', 'v2');
    const parsed = JSON.parse(body ?? '{}') as { brokennessDelta: number | null };
    expect(parsed.brokennessDelta).toBe(-3);
  });

  it('rejects a missing or invalid from or to version with 400', async () => {
    expect((await handle('/api/prospects/cand-1/score/diff')).statusCode).toBe(400);
    expect((await handle('/api/prospects/cand-1/score/diff?from=v1')).statusCode).toBe(400);
    expect((await handle('/api/prospects/cand-1/score/diff?to=v2')).statusCode).toBe(400);
    expect((await handle('/api/prospects/cand-1/score/diff?from=%00&to=v2')).statusCode).toBe(400);
    expect((await handle('/api/prospects/cand-1/score/diff?from=v1&to=a%20b')).statusCode).toBe(
      400,
    );
    expect(getProspectScoreDiffView).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown candidate without diffing', async () => {
    vi.mocked(getHotelCandidate).mockResolvedValue(null);
    const { statusCode } = await handle('/api/prospects/nope/score/diff?from=v1&to=v2');
    expect(statusCode).toBe(404);
    expect(getProspectScoreDiffView).not.toHaveBeenCalled();
  });
});

describe('GET /api/prospects/:candidateId/evidence', () => {
  it('returns the two evidence assets as the store projects them', async () => {
    const { statusCode, body } = await handle('/api/prospects/cand-1/evidence');
    expect(statusCode).toBe(200);
    expect(JSON.parse(body ?? '{}')).toEqual(evidenceView);
  });

  it('returns 404 when no evidence exists', async () => {
    vi.mocked(getProspectEvidenceView).mockResolvedValue(null);
    const { statusCode } = await handle('/api/prospects/cand-1/evidence');
    expect(statusCode).toBe(404);
  });
});

describe('GET /api/prospects/:candidateId/preview', () => {
  it('returns preview status and dates', async () => {
    const { statusCode, body } = await handle('/api/prospects/cand-1/preview');
    expect(statusCode).toBe(200);
    expect(JSON.parse(body ?? '{}')).toEqual({
      ...previewView,
      publishedAt: previewView.publishedAt.toISOString(),
      publicExpiresAt: previewView.publicExpiresAt.toISOString(),
    });
  });

  it('returns 404 when no preview exists', async () => {
    vi.mocked(getProspectPreviewView).mockResolvedValue(null);
    const { statusCode } = await handle('/api/prospects/cand-1/preview');
    expect(statusCode).toBe(404);
  });
});

describe('GET /api/vendors', () => {
  it('aggregates the pinned current prescan version by default', async () => {
    const { statusCode, body } = await handle('/api/vendors');
    expect(statusCode).toBe(200);
    expect(getVendorFingerprintAggregate).toHaveBeenCalledWith(
      fakeConnection,
      CURRENT_PRESCAN_VERSION,
      undefined,
    );
    expect(JSON.parse(body ?? '{}')).toEqual(vendorAggregate);
  });

  it('passes a validated minimumGroupSize override', async () => {
    const { statusCode } = await handle('/api/vendors?minimumGroupSize=10');
    expect(statusCode).toBe(200);
    expect(getVendorFingerprintAggregate).toHaveBeenCalledWith(
      fakeConnection,
      CURRENT_PRESCAN_VERSION,
      10,
    );
  });

  it('rejects a non-integer or non-positive group size with 400', async () => {
    expect((await handle('/api/vendors?minimumGroupSize=2.5')).statusCode).toBe(400);
    expect((await handle('/api/vendors?minimumGroupSize=0')).statusCode).toBe(400);
    expect((await handle('/api/vendors?minimumGroupSize=-3')).statusCode).toBe(400);
    expect((await handle('/api/vendors?minimumGroupSize=lots')).statusCode).toBe(400);
    expect(getVendorFingerprintAggregate).not.toHaveBeenCalled();
  });

  it('rejects unknown query parameters with 400', async () => {
    expect((await handle('/api/vendors?version=v2')).statusCode).toBe(400);
    expect((await handle('/api/vendors?minimumGroupSize=5&extra=1')).statusCode).toBe(400);
    expect(getVendorFingerprintAggregate).not.toHaveBeenCalled();
  });
});

describe('response leak scan', () => {
  it('never carries preview token hashes or object keys in any body', async () => {
    const urls = [
      '/api/prospects/cand-1/prescan',
      '/api/prospects/cand-1/score',
      '/api/prospects/cand-1/score/diff?from=v1&to=v2',
      '/api/prospects/cand-1/evidence',
      '/api/prospects/cand-1/preview',
      '/api/vendors',
    ];
    for (const url of urls) {
      const { body } = await handle(url);
      expect(body, url).toBeDefined();
      expect(body, url).not.toContain('tokenHash');
      expect(body, url).not.toContain('objectKey');
    }
  });
});
