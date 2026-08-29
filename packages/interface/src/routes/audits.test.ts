import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FINDINGS_SCHEMA_VERSION, NORMALIZATION_FINGERPRINT } from '@odysseus/core';

vi.mock('@odysseus/store', () => ({
  getAudit: vi.fn(),
  getFindingsForAudit: vi.fn(),
  getSeverityRollup: vi.fn(),
  getLatestReport: vi.fn(),
  listReportLanguages: vi.fn(),
}));

vi.mock('@odysseus/scanner', () => ({
  buildAuditDir: vi.fn(() => '/tmp/fake-audit-dir'),
  getArtifactsRoot: vi.fn(() => '/tmp'),
}));

import {
  getAudit,
  getFindingsForAudit,
  getLatestReport,
  getSeverityRollup,
  listReportLanguages,
} from '@odysseus/store';
import { Router } from '../router.js';
import { registerAuditRoutes } from './audits.js';

function fakeReq(url: string): IncomingMessage {
  const req = Readable.from([]) as unknown as IncomingMessage;
  req.method = 'GET';
  req.url = url;
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
const findingsProvenance = {
  findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
  normalizationFingerprint: NORMALIZATION_FINGERPRINT,
  findingsDigest: `sha256:${'0'.repeat(64)}`,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAudit).mockResolvedValue({
    auditId: 'audit-1',
    siteUrl: 'https://example.com/',
    startedAt: new Date('2026-08-08T10:00:00.000Z'),
    finishedAt: new Date('2026-08-08T10:05:00.000Z'),
    findingsProvenance,
    crawl: { visitedCount: 5 },
  } as never);
  vi.mocked(getFindingsForAudit).mockResolvedValue([]);
  vi.mocked(getSeverityRollup).mockResolvedValue({} as never);
  vi.mocked(listReportLanguages).mockResolvedValue(['fr', 'en']);
  vi.mocked(getLatestReport).mockResolvedValue(null);
});

describe('GET /api/audits/:auditId', () => {
  it('includes reportLanguages', async () => {
    const router = new Router();
    registerAuditRoutes(router, fakeConnection);

    const req = fakeReq('/api/audits/audit-1');
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.reportLanguages).toEqual(['fr', 'en']);
  });

  it('returns an empty reportLanguages array when no report has been generated yet', async () => {
    vi.mocked(listReportLanguages).mockResolvedValue([]);

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);

    const req = fakeReq('/api/audits/audit-1');
    const res = fakeRes();
    await router.handle(req, res);

    const body = JSON.parse(res.body ?? '{}');
    expect(body.reportLanguages).toEqual([]);
  });

  it('marks matching reports fresh and mismatched reports stale', async () => {
    vi.mocked(getLatestReport).mockImplementation(async (_connection, _auditId, language) => ({
      reportId: `report-${language}`,
      auditId: 'audit-1',
      analysisId: `analysis-${language}`,
      findingsProvenance:
        language === 'fr'
          ? findingsProvenance
          : { ...findingsProvenance, findingsDigest: `sha256:${'f'.repeat(64)}` },
      rendererVersion: 2,
      pdfDigest: `sha256:${'1'.repeat(64)}`,
      language,
      reportTemplateVersion: 2,
      analysisGeneratedAt: new Date(),
      fileRef: `reports/${language}.pdf`,
      generatedAt: new Date(),
    }));

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1');
    const res = fakeRes();
    await router.handle(req, res);

    expect(JSON.parse(res.body ?? '{}').reports).toEqual([
      { language: 'fr', status: 'fresh' },
      { language: 'en', status: 'stale' },
    ]);
  });
});

describe('GET /api/audits/:auditId/report/:language', () => {
  it('returns a conflict instead of serving a legacy unverified PDF', async () => {
    vi.mocked(getLatestReport).mockResolvedValue({
      auditId: 'audit-1',
      language: 'fr',
      reportTemplateVersion: 1,
      analysisGeneratedAt: new Date(),
      fileRef: 'reports/legacy.pdf',
      generatedAt: new Date(),
    });

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1/report/fr');
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toContain('unverified');
  });
});
