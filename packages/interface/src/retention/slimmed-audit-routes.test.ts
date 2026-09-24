import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Plan 077: every route that recomputes from raw scan evidence refuses an
// audit retention slimmed, before any pipeline work starts. The store is
// mocked to report the audit as slimmed; each pipeline entry point is a spy
// that must stay uncalled.

vi.mock('@odysseus/store', () => ({
  getAudit: vi.fn(),
  getAuditRuntimeFields: vi.fn(),
  getAuditSlimmedAt: vi.fn(),
  setAuditManualFields: vi.fn(),
  saveLinkedAuditIdentity: vi.fn(),
}));

vi.mock('@odysseus/scanner', () => ({
  buildAuditDir: vi.fn(() => '/tmp/fake-slimmed-audit'),
  buildArtifactBucketKey: vi.fn(() => 'irrelevant'),
  getArtifactsRoot: vi.fn(() => '/tmp'),
  readOdysseusBuildId: vi.fn(() => 'test-build'),
  ensureEnvLoaded: vi.fn(),
  findWorkspaceRoot: vi.fn(() => '/tmp'),
}));

vi.mock('../pipeline/make-report-ready.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pipeline/make-report-ready.js')>()),
  makeReportReady: vi.fn(),
}));
vi.mock('../pipeline/regenerate-reports.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pipeline/regenerate-reports.js')>()),
  runReportQualityForAudit: vi.fn(),
}));
vi.mock('../pipeline/regenerate-writing.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pipeline/regenerate-writing.js')>()),
  regenerateWriting: vi.fn(),
}));
vi.mock('../pipeline/generate-english-version.js', () => {
  class EnglishGenerationUnavailableError extends Error {}
  return { generateEnglishVersion: vi.fn(), EnglishGenerationUnavailableError };
});

import {
  getAudit,
  getAuditRuntimeFields,
  getAuditSlimmedAt,
  setAuditManualFields,
} from '@odysseus/store';
import { generateEnglishVersion } from '../pipeline/generate-english-version.js';
import { makeReportReady } from '../pipeline/make-report-ready.js';
import { runReportQualityForAudit } from '../pipeline/regenerate-reports.js';
import { regenerateWriting } from '../pipeline/regenerate-writing.js';
import { Router } from '../router.js';
import { registerAuditRoutes } from '../routes/audits.js';
import { registerReportPreparationRoutes } from '../routes/report-preparation.js';
import { RAW_EVIDENCE_REMOVED_MESSAGE } from './slimmed-audit-guard.js';

type FakeResponse = ServerResponse & { statusCode: number; body: string | undefined };

function fakeReq(url: string, body: unknown): IncomingMessage {
  const req = Readable.from([
    Buffer.from(JSON.stringify(body ?? {})),
  ]) as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = url;
  req.headers = {};
  return req;
}

function fakeRes(): FakeResponse {
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

const connection = {} as never;
const audit = {
  auditId: 'audit-1',
  siteUrl: 'https://hotel.example/',
  startedAt: new Date('2026-08-08T10:00:00.000Z'),
};

async function post(url: string, body?: unknown): Promise<FakeResponse> {
  const router = new Router();
  registerAuditRoutes(router, connection);
  registerReportPreparationRoutes(router, connection);
  const res = fakeRes();
  await router.handle(fakeReq(url, body), res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAudit).mockResolvedValue(audit as never);
  vi.mocked(getAuditRuntimeFields).mockResolvedValue(audit as never);
  vi.mocked(getAuditSlimmedAt).mockResolvedValue(new Date('2026-09-30T00:00:00Z'));
});

describe('routes that need raw scan evidence refuse a slimmed audit', () => {
  it.each([
    ['regenerate-report', '/api/audits/audit-1/regenerate-report', undefined, makeReportReady],
    [
      'identity confirmation, which produces the reports',
      '/api/audits/audit-1/manual-fields/confirm',
      { field: 'nomCommercial', value: 'Hôtel' },
      makeReportReady,
    ],
    ['report-quality', '/api/audits/audit-1/report-quality', undefined, runReportQualityForAudit],
    [
      'regenerate-writing',
      '/api/audits/audit-1/report-preparation/regenerate-writing',
      undefined,
      regenerateWriting,
    ],
    [
      'generate-english-version',
      '/api/audits/audit-1/report-preparation/generate-english-version',
      undefined,
      generateEnglishVersion,
    ],
  ] as const)('%s', async (_label, url, body, pipeline) => {
    const res = await post(url, body);

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body!)).toEqual({
      error: {
        code: 'action-blocked',
        reasonCode: 'raw-evidence-removed',
        message: RAW_EVIDENCE_REMOVED_MESSAGE,
        retryable: false,
        blockingRef: { auditId: 'audit-1' },
      },
    });
    expect(pipeline).not.toHaveBeenCalled();
    expect(setAuditManualFields).not.toHaveBeenCalled();
  });

  it('lets an audit that was never slimmed through', async () => {
    vi.mocked(getAuditSlimmedAt).mockResolvedValue(undefined);
    vi.mocked(makeReportReady).mockResolvedValue({
      kind: 'ready',
      reports: [],
      findingsWereRefreshed: false,
    } as never);

    const res = await post('/api/audits/audit-1/regenerate-report');

    expect(res.statusCode).toBe(200);
    expect(makeReportReady).toHaveBeenCalledOnce();
  });
});
