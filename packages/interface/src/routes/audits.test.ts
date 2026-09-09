import { Readable } from 'node:stream';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FINDINGS_SCHEMA_VERSION, NORMALIZATION_FINGERPRINT } from '@odysseus/core';

vi.mock('@odysseus/store', () => ({
  getAudit: vi.fn(),
  getAuditRuntimeFields: vi.fn(),
  getFindingsForAudit: vi.fn(),
  getSeverityRollup: vi.fn(),
  getLatestReport: vi.fn(),
  getLatestReportApproval: vi.fn(),
  resolveSelectedAnalysisPairForAudit: vi.fn(),
  approvalMatchesReportPair: vi.fn(() => false),
  persistReportApproval: vi.fn(),
  listReportLanguages: vi.fn(),
  setAuditManualFields: vi.fn(),
  // Issue #90: the failed-job lookup goes through the model factory;
  // tests stub the findOne chain through this factory fn.
  createJobModel: vi.fn(() => ({
    findOne: vi.fn(() => ({
      sort: vi.fn(() => ({
        lean: vi.fn(async () => null),
      })),
    })),
  })),
}));

vi.mock('@odysseus/scanner', () => ({
  buildAuditDir: vi.fn(() => '/tmp/fake-audit-dir'),
  buildArtifactBucketKey: vi.fn(
    (hostname: string, startedAt: Date, relativePath: string) =>
      `${hostname}/${startedAt.toISOString()}/${relativePath}`,
  ),
  getArtifactsRoot: vi.fn(() => '/tmp'),
  ensureEnvLoaded: vi.fn(),
  findWorkspaceRoot: vi.fn(() => '/tmp'),
}));

// Issue #139: wrap, but keep, the real resolver so the per-request read
// count is observable while every other test keeps reading the real files
// it writes under /tmp/fake-audit-dir.
vi.mock('../artifacts/resolve-artifact.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../artifacts/resolve-artifact.js')>();
  return { ...actual, resolveArtifactFile: vi.fn(actual.resolveArtifactFile) };
});

import {
  getAudit,
  getAuditRuntimeFields,
  getFindingsForAudit,
  getLatestReport,
  getLatestReportApproval,
  approvalMatchesReportPair,
  resolveSelectedAnalysisPairForAudit,
  persistReportApproval,
  getSeverityRollup,
  listReportLanguages,
  setAuditManualFields,
  createJobModel,
} from '@odysseus/store';
import { resolveArtifactFile } from '../artifacts/resolve-artifact.js';
import { Router } from '../router.js';
import { registerAuditRoutes } from './audits.js';

function fakeReq(url: string, body?: unknown): IncomingMessage {
  const req = Readable.from(
    body === undefined ? [] : [Buffer.from(JSON.stringify(body))],
  ) as unknown as IncomingMessage;
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
    pages: [],
  } as never);
  // Same scalar subset the write and lookup handlers consume through the
  // projected read; only the GET detail, preview, and download routes still
  // touch the full-document getAudit mock above.
  vi.mocked(getAuditRuntimeFields).mockResolvedValue({
    auditId: 'audit-1',
    siteUrl: 'https://example.com/',
    startedAt: new Date('2026-08-08T10:00:00.000Z'),
    findingsProvenance,
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
    expect(getAuditRuntimeFields).toHaveBeenCalledWith(fakeConnection, 'audit-1');
    expect(getAudit).not.toHaveBeenCalled();
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

describe('POST /api/audits/:auditId/regenerate-report', () => {
  it('names the writing-regeneration remedy when no analysis pair is stored', async () => {
    // The artifact read must succeed so the request reaches the pair
    // resolution; the default beforeEach mock already answers kind 'none'.
    await fs.mkdir('/tmp/fake-audit-dir', { recursive: true });
    await Promise.all([
      fs.writeFile('/tmp/fake-audit-dir/manifest.json', JSON.stringify({ auditId: 'audit-1' })),
      fs.writeFile('/tmp/fake-audit-dir/findings.json', JSON.stringify([])),
    ]);

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1/regenerate-report');
    req.method = 'POST';
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toContain('a complete bilingual analysis pair is required');
    expect(res.body).toContain('Prepare report card');
    expect(getAuditRuntimeFields).toHaveBeenCalledWith(fakeConnection, 'audit-1');
    expect(getAudit).not.toHaveBeenCalled();
  });
});

describe('POST /api/audits/:auditId/manual-fields/siren-preview', () => {
  it('checks audit existence through the projected runtime read (plan 011)', async () => {
    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1/manual-fields/siren-preview', {
      siren: 'not-a-siren',
    });
    req.method = 'POST';
    const res = fakeRes();
    await router.handle(req, res);

    // An invalid SIREN stops at the 400 below, so the route runs end to
    // end without reaching the Sirene lookup; the pinned read path is the
    // point of the test.
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('valid SIREN');
    expect(getAuditRuntimeFields).toHaveBeenCalledWith(fakeConnection, 'audit-1');
    expect(getAudit).not.toHaveBeenCalled();
  });

  it('answers 404 from the projected read when the audit is missing', async () => {
    vi.mocked(getAuditRuntimeFields).mockResolvedValueOnce(null);
    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1/manual-fields/siren-preview', {
      siren: '732829321',
    });
    req.method = 'POST';
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('audit not found');
  });
});

