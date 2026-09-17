import { Readable } from 'node:stream';
import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyPreparationPatch,
  emptyReportPreparation,
  type ReportPreparation,
} from '@odysseus/core';

vi.mock('@odysseus/store', () => {
  class WritingSelectionConflictError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'WritingSelectionConflictError';
    }
  }
  return {
    getAudit: vi.fn(),
    getReportPreparation: vi.fn(),
    patchReportPreparationInputs: vi.fn(),
    approveWritingCandidate: vi.fn(),
    recordReadyWritingCandidate: vi.fn(),
    recordFailedWritingCandidate: vi.fn(),
    WritingSelectionConflictError,
  };
});

vi.mock('@odysseus/scanner', () => ({
  buildAuditDir: vi.fn(() => '/tmp/fake-prep-audit'),
  getArtifactsRoot: vi.fn(() => '/tmp'),
  readOdysseusBuildId: vi.fn(() => 'test-build'),
  ensureEnvLoaded: vi.fn(),
  buildArtifactBucketKey: vi.fn(),
}));

vi.mock('@odysseus/report', () => {
  class ReportIdentityUnconfirmedError extends Error {
    constructor(readonly fields: readonly { field: string }[] = []) {
      super('odysseus: identity unconfirmed');
      this.name = 'ReportIdentityUnconfirmedError';
    }
  }
  return {
    REPORT_TEMPLATE_VERSION: 3,
    ReportIdentityUnconfirmedError,
  };
});

vi.mock('../pipeline/analysis-stage.js', () => ({
  runAnalysisStage: vi.fn(),
}));

vi.mock('../pipeline/regenerate-reports.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pipeline/regenerate-reports.js')>()),
  regenerateReportsForAudit: vi.fn(),
}));

// Regeneration runs the fr and en stages back to back; the real inter-pass
// pause would add a 20s sleep to this suite (issue #30).
vi.mock('@odysseus/llm', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  pauseBetweenLanguagePasses: vi.fn(),
}));

import {
  approveWritingCandidate,
  getAudit,
  getReportPreparation,
  patchReportPreparationInputs,
  recordFailedWritingCandidate,
  recordReadyWritingCandidate,
  WritingSelectionConflictError,
} from '@odysseus/store';
import { runAnalysisStage } from '../pipeline/analysis-stage.js';
import {
  isWritingRegenerationInFlight,
  lastWritingRunOutcome,
} from '../pipeline/regenerate-writing.js';
import { regenerateReportsForAudit } from '../pipeline/regenerate-reports.js';
import {
  releaseReportProduction,
  tryAcquireReportProduction,
} from '../pipeline/report-production-lock.js';
import { pauseBetweenLanguagePasses } from '@odysseus/llm';
import { Router } from '../router.js';
import { registerReportPreparationRoutes } from './report-preparation.js';

const AUDIT_DIR = '/tmp/fake-prep-audit';

