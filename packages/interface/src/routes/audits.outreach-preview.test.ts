import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_QUALIFICATION_VERSION } from '../prospecting/hotel-qualification/qualify-hotels.js';

vi.mock('@odysseus/store', () => ({
  approvalMatchesReportPair: vi.fn(() => false),
  createJobModel: vi.fn(() => ({
    findOne: vi.fn(() => ({
      sort: vi.fn(() => ({
        lean: vi.fn(async () => null),
      })),
    })),
  })),
  findLatestLiveV2PreviewForCandidate: vi.fn(async () => null),
  getAudit: vi.fn(),
  getAuditRuntimeFields: vi.fn(),
  getFindingsForAudit: vi.fn(async () => []),
  getHotelCandidate: vi.fn(async () => null),
  getLatestReport: vi.fn(async () => null),
  getLatestReportApproval: vi.fn(async () => null),
  getSeverityRollup: vi.fn(async () => ({})),
  listReportLanguages: vi.fn(async () => []),
  persistReportApproval: vi.fn(),
  resolveOutreachAuditForCandidate: vi.fn(),
  resolveSelectedAnalysisPairForAudit: vi.fn(),
  setAuditManualFields: vi.fn(),
}));

vi.mock('@odysseus/scanner', () => ({
  buildAuditDir: vi.fn(() => '/tmp/fake-audit-dir'),
  buildArtifactBucketKey: vi.fn(() => 'bucket-key'),
  getArtifactsRoot: vi.fn(() => '/tmp'),
  ensureEnvLoaded: vi.fn(),
  findWorkspaceRoot: vi.fn(() => '/tmp'),
}));

vi.mock('@odysseus/report', () => ({
  classifyReportFreshness: vi.fn(() => 'unverified'),
  computeAutomaticGrade: vi.fn(() => 'A'),
  resolveEffectiveGrade: vi.fn((automaticGrade: string) => automaticGrade),
  generateOutreachPreviewHtmlV2: vi.fn(() => '<main>scorecard</main>'),
  generateOutreachPreviewPdf: vi.fn(async () => Buffer.from('%PDF-outreach-preview')),
  OUTREACH_PROOF_CARD_COPY: { 'rule-a': { fr: 'Titre revu', en: 'Reviewed title' } },
  remediationFor: vi.fn(() => undefined),
  RULE_TRANSLATIONS_FR: {},
}));

vi.mock('../outreach/publish-preview.js', () => ({
  previewLinks: vi.fn(() => ({
    offer: 'https://www.example.com/offre',
    privacy: 'https://www.example.com/confidentialite-prospection',
    optOut: 'https://www.example.com/desinscription',
  })),
}));

vi.mock('../outreach/publish-preview-v2.js', () => ({
  buildOutreachPreviewSummaryV2: vi.fn(),
  publishPreviewV2: vi.fn(),
}));

vi.mock('../outreach/mongo-outreach-preview-store-v2.js', () => ({
  createMongoOutreachPreviewStoreV2: vi.fn(),
}));

vi.mock('../outreach/configured-preview-publisher.js', () => ({
  createConfiguredPreviewPublisher: vi.fn(),
}));

import { generateOutreachPreviewHtmlV2, generateOutreachPreviewPdf } from '@odysseus/report';
import { createConfiguredPreviewPublisher } from '../outreach/configured-preview-publisher.js';
import { createMongoOutreachPreviewStoreV2 } from '../outreach/mongo-outreach-preview-store-v2.js';
import { buildOutreachPreviewSummaryV2, publishPreviewV2 } from '../outreach/publish-preview-v2.js';
import {
  findLatestLiveV2PreviewForCandidate,
  getAudit,
  getFindingsForAudit,
  resolveOutreachAuditForCandidate,
  resolveSelectedAnalysisPairForAudit,
} from '@odysseus/store';
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

function fakeRes(): ServerResponse & { statusCode: number; body: string | Buffer | undefined } {
  const res = {
    statusCode: 200,
    body: undefined as string | Buffer | undefined,
    setHeader: vi.fn(),
    end: vi.fn(function (this: { body: string | Buffer | undefined }, chunk?: string | Buffer) {
      this.body = chunk;
    }),
  };
  return res as never;
}