describe('PATCH /api/audits/:auditId/manual-fields transactional-flow override', () => {
  it('persists an operator override only with a boolean value and a non-empty reason', async () => {
    vi.mocked(setAuditManualFields).mockResolvedValue({
      transactionalFlowOverride: {
        value: true,
        reason: 'The hotel booking engine is available from the header.',
      },
      updatedAt: new Date(),
    });
    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1/manual-fields', {
      transactionalFlowOverride: {
        value: true,
        reason: '  The hotel booking engine is available from the header.  ',
      },
    });
    req.method = 'PATCH';
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(200);
    expect(setAuditManualFields).toHaveBeenCalledWith(
      fakeConnection,
      'audit-1',
      expect.objectContaining({
        transactionalFlowOverride: {
          value: true,
          reason: 'The hotel booking engine is available from the header.',
        },
      }),
    );
    expect(getAuditRuntimeFields).toHaveBeenCalledWith(fakeConnection, 'audit-1');
    expect(getAudit).not.toHaveBeenCalled();
  });

  it('rejects an override without an auditable reason', async () => {
    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1/manual-fields', {
      transactionalFlowOverride: { value: false, reason: '   ' },
    });
    req.method = 'PATCH';
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('reason must be a non-empty string');
    expect(setAuditManualFields).not.toHaveBeenCalled();
  });
});

