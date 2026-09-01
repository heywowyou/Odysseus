import { Readable } from 'node:stream';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FINDINGS_SCHEMA_VERSION, NORMALIZATION_FINGERPRINT } from '@odysseus/core';

vi.mock('@odysseus/store', () => ({
  getAudit: vi.fn(),
  getFindingsForAudit: vi.fn(),
  getSeverityRollup: vi.fn(),
  getLatestReport: vi.fn(),
  getLatestReportApproval: vi.fn(),
  resolveSelectedAnalysisPairForAudit: vi.fn(),
  approvalMatchesReportPair: vi.fn(() => false),
  persistReportApproval: vi.fn(),
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
  getLatestReportApproval,
  resolveSelectedAnalysisPairForAudit,
  persistReportApproval,
  getSeverityRollup,
  listReportLanguages,
} from '@odysseus/store';
import { Router } from '../router.js';
import { registerAuditRoutes } from './audits.js';

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

const fakeConnection = {
  transaction: async (callback: (session: unknown) => Promise<void>) => callback({}),
} as never;
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
  vi.mocked(resolveSelectedAnalysisPairForAudit).mockResolvedValue({
    kind: 'none',
    reason: 'no-analyses',
  } as never);
  vi.mocked(getLatestReportApproval).mockResolvedValue(null);
});

afterEach(async () => {
  await fs.rm('/tmp/fake-audit-dir', { recursive: true, force: true });
});

describe('POST /api/audits/:auditId/approve-reports', () => {
  it('returns 409 unless a complete fresh bilingual pair verifies', async () => {
    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1/approve-reports');
    req.method = 'POST';
    const res = fakeRes();
    await router.handle(req, res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toContain('French and English');
  });

  it('approves the exact complete digest-verified bilingual pair', async () => {
    const pdf = Buffer.from('%PDF-approved');
    const pdfDigest = `sha256:${createHash('sha256').update(pdf).digest('hex')}`;
    await fs.mkdir('/tmp/fake-audit-dir/reports', { recursive: true });
    await Promise.all([
      fs.writeFile('/tmp/fake-audit-dir/reports/fr.pdf', pdf),
      fs.writeFile('/tmp/fake-audit-dir/reports/en.pdf', pdf),
    ]);
    vi.mocked(resolveSelectedAnalysisPairForAudit).mockImplementation(
      async () =>
        ({
          kind: 'selected',
          fr: {
            analysisId: 'analysis-fr',
            auditId: 'audit-1',
            language: 'fr',
            findingsProvenance,
            generatedAt: new Date(),
          },
          en: {
            analysisId: 'analysis-en',
            auditId: 'audit-1',
            language: 'en',
            findingsProvenance,
            generatedAt: new Date(),
          },
        }) as never,
    );
    vi.mocked(getLatestReport).mockImplementation(async (_connection, _auditId, language) => ({
      reportId: `report-${language}`,
      auditId: 'audit-1',
      analysisId: `analysis-${language}`,
      findingsProvenance,
      rendererVersion: 2,
      rendererBuild: 'build',
      pdfDigest,
      language,
      reportTemplateVersion: 2,
      analysisGeneratedAt: new Date(),
      fileRef: `reports/${language}.pdf`,
      generatedAt: new Date(),
    }));

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1/approve-reports');
    req.method = 'POST';
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(201);
    expect(persistReportApproval).toHaveBeenCalledWith(
      fakeConnection,
      expect.objectContaining({
        auditId: 'audit-1',
        fr: { reportId: 'report-fr', pdfDigest },
        en: { reportId: 'report-en', pdfDigest },
      }),
      expect.anything(),
    );
  });
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
      pageCount: 44,
    }));

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1');
    const res = fakeRes();
    await router.handle(req, res);

    expect(JSON.parse(res.body ?? '{}').reports).toEqual([
      { language: 'fr', status: 'fresh', pageCount: 44 },
      { language: 'en', status: 'stale', pageCount: 44 },
    ]);
  });

  it('carries the optional measured page count and omits it for a legacy document', async () => {
    vi.mocked(getLatestReport).mockImplementation(async (_connection, _auditId, language) => ({
      reportId: `report-${language}`,
      auditId: 'audit-1',
      analysisId: `analysis-${language}`,
      findingsProvenance,
      rendererVersion: 2,
      pdfDigest: `sha256:${'1'.repeat(64)}`,
      language,
      reportTemplateVersion: 2,
      analysisGeneratedAt: new Date(),
      fileRef: `reports/${language}.pdf`,
      generatedAt: new Date(),
      // The French document records a measured page count above the
      // warning threshold; the English one predates the field entirely.
      ...(language === 'fr' ? { pageCount: 61 } : {}),
    }));

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1');
    const res = fakeRes();
    await router.handle(req, res);

    const body = JSON.parse(res.body ?? '{}');
    expect(body.reports).toEqual([
      { language: 'fr', status: 'fresh', pageCount: 61 },
      { language: 'en', status: 'fresh' },
    ]);
    expect(body.reports[1]).not.toHaveProperty('pageCount');
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
