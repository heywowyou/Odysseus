import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  getHotelCandidate: vi.fn(),
  getProspectScoreDiffView: vi.fn(),
  getProspectEvidenceAssetSource: vi.fn(),
}));

vi.mock('@odysseus/scanner', () => ({
  getPrescansRoot: vi.fn(() => '/prescans'),
  buildArtifactBucketKey: vi.fn(
    (hostname: string, startedAt: Date, relativePath: string) => `${hostname}/${relativePath}`,
  ),
}));

vi.mock('../artifacts/resolve-artifact.js', () => ({
  resolveArtifactFile: vi.fn(),
}));

vi.mock('../artifacts/configured-artifact-store.js', () => ({
  createConfiguredArtifactStore: vi.fn(() => ({ configured: true })),
}));

import { createHash } from 'node:crypto';
import {
  getHotelCandidate,
  getProspectEvidenceAssetSource,
  getProspectScoreDiffView,
  type OperatorEvidenceAssetSource,
  type OperatorScoreDiffView,
  type OperatorScoreView,
} from '@odysseus/store';
import { Router } from '../router.js';
import { resolveArtifactFile } from '../artifacts/resolve-artifact.js';
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

const scoreView: OperatorScoreView = {
  scoreId: 'score-1',
  candidateId: 'cand-1',
  name: 'Hotel Exemple',
  commune: 'GRENOBLE',
  postcode: '38000',
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

const assetSource: OperatorEvidenceAssetSource = {
  prescanId: 'prescan-1',
  domain: 'hotel-exemple.fr',
  startedAt: new Date('2026-08-29T10:00:00.000Z'),
  artifactsDir: 'hotel-exemple.fr/20260829T100000Z',
  ref: `evidence/${'a'.repeat(64)}.png`,
  sha256: createHash('sha256').update('png-bytes').digest('hex'),
  mimeType: 'image/png',
  byteSize: 9,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getHotelCandidate).mockResolvedValue({ candidateId: 'cand-1' } as never);
  vi.mocked(getProspectEvidenceAssetSource).mockResolvedValue(assetSource);
  vi.mocked(resolveArtifactFile).mockResolvedValue(Buffer.from('png-bytes', 'utf-8'));
  vi.mocked(getProspectScoreDiffView).mockResolvedValue(diffView);
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

describe('GET /api/prospects/:candidateId/evidence/assets/:slot (issue #92)', () => {
  it('serves the captured bytes as sandboxed png with no shared caching', async () => {
    const router = new Router();
    registerProspectInsightRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(fakeReq('/api/prospects/cand-1/evidence/assets/render-comparison'), res);

    expect(res.statusCode).toBe(200);
    expect(res.setHeader).toHaveBeenCalledWith('content-type', 'image/png');
    expect(res.setHeader).toHaveBeenCalledWith('x-content-type-options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('cache-control', 'private, no-store');
    expect((res.body as unknown as Buffer).toString('utf-8')).toBe('png-bytes');
    expect(resolveArtifactFile).toHaveBeenCalledWith(
      '/prescans/hotel-exemple.fr/20260829T100000Z/evidence/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
      'hotel-exemple.fr/evidence/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
      { configured: true },
    );
    expect(getProspectEvidenceAssetSource).toHaveBeenCalledWith(
      fakeConnection,
      'cand-1',
      'renderComparison',
    );
  });

  it('rejects an unknown slot name with 400 before reading the store', async () => {
    const { statusCode } = await handle('/api/prospects/cand-1/evidence/assets/homepage');
    expect(statusCode).toBe(400);
    expect(getProspectEvidenceAssetSource).not.toHaveBeenCalled();
  });

  it('returns 404 when the slot has no captured asset', async () => {
    vi.mocked(getProspectEvidenceAssetSource).mockResolvedValue(null);
    const { statusCode } = await handle('/api/prospects/cand-1/evidence/assets/specific-failure');
    expect(statusCode).toBe(404);
  });

  it('returns 404 when the bytes cannot be resolved locally or from the bucket', async () => {
    vi.mocked(resolveArtifactFile).mockRejectedValue(new Error('not found'));
    const { statusCode } = await handle('/api/prospects/cand-1/evidence/assets/render-comparison');
    expect(statusCode).toBe(404);
  });

  it('answers 409 when the served bytes fail their sha256 provenance check', async () => {
    vi.mocked(resolveArtifactFile).mockResolvedValue(Buffer.from('tampered', 'utf-8'));
    const { statusCode } = await handle('/api/prospects/cand-1/evidence/assets/render-comparison');
    expect(statusCode).toBe(409);
  });
});

describe('response leak scan', () => {
  it('never carries preview token hashes or object keys in any body', async () => {
    const urls = ['/api/prospects/cand-1/score/diff?from=v1&to=v2'];
    for (const url of urls) {
      const { body } = await handle(url);
      expect(body, url).toBeDefined();
      expect(body, url).not.toContain('tokenHash');
      expect(body, url).not.toContain('objectKey');
    }
  });
});