const fakeConnection = {} as never;

/** A coverage-current audit (the shape summarizeAuditCoverage maps to
 *  `current`, copied from the GET detail test fixture) with an optional
 *  outreach provenance block. */
function auditFixture(outreach?: {
  candidateId: string;
  cohortId: string;
  scoringVersion: string;
}) {
  return {
    auditId: 'audit-1',
    siteUrl: 'https://hotel-exemple.fr/',
    startedAt: new Date('2026-09-01T10:00:00.000Z'),
    finishedAt: new Date('2026-09-01T10:05:00.000Z'),
    findingsProvenance: {
      findingsSchemaVersion: 1,
      normalizationFingerprint: 'fp',
      findingsDigest: 'sha256:0',
    },
    crawl: { visitedCount: 1 },
    pages: [
      {
        url: 'https://hotel-exemple.fr/',
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
    ...(outreach === undefined ? {} : { outreach }),
  };
}

async function call(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<ReturnType<typeof fakeRes>> {
  const router = new Router();
  registerAuditRoutes(router, fakeConnection);
  const req = fakeReq(path, body);
  req.method = method;
  const res = fakeRes();
  await router.handle(req, res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAudit).mockResolvedValue(auditFixture() as never);
  vi.mocked(resolveOutreachAuditForCandidate).mockResolvedValue({
    state: 'refused',
    reason: 'no-audit',
  } as never);
  // The GET detail handler reads the analysis pair through the selector;
  // no stored analyses is its documented empty answer.
  vi.mocked(resolveSelectedAnalysisPairForAudit).mockResolvedValue({
    kind: 'none',
    reason: 'no-analyses',
  } as never);
});

describe('GET /api/audits/:auditId/outreach-preview', () => {
  it('answers 404 for an unknown audit', async () => {
    vi.mocked(getAudit).mockResolvedValueOnce(null as never);
    const res = await call('GET', '/api/audits/audit-1/outreach-preview');
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('audit not found');
  });

  it('maps a candidate resolution refusal to the stable refusal code', async () => {
    vi.mocked(getAudit).mockResolvedValueOnce(
      auditFixture({ candidateId: 'candidate-1', cohortId: 'c1', scoringVersion: 'v1' }) as never,
    );
    const res = await call('GET', '/api/audits/audit-1/outreach-preview');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ rendered: false, refusal: 'no-audit' });
    expect(generateOutreachPreviewHtmlV2).not.toHaveBeenCalled();
  });

  it('renders a candidate-linked audit through the same v2 build as publication', async () => {
    vi.mocked(getAudit).mockResolvedValueOnce(
      auditFixture({ candidateId: 'candidate-1', cohortId: 'c1', scoringVersion: 'v1' }) as never,
    );
    vi.mocked(resolveOutreachAuditForCandidate).mockResolvedValueOnce({
      state: 'resolved',
      audit: auditFixture() as never,
    } as never);
    const row = { candidateId: 'candidate-1', businessName: 'Hôtel Exemple' };
    const findPublicationRow = vi.fn(async () => row);
    vi.mocked(createMongoOutreachPreviewStoreV2).mockReturnValueOnce({
      findPublicationRow,
    } as never);
    vi.mocked(buildOutreachPreviewSummaryV2).mockReturnValueOnce({
      summary: { marker: 'summary' },
    } as never);

    const res = await call('GET', '/api/audits/audit-1/outreach-preview');

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({
      rendered: true,
      html: '<main>scorecard</main>',
    });
    expect(createMongoOutreachPreviewStoreV2).toHaveBeenCalledWith(fakeConnection, {
      qualificationVersion: CURRENT_QUALIFICATION_VERSION,
    });
    expect(buildOutreachPreviewSummaryV2).toHaveBeenCalledWith({
      row,
      language: 'fr',
      publicBaseUrl: expect.any(String),
    });
    expect(generateOutreachPreviewHtmlV2).toHaveBeenCalledWith({ marker: 'summary' });
  });

  it('refuses a non-candidate audit without per-page coverage facts', async () => {
    vi.mocked(getAudit).mockResolvedValueOnce({
      ...auditFixture(),
      pages: [],
    } as never);
    const res = await call('GET', '/api/audits/audit-1/outreach-preview');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({
      rendered: false,
      refusal: 'coverage-incomplete',
    });
  });

  it('renders a non-candidate audit straight from the stored audit and findings', async () => {
    vi.mocked(getFindingsForAudit).mockResolvedValueOnce([
      {
        ruleId: 'rule-a',
        category: 'accessibility',
        severity: 'serious',
        pageUrls: ['https://hotel-exemple.fr/'],
      },
      {
        ruleId: 'rule-a',
        category: 'accessibility',
        severity: 'moderate',
        pageUrls: ['https://hotel-exemple.fr/'],
      },
      {
        ruleId: 'rule-a',
        category: 'accessibility',
        severity: 'minor',
        pageUrls: ['https://hotel-exemple.fr/'],
      },
    ] as never);
    const res = await call('GET', '/api/audits/audit-1/outreach-preview');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({
      rendered: true,
      html: '<main>scorecard</main>',
    });
    expect(getFindingsForAudit).toHaveBeenCalledWith(fakeConnection, 'audit-1');
    expect(resolveOutreachAuditForCandidate).not.toHaveBeenCalled();
  });
});