function fakeReq(url: string, body?: unknown, method = 'GET'): IncomingMessage {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Readable.from(payload) as unknown as IncomingMessage;
  req.method = method;
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

let storedPreparation: ReportPreparation;

beforeEach(() => {
  vi.clearAllMocks();
  storedPreparation = emptyReportPreparation();
  vi.mocked(getReportPreparation).mockImplementation(async () =>
    JSON.parse(JSON.stringify(storedPreparation)),
  );
  vi.mocked(patchReportPreparationInputs).mockImplementation(
    async (_connection, _auditId, patch) => {
      storedPreparation = applyPreparationPatch(storedPreparation, patch, new Date().toISOString());
      return storedPreparation;
    },
  );
  // Plan 045 section 2.1: regenerateWriting approves the fresh candidate
  // itself, so its default here mirrors the store's real transition (ready
  // -> selected) instead of every test wiring this up by hand.
  vi.mocked(approveWritingCandidate).mockImplementation(async () => {
    const candidate = storedPreparation.writingSelection?.candidate;
    if (candidate?.status !== 'ready') {
      throw new WritingSelectionConflictError(
        'odysseus: no ready writing candidate to approve for this audit',
      );
    }
    storedPreparation = {
      ...storedPreparation,
      writingSelection: {
        selected: candidate.pair,
        candidate: {
          status: 'selected',
          pair: candidate.pair,
          approvedAt: '2026-09-01T12:00:00.000Z',
        },
      },
    };
    return storedPreparation;
  });
  vi.mocked(regenerateReportsForAudit).mockResolvedValue([]);
  vi.mocked(recordReadyWritingCandidate).mockImplementation(async (_connection, _auditId, pair) => {
    storedPreparation = {
      ...storedPreparation,
      writingSelection: {
        candidate: { status: 'ready', pair, createdAt: '2026-09-01T12:00:00.000Z' },
      },
    };
    return storedPreparation;
  });
  vi.mocked(getAudit).mockResolvedValue({
    auditId: 'audit-1',
    siteUrl: 'https://example.com/',
    startedAt: new Date('2026-08-08T10:00:00.000Z'),
    finishedAt: new Date('2026-08-08T10:05:00.000Z'),
    crawl: { visitedCount: 5 },
  } as never);
});

afterEach(async () => {
  await fs.rm(AUDIT_DIR, { recursive: true, force: true });
});

async function writeEvidence(): Promise<void> {
  await fs.mkdir(AUDIT_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(
      AUDIT_DIR + '/manifest.json',
      JSON.stringify({
        auditId: 'audit-1',
        siteUrl: 'https://example.com/',
        pages: [{ url: 'https://example.com/', depth: 0, status: 'visited', errors: {} }],
      }),
    ),
    fs.writeFile(AUDIT_DIR + '/findings.json', JSON.stringify([])),
  ]);
}

describe('GET /api/audits/:auditId/report-preparation', () => {
  it('returns 404 for an unknown audit', async () => {
    vi.mocked(getAudit).mockResolvedValue(null as never);
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(fakeReq('/api/audits/nope/report-preparation'), res);
    expect(res.statusCode).toBe(404);
  });

  it('returns the preparation and its preview', async () => {
    await writeEvidence();
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(fakeReq('/api/audits/audit-1/report-preparation'), res);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body!);
    expect(body.preparation).toEqual({ updatedAt: expect.any(String) });
    expect(body.preview.fr.coverQuestion.source).toBe('fallback');
    expect(body.preview.fr.coverQuestion.value).toContain('corriger en priorité');
    expect(body.preview.en.coverQuestion.source).toBe('fallback');
    expect(body.preview.fr.hook.evidenceUnavailable).toBe(false);
    expect(body).not.toHaveProperty('suggestions');
    expect(body.regenerationInFlight).toBe(false);
  });

  it('degrades to evidence-unavailable when the artifacts are missing', async () => {
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(fakeReq('/api/audits/audit-1/report-preparation'), res);
    const body = JSON.parse(res.body!);
    expect(body.preview.fr.hook.evidenceUnavailable).toBe(true);
  });
});