describe('GET /api/audits/:auditId', () => {
  it('returns current pass coverage and an explicit legacy fallback', async () => {
    vi.mocked(getAudit).mockResolvedValueOnce({
      auditId: 'audit-1',
      siteUrl: 'https://example.com/',
      startedAt: new Date('2026-08-08T10:00:00.000Z'),
      finishedAt: new Date('2026-08-08T10:05:00.000Z'),
      findingsProvenance,
      crawl: { visitedCount: 1 },
      pages: [
        {
          url: 'https://example.com/',
          depth: 0,
          status: 'visited',
          analysisCoverage: {
            plannerVersion: 'v1',
            role: 'content',
            confidence: 'high',
            reasonCodes: ['content-json-ld'],
            passes: {
              rendered: { outcome: 'completed' },
              axe: { outcome: 'completed' },
              extended: { outcome: 'completed' },
              lighthouse: { outcome: 'not-planned' },
            },
          },
          errors: {},
        },
      ],
    } as never);

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const currentRes = fakeRes();
    await router.handle(fakeReq('/api/audits/audit-1'), currentRes);
    expect(JSON.parse(currentRes.body ?? '{}').coverageSummary).toMatchObject({
      kind: 'current',
      inventoriedUrlCount: 1,
      content: { completed: 1, partial: 0, failed: 0 },
      passes: { lighthouse: { completed: 0, failed: 0, notPlanned: 1 } },
    });

    const legacyRouter = new Router();
    registerAuditRoutes(legacyRouter, fakeConnection);
    const legacyRes = fakeRes();
    await legacyRouter.handle(fakeReq('/api/audits/audit-1'), legacyRes);
    expect(JSON.parse(legacyRes.body ?? '{}').coverageSummary).toEqual({
      kind: 'legacy-unknown',
      inventoriedUrlCount: 0,
      continuationOmittedUrlCount: 0,
    });
  });

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
      { language: 'fr', status: 'fresh', pageCount: 44, pdfAvailable: false },
      { language: 'en', status: 'stale', pageCount: 44, pdfAvailable: false },
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
      { language: 'fr', status: 'fresh', pageCount: 61, pdfAvailable: false },
      { language: 'en', status: 'fresh', pdfAvailable: false },
    ]);
    expect(body.reports[1]).not.toHaveProperty('pageCount');
  });

  it('marks a report pdfAvailable only when this machine resolves its bytes (issue #91)', async () => {
    // A real PDF whose digest matches what the report row records: the
    // same read the preview and download endpoints run.
    const bytes = Buffer.from('%PDF-1.4 fake bytes for availability');
    await fs.mkdir('/tmp/fake-audit-dir/reports', { recursive: true });
    await fs.writeFile('/tmp/fake-audit-dir/reports/fr.pdf', bytes);
    vi.mocked(getLatestReport).mockImplementation(async (_connection, _auditId, language) => ({
      reportId: `report-${language}`,
      auditId: 'audit-1',
      analysisId: `analysis-${language}`,
      findingsProvenance,
      rendererVersion: 2,
      pdfDigest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      language,
      reportTemplateVersion: 2,
      analysisGeneratedAt: new Date(),
      fileRef: 'reports/fr.pdf',
      generatedAt: new Date(),
    }));

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1');
    const res = fakeRes();
    await router.handle(req, res);

    const body = JSON.parse(res.body ?? '{}');
    // Both rows point at the same resolvable file ref; a digest mismatch
    // or a missing file would answer false, the local unresolvable state
    // the issue describes.
    expect(body.reports).toEqual([
      { language: 'fr', status: 'fresh', pdfAvailable: true },
      { language: 'en', status: 'fresh', pdfAvailable: true },
    ]);
  });

  it('reads each report and the analysis-pair resolution only once per request (issue #4)', async () => {
    vi.mocked(getLatestReport).mockResolvedValue(null);

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1');
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(200);
    // Previously getLatestReport was called once to build `reports` and
    // again inside getFreshVerifiedPair for the same language, and
    // resolveSelectedAnalysisPairForAudit was called once directly and
    // again inside getFreshVerifiedPair - four redundant Mongo reads per
    // dashboard open. One call per language, one resolution call.
    expect(getLatestReport).toHaveBeenCalledTimes(2);
    expect(getLatestReport).toHaveBeenCalledWith(fakeConnection, 'audit-1', 'fr');
    expect(getLatestReport).toHaveBeenCalledWith(fakeConnection, 'audit-1', 'en');
    expect(resolveSelectedAnalysisPairForAudit).toHaveBeenCalledTimes(1);
  });

  it('reads each report PDF at most once per request (issue #139)', async () => {
    // Fixture modelled on the approve-reports test: real on-disk PDFs whose
    // digest matches what the report rows record, a selected pair carrying
    // that provenance, so verifyFreshPair succeeds on the served bytes.
    const pdf = Buffer.from('%PDF-1.4 single-read bytes');
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
    vi.mocked(resolveArtifactFile).mockClear();

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1');
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.reports).toEqual([
      { language: 'fr', status: 'fresh', pdfAvailable: true },
      { language: 'en', status: 'fresh', pdfAvailable: true },
    ]);
    // The pair verified over the shared buffers, so the freshness decision
    // consumed exactly the availability reads above.
    expect(body.lifecycle).toBe('rendered');
    // Before #139 the availability flags and verifyFreshPair each paid for
    // the same digest-verified read: two full reads and hashes per language
    // on every dashboard open.
    const frReads = vi
      .mocked(resolveArtifactFile)
      .mock.calls.filter(([localPath]) => String(localPath).endsWith('reports/fr.pdf')).length;
    const enReads = vi
      .mocked(resolveArtifactFile)
      .mock.calls.filter(([localPath]) => String(localPath).endsWith('reports/en.pdf')).length;
    expect(frReads).toBeLessThanOrEqual(1);
    expect(enReads).toBeLessThanOrEqual(1);
  });

  it('carries the failed job behind the audit (issue #90)', async () => {
    vi.mocked(createJobModel).mockImplementationOnce(
      () =>
        ({
          findOne: () => ({
            sort: () => ({
              lean: async () => ({
                jobId: 'job-1',
                type: 'full-audit',
                status: 'needs-input',
                phase: 'needs-input',
                error:
                  'Report generation aborted: the client identity on the cover is still a detected guess.',
                needsInputFields: [{ field: 'nomCommercial', value: 'Site Officiel' }],
              }),
            }),
          }),
        }) as never,
    );

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1');
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}').failure).toEqual({
      jobId: 'job-1',
      status: 'needs-input',
      error:
        'Report generation aborted: the client identity on the cover is still a detected guess.',
      needsInputFields: [{ field: 'nomCommercial', value: 'Site Officiel' }],
    });
  });

  it('omits the failure field while no failed job is linked (issue #90)', async () => {
    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1');
    const res = fakeRes();
    await router.handle(req, res);

    expect(JSON.parse(res.body ?? '{}')).not.toHaveProperty('failure');
  });

  it('carries reviewed rule copy keyed by rule id (issue #93)', async () => {
    // 'button-name' is an observed rule with reviewed FR/EN tables; the
    // invented id has none, so it must be an empty entry rather than a
    // guess. The copy values come from the real report tables.
    vi.mocked(getFindingsForAudit).mockResolvedValue([
      { ruleId: 'button-name' },
      { ruleId: 'never-observed-rule' },
    ] as never);

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1');
    const res = fakeRes();
    await router.handle(req, res);

    const body = JSON.parse(res.body ?? '{}');
    expect(typeof body.ruleCopy).toBe('object');
    expect(body.ruleCopy['never-observed-rule']).toEqual({});
    const buttonCopy = body.ruleCopy['button-name'];
    expect(typeof buttonCopy.titleFr).toBe('string');
    expect(typeof buttonCopy.remediationFr).toBe('string');
    expect(typeof buttonCopy.remediationEn).toBe('string');
  });
});