describe('GET /api/audits/:auditId/outreach-preview/pdf', () => {
  it('answers 404 for an unknown audit', async () => {
    vi.mocked(getAudit).mockResolvedValueOnce(null as never);
    const res = await call('GET', '/api/audits/audit-1/outreach-preview/pdf');
    expect(res.statusCode).toBe(404);
  });

  it('serves the generated PDF with a download filename', async () => {
    // Three findings with catalog copy, so the scorecard build passes its
    // three-proof-card gate exactly as a real audit would.
    vi.mocked(getFindingsForAudit).mockResolvedValueOnce([
      {
        ruleId: 'rule-a',
        category: 'accessibility',
        severity: 'serious',
        pageUrls: ['https://hotel-exemple.fr/'],
      },
      {
        ruleId: 'rule-a',
        category: 'accessibility',
        severity: 'moderate',
        pageUrls: ['https://hotel-exemple.fr/'],
      },
      {
        ruleId: 'rule-a',
        category: 'accessibility',
        severity: 'minor',
        pageUrls: ['https://hotel-exemple.fr/'],
      },
    ] as never);
    const res = await call('GET', '/api/audits/audit-1/outreach-preview/pdf');
    expect(res.statusCode).toBe(200);
    expect(generateOutreachPreviewPdf).toHaveBeenCalledWith('<main>scorecard</main>');
    expect(vi.mocked(res.setHeader).mock.calls).toContainEqual(['content-type', 'application/pdf']);
    expect(vi.mocked(res.setHeader).mock.calls).toContainEqual([
      'content-disposition',
      'attachment; filename="apercu-audit-1.pdf"',
    ]);
    expect(res.body).toEqual(Buffer.from('%PDF-outreach-preview'));
  });

  it('answers a refusal as JSON so the page can say why', async () => {
    vi.mocked(getAudit).mockResolvedValueOnce({ ...auditFixture(), pages: [] } as never);
    const res = await call('GET', '/api/audits/audit-1/outreach-preview/pdf');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({
      rendered: false,
      refusal: 'coverage-incomplete',
    });
    expect(generateOutreachPreviewPdf).not.toHaveBeenCalled();
  });
});