describe('PATCH /api/audits/:auditId/report-preparation', () => {
  it('rejects a retired preparation input with 400', async () => {
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq(
        '/api/audits/audit-1/report-preparation',
        { context: { situation: 'bogus' } },
        'PATCH',
      ),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(patchReportPreparationInputs).not.toHaveBeenCalled();
  });

  it('rejects an oversized custom question with 400', async () => {
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq(
        '/api/audits/audit-1/report-preparation',
        { customCoverQuestion: { fr: 'a'.repeat(201) } },
        'PATCH',
      ),
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('applies a valid patch', async () => {
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq(
        '/api/audits/audit-1/report-preparation',
        { customCoverQuestion: { fr: 'Question ?' } },
        'PATCH',
      ),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(patchReportPreparationInputs).toHaveBeenCalledTimes(1);
    const body = JSON.parse(res.body!);
    expect(body.preparation.customCoverQuestion).toEqual({ fr: 'Question ?' });
    expect(body.preview.fr.coverQuestion).toEqual({ value: 'Question ?', source: 'custom' });
  });
});

describe('POST /api/audits/:auditId/report-preparation/regenerate-writing', () => {
  it('returns 409 when the artifacts are missing, without requiring any body', async () => {
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq('/api/audits/audit-1/report-preparation/regenerate-writing', undefined, 'POST'),
      res,
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toContain('artifacts not found');
    expect(runAnalysisStage).not.toHaveBeenCalled();
  });

  // Plan 045 section 2.2: a missing-context warning never blocks writing
  // regeneration any more, so an audit with unacknowledged warnings still
  // regenerates - this used to 409 with MissingAcknowledgementError.
  it('regenerates writing even when missing-context warnings are unacknowledged', async () => {
    await writeEvidence();
    storedPreparation = {
      ...emptyReportPreparation(),
      warningAcknowledgement: { digest: 'stale', acknowledgedAt: '2026-09-01T00:00:00.000Z' },
    };
    vi.mocked(runAnalysisStage).mockImplementation(
      async (_dir, _manifest, _findings, options) =>
        ({
          analysis: {
            analysisId: `analysis-${options.language}`,
            auditId: 'audit-1',
            findingsProvenance: {
              findingsSchemaVersion: 1 as const,
              normalizationFingerprint: 'fp',
              findingsDigest: 'sha256:digest',
            },
            language: options.language,
          },
          analysisPath: `/tmp/${options.language}.json`,
          structurePath: '/tmp/structure.json',
          structureReused: true,
          unreferencedFindingCount: 0,
          usedFallbackContext: true,
          advisoryPasses: [],
        }) as never,
    );

    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq('/api/audits/audit-1/report-preparation/regenerate-writing', undefined, 'POST'),
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body!).candidate.status).toBe('selected');
  });

  it('regenerates both languages, approves the pair, and renders the reports', async () => {
    await writeEvidence();
    storedPreparation = emptyReportPreparation();
    const callOrder: string[] = [];
    vi.mocked(pauseBetweenLanguagePasses).mockImplementation(async () => {
      callOrder.push('pause');
    });
    vi.mocked(runAnalysisStage).mockImplementation(async (_dir, _manifest, _findings, options) => {
      const language = options.language;
      callOrder.push(`analyze-${language}`);
      return {
        analysis: {
          analysisId: `analysis-${language}`,
          auditId: 'audit-1',
          findingsProvenance: {
            findingsSchemaVersion: 1 as const,
            normalizationFingerprint: 'fp',
            findingsDigest: 'sha256:digest',
          },
          language,
        },
        analysisPath: `/tmp/${language}.json`,
        structurePath: '/tmp/structure.json',
        structureReused: true,
        unreferencedFindingCount: 0,
        usedFallbackContext: true,
        // Issue #145: regenerateWriting settles this field before recording
        // the candidate, so the mocked stage result has to carry it.
        advisoryPasses: [],
      } as never;
    });

    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq('/api/audits/audit-1/report-preparation/regenerate-writing', undefined, 'POST'),
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(runAnalysisStage).toHaveBeenCalledTimes(2);
    expect(callOrder).toEqual(['analyze-fr', 'pause', 'analyze-en']);
    const body = JSON.parse(res.body!);
    expect(body.candidate.status).toBe('selected');
    expect(body.candidate.approvedAt).toBe('2026-09-01T12:00:00.000Z');
    expect(body.candidate.pair).toEqual({
      frAnalysisId: 'analysis-fr',
      enAnalysisId: 'analysis-en',
      findingsProvenance: {
        findingsSchemaVersion: 1,
        normalizationFingerprint: 'fp',
        findingsDigest: 'sha256:digest',
      },
    });
    expect(body.pdfs).toEqual({ kind: 'generated', reports: [] });
    expect(body.replacedApprovedSelection).toBe(false);
  });

  it('rejects a concurrent second submit with 409 while the first run holds the in-flight marker', async () => {
    await writeEvidence();
    storedPreparation = emptyReportPreparation();
    let releaseFr!: () => void;
    const frGate = new Promise<void>((resolve) => {
      releaseFr = resolve;
    });
    vi.mocked(pauseBetweenLanguagePasses).mockResolvedValue(undefined);
    vi.mocked(runAnalysisStage).mockImplementation(async (_dir, _manifest, _findings, options) => {
      // The French pass waits on the gate so the first run stays in flight
      // until the test releases it; a real second submit would arrive in
      // that window.
      if (options.language === 'fr') {
        await frGate;
      }
      return {
        analysis: {
          analysisId: `analysis-${options.language}`,
          auditId: 'audit-1',
          findingsProvenance: {
            findingsSchemaVersion: 1 as const,
            normalizationFingerprint: 'fp',
            findingsDigest: 'sha256:digest',
          },
          language: options.language,
        },
        analysisPath: `/tmp/${options.language}.json`,
        structurePath: '/tmp/structure.json',
        structureReused: true,
        unreferencedFindingCount: 0,
        usedFallbackContext: true,
        advisoryPasses: [],
      } as never;
    });

    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    // The marker is module state shared by every test in this file, so this
    // opening check keeps the suite hermetic.
    expect(isWritingRegenerationInFlight('audit-1')).toBe(false);

    const firstRes = fakeRes();
    const first = router.handle(
      fakeReq('/api/audits/audit-1/report-preparation/regenerate-writing', undefined, 'POST'),
      firstRes,
    );
    // The guard must take the marker before the run's first await, so this
    // settles while the French stage is still gated.
    await vi.waitFor(() => expect(isWritingRegenerationInFlight('audit-1')).toBe(true));

    const secondRes = fakeRes();
    await router.handle(
      fakeReq('/api/audits/audit-1/report-preparation/regenerate-writing', undefined, 'POST'),
      secondRes,
    );
    expect(secondRes.statusCode).toBe(409);
    expect(secondRes.body).toContain('already being produced');

    releaseFr();
    await first;
    expect(firstRes.statusCode).toBe(201);
    expect(isWritingRegenerationInFlight('audit-1')).toBe(false);
  });

  it('runs as tracked background work in async mode and records the outcome', async () => {
    await writeEvidence();
    storedPreparation = emptyReportPreparation();
    vi.mocked(pauseBetweenLanguagePasses).mockResolvedValue(undefined);
    vi.mocked(runAnalysisStage).mockImplementation(
      async (_dir, _manifest, _findings, options) =>
        ({
          analysis: {
            analysisId: `analysis-${options.language}`,
            auditId: 'audit-1',
            findingsProvenance: {
              findingsSchemaVersion: 1 as const,
              normalizationFingerprint: 'fp',
              findingsDigest: 'sha256:digest',
            },
            language: options.language,
          },
          analysisPath: `/tmp/${options.language}.json`,
          structurePath: '/tmp/structure.json',
          structureReused: true,
          unreferencedFindingCount: 0,
          usedFallbackContext: true,
          advisoryPasses: [],
        }) as never,
    );
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq(
        '/api/audits/audit-1/report-preparation/regenerate-writing?async=true',
        undefined,
        'POST',
      ),
      res,
    );
    expect(res.statusCode).toBe(202);
    await vi.waitFor(() => expect(isWritingRegenerationInFlight('audit-1')).toBe(false));
    await vi.waitFor(() =>
      expect(lastWritingRunOutcome('audit-1')).toMatchObject({ status: 'succeeded' }),
    );
  });

  it('refuses an async writing run while the PDFs are being produced for the audit', async () => {
    expect(tryAcquireReportProduction('audit-1', 'report-ready')).toBe(true);
    try {
      const router = new Router();
      registerReportPreparationRoutes(router, fakeConnection);
      const res = fakeRes();
      await router.handle(
        fakeReq(
          '/api/audits/audit-1/report-preparation/regenerate-writing?async=true',
          undefined,
          'POST',
        ),
        res,
      );
      expect(res.statusCode).toBe(409);
      expect(runAnalysisStage).not.toHaveBeenCalled();
    } finally {
      releaseReportProduction('audit-1', 'report-ready');
    }
  });

  it('releases the in-flight marker when a pre-flight read fails', async () => {
    await writeEvidence();
    vi.mocked(getReportPreparation).mockRejectedValue(
      new Error('odysseus: preparation read failed'),
    );
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq('/api/audits/audit-1/report-preparation/regenerate-writing', undefined, 'POST'),
      res,
    );
    // A raw pre-flight failure keeps its 500 and must not become a phantom
    // failed writing candidate.
    expect(res.statusCode).toBe(500);
    expect(res.body).toContain('could not regenerate writing');
    expect(recordFailedWritingCandidate).not.toHaveBeenCalled();
    expect(isWritingRegenerationInFlight('audit-1')).toBe(false);
  });
});