describe('GET /api/audits/:auditId/report/:language', () => {
  // Complete fresh report row: every field classifyReportFreshness needs so
  // the freshness gate passes unless a test overrides one field on purpose.
  function freshReport(language: 'fr' | 'en', pdfDigest: string) {
    return {
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
    };
  }

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
    expect(res.setHeader).toHaveBeenCalledWith('x-content-type-options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('referrer-policy', 'no-referrer');
  });

  it('returns a conflict when the stored template version makes the report stale', async () => {
    vi.mocked(getLatestReport).mockImplementation(async (_connection, _auditId, language) => ({
      ...freshReport(language, `sha256:${'0'.repeat(64)}`),
      reportTemplateVersion: 1,
    }));

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1/report/fr');
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toContain('stale');
  });

  it('returns a conflict when the bilingual pair has not been approved', async () => {
    vi.mocked(getLatestReport).mockImplementation(async (_connection, _auditId, language) =>
      freshReport(language, `sha256:${'0'.repeat(64)}`),
    );

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1/report/fr');
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toContain('not been approved');
  });

  it('returns a conflict when the served bytes do not hash to the recorded digest', async () => {
    const recordedPdf = Buffer.from('%PDF-recorded');
    const servedPdf = Buffer.from('%PDF-tampered');
    const recordedDigest = `sha256:${createHash('sha256').update(recordedPdf).digest('hex')}`;
    await fs.mkdir('/tmp/fake-audit-dir/reports', { recursive: true });
    await fs.writeFile('/tmp/fake-audit-dir/reports/fr.pdf', servedPdf);
    vi.mocked(getLatestReport).mockImplementation(async (_connection, _auditId, language) =>
      freshReport(language, recordedDigest),
    );
    vi.mocked(getLatestReportApproval).mockResolvedValue({ auditId: 'audit-1' } as never);
    vi.mocked(approvalMatchesReportPair).mockReturnValue(true);

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1/report/fr');
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toContain('digest does not match');
  });

  it('serves the exact digest-verified bytes as application/pdf', async () => {
    const recordedPdf = Buffer.from('%PDF-recorded');
    const recordedDigest = `sha256:${createHash('sha256').update(recordedPdf).digest('hex')}`;
    await fs.mkdir('/tmp/fake-audit-dir/reports', { recursive: true });
    await fs.writeFile('/tmp/fake-audit-dir/reports/fr.pdf', recordedPdf);
    vi.mocked(getLatestReport).mockImplementation(async (_connection, _auditId, language) =>
      freshReport(language, recordedDigest),
    );
    vi.mocked(getLatestReportApproval).mockResolvedValue({ auditId: 'audit-1' } as never);
    vi.mocked(approvalMatchesReportPair).mockReturnValue(true);

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1/report/fr');
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(res.setHeader).mock.calls).toContainEqual(['content-type', 'application/pdf']);
    expect(res.body).toEqual(recordedPdf);
  });

  it('rejects a language outside the bilingual pair before any store read', async () => {
    const router = new Router();
    registerAuditRoutes(router, fakeConnection);
    const req = fakeReq('/api/audits/audit-1/report/es');
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('language must be');
    expect(getLatestReport).not.toHaveBeenCalled();
  });
});