describe('POST /api/audits/:auditId/outreach-preview/publish', () => {
  it('answers 404 for an unknown audit', async () => {
    vi.mocked(getAudit).mockResolvedValueOnce(null as never);
    const res = await call('POST', '/api/audits/audit-1/outreach-preview/publish');
    expect(res.statusCode).toBe(404);
  });

  it('refuses a non-candidate audit with 409 and a stable refusal', async () => {
    const res = await call('POST', '/api/audits/audit-1/outreach-preview/publish');
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body as string)).toEqual({
      published: false,
      refusal: 'not-an-outreach-audit',
    });
    expect(publishPreviewV2).not.toHaveBeenCalled();
  });

  it('publishes through the v2 port and returns the one-time url once', async () => {
    vi.mocked(getAudit).mockResolvedValueOnce(
      auditFixture({ candidateId: 'candidate-1', cohortId: 'c1', scoringVersion: 'v1' }) as never,
    );
    vi.mocked(createConfiguredPreviewPublisher).mockReturnValueOnce({} as never);
    const findPublicationRow = vi.fn(async () => ({
      candidateId: 'candidate-1',
      businessName: 'Hôtel Exemple',
    }));
    vi.mocked(createMongoOutreachPreviewStoreV2).mockReturnValueOnce({
      findPublicationRow,
    } as never);
    vi.mocked(publishPreviewV2).mockResolvedValueOnce({
      published: true,
      previewId: 'preview-1',
      url: 'https://www.example.com/apercu/one-time-token',
      publicExpiresAt: new Date('2026-10-01T00:00:00.000Z'),
    } as never);

    const res = await call('POST', '/api/audits/audit-1/outreach-preview/publish');

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.published).toBe(true);
    expect(body.url).toBe('https://www.example.com/apercu/one-time-token');
    expect(vi.mocked(res.setHeader).mock.calls).toContainEqual(['cache-control', 'no-store']);
    expect(publishPreviewV2).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-1',
        language: 'fr',
        dryRun: false,
        store: expect.objectContaining({ findPublicationRow: expect.any(Function) }),
        publisher: expect.objectContaining({}),
      }),
    );
  });

  it('maps a v2 refusal to a 200 body with the typed code', async () => {
    vi.mocked(getAudit).mockResolvedValueOnce(
      auditFixture({ candidateId: 'candidate-1', cohortId: 'c1', scoringVersion: 'v1' }) as never,
    );
    vi.mocked(createConfiguredPreviewPublisher).mockReturnValueOnce({} as never);
    vi.mocked(publishPreviewV2).mockResolvedValueOnce({
      published: false,
      refusal: 'suppressed',
    } as never);
    const res = await call('POST', '/api/audits/audit-1/outreach-preview/publish');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ published: false, refusal: 'suppressed' });
  });

  it('answers 503 when the preview bucket is not configured', async () => {
    vi.mocked(getAudit).mockResolvedValueOnce(
      auditFixture({ candidateId: 'candidate-1', cohortId: 'c1', scoringVersion: 'v1' }) as never,
    );
    vi.mocked(createConfiguredPreviewPublisher).mockImplementationOnce(() => {
      throw new Error('ODYSSEUS_PREVIEW_BUCKET_NAME is not set');
    });
    const res = await call('POST', '/api/audits/audit-1/outreach-preview/publish');
    expect(res.statusCode).toBe(503);
    expect(publishPreviewV2).not.toHaveBeenCalled();
  });
});

describe('GET /api/audits/:auditId outreach field', () => {
  it('carries the candidate link and the live v2 preview fact', async () => {
    vi.mocked(getAudit).mockResolvedValueOnce(
      auditFixture({ candidateId: 'candidate-1', cohortId: 'c1', scoringVersion: 'v1' }) as never,
    );
    vi.mocked(findLatestLiveV2PreviewForCandidate).mockResolvedValueOnce({
      previewId: 'preview-1',
    } as never);

    const res = await call('GET', '/api/audits/audit-1');

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string).outreach).toEqual({
      candidateId: 'candidate-1',
      hasLiveV2Preview: true,
    });
    expect(findLatestLiveV2PreviewForCandidate).toHaveBeenCalledWith(fakeConnection, 'candidate-1');
  });

  it('reads a non-candidate audit as no candidate and no live preview', async () => {
    const res = await call('GET', '/api/audits/audit-1');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string).outreach).toEqual({
      candidateId: null,
      hasLiveV2Preview: false,
    });
    expect(findLatestLiveV2PreviewForCandidate).not.toHaveBeenCalled();
  });
});
