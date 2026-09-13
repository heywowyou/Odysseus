import { Readable } from 'node:stream';
import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyPreparationPatch,
  buildReportPreparationPreview,
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
    setWarningAcknowledgement: vi.fn(),
    clearStaleWarningAcknowledgement: vi.fn(),
    approveWritingCandidate: vi.fn(),
    recordReadyWritingCandidate: vi.fn(),
    recordFailedWritingCandidate: vi.fn(),
    getAnalysisById: vi.fn(),
    getAuditManualFields: vi.fn(),
    WritingSelectionConflictError,
  };
});

vi.mock('@odysseus/scanner', () => ({
  buildAuditDir: vi.fn(() => '/tmp/fake-prep-audit'),
  getArtifactsRoot: vi.fn(() => '/tmp'),
  readOdysseusBuildId: vi.fn(() => 'test-build'),
}));

vi.mock('@odysseus/report', () => ({
  generateReportPdf: vi.fn(),
  REPORT_TEMPLATE_VERSION: 3,
}));

vi.mock('../pipeline/analysis-stage.js', () => ({
  runAnalysisStage: vi.fn(),
}));

// Regeneration runs the fr and en stages back to back; the real inter-pass
// pause would add a 20s sleep to this suite (issue #30).
vi.mock('@odysseus/llm', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  pauseBetweenLanguagePasses: vi.fn(),
}));

import {
  approveWritingCandidate,
  clearStaleWarningAcknowledgement,
  getAudit,
  getReportPreparation,
  patchReportPreparationInputs,
  recordFailedWritingCandidate,
  recordReadyWritingCandidate,
  setWarningAcknowledgement,
  WritingSelectionConflictError,
} from '@odysseus/store';
import { runAnalysisStage } from '../pipeline/analysis-stage.js';
import { isWritingRegenerationInFlight } from '../pipeline/regenerate-writing.js';
import { generateReportPdf } from '@odysseus/report';
import { pauseBetweenLanguagePasses } from '@odysseus/llm';
import { getAnalysisById, getAuditManualFields } from '@odysseus/store';
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
  vi.mocked(setWarningAcknowledgement).mockImplementation(async (_connection, _auditId, digest) => {
    storedPreparation = {
      ...storedPreparation,
      warningAcknowledgement: { digest, acknowledgedAt: new Date().toISOString() },
    };
    return storedPreparation;
  });
  vi.mocked(clearStaleWarningAcknowledgement).mockImplementation(
    async (_connection, _auditId, digest) => {
      if (storedPreparation.warningAcknowledgement?.digest !== digest) {
        const { warningAcknowledgement: _dropped, ...rest } = storedPreparation;
        storedPreparation = rest as ReportPreparation;
      }
      return storedPreparation;
    },
  );
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

  it('returns the preparation, its preview, suggestions, and acknowledgement state', async () => {
    await writeEvidence();
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(fakeReq('/api/audits/audit-1/report-preparation'), res);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body!);
    expect(body.preparation.context).toEqual({});
    expect(body.preview.fr.coverQuestion.source).toBe('fallback');
    expect(body.preview.fr.coverQuestion.value).toContain('corriger en priorité');
    expect(body.preview.en.coverQuestion.source).toBe('fallback');
    expect(body.suggestions).toEqual([
      { journeyId: 'discovery-navigation', available: true },
      { journeyId: 'transaction-booking', available: false, reason: 'no-transactional-flow' },
    ]);
    expect(body.acknowledgementCurrent).toBe(false);
    expect(body.regenerationInFlight).toBe(false);
  });

  it('degrades to evidence-unavailable when the artifacts are missing', async () => {
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(fakeReq('/api/audits/audit-1/report-preparation'), res);
    const body = JSON.parse(res.body!);
    expect(body.preview.fr.hook.evidenceUnavailable).toBe(true);
    expect(body.suggestions).toEqual([
      { journeyId: 'discovery-navigation', available: false, reason: 'evidence-unavailable' },
      { journeyId: 'transaction-booking', available: false, reason: 'evidence-unavailable' },
    ]);
  });
});

describe('PATCH /api/audits/:auditId/report-preparation', () => {
  it('rejects an unknown option with 400', async () => {
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

  it('rejects an oversized stakeholder name and an unknown role with 400', async () => {
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const tooLong = fakeRes();
    await router.handle(
      fakeReq(
        '/api/audits/audit-1/report-preparation',
        { stakeholders: { legal: 'a'.repeat(81) } },
        'PATCH',
      ),
      tooLong,
    );
    expect(tooLong.statusCode).toBe(400);

    const unknownRole = fakeRes();
    await router.handle(
      fakeReq(
        '/api/audits/audit-1/report-preparation',
        { stakeholders: { president: 'X' } },
        'PATCH',
      ),
      unknownRole,
    );
    expect(unknownRole.statusCode).toBe(400);
  });

  it('applies a valid patch and re-evaluates the acknowledgement against the new inputs', async () => {
    storedPreparation = {
      ...emptyReportPreparation(),
      warningAcknowledgement: {
        digest: 'sha256:stale',
        acknowledgedAt: '2026-09-01T00:00:00.000Z',
      },
    };
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq(
        '/api/audits/audit-1/report-preparation',
        { context: { situation: 'periodic-review' } },
        'PATCH',
      ),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(patchReportPreparationInputs).toHaveBeenCalledTimes(1);
    // The stored ack digest (sha256:stale) can never match the freshly
    // computed digest, so the patch path must have pruned it.
    expect(clearStaleWarningAcknowledgement).toHaveBeenCalledWith(
      fakeConnection,
      'audit-1',
      expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    );
    const body = JSON.parse(res.body!);
    expect(body.preparation.context.situation).toBe('periodic-review');
    expect(body.acknowledgementCurrent).toBe(false);
  });

  it('round-trips a replacement while retaining the detected official turnover', async () => {
    storedPreparation = {
      ...emptyReportPreparation(),
      turnover: {
        detected: { amountEur: 8_400_000, year: 2025, source: 'sirene-api' },
        useReplacement: false,
      },
    };
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();

    await router.handle(
      fakeReq(
        '/api/audits/audit-1/report-preparation',
        {
          turnover: {
            useReplacement: true,
            replacement: {
              kind: 'range',
              lowerEur: 7_000_000,
              upperEur: 7_500_000,
              year: 2024,
              source: 'client-stated',
            },
          },
        },
        'PATCH',
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!).preparation.turnover).toEqual({
      detected: { amountEur: 8_400_000, year: 2025, source: 'sirene-api' },
      replacement: {
        kind: 'range',
        lowerEur: 7_000_000,
        upperEur: 7_500_000,
        year: 2024,
        source: 'client-stated',
      },
      useReplacement: true,
    });
    expect(JSON.parse(res.body!).preview.turnover).toEqual({
      status: 'available',
      amountEur: 7_000_000,
      calculationAmountEur: 7_000_000,
      rangeUpperEur: 7_500_000,
      year: 2024,
      source: 'client-stated',
      provenance: 'replacement',
      inputKind: 'range',
    });
  });

  it('rejects forged detected provenance and unknown manual sources', async () => {
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);

    for (const turnover of [
      {
        detected: { amountEur: 99_000_000, year: 2025, source: 'sirene-api' },
        useReplacement: false,
      },
      {
        replacement: {
          kind: 'exact',
          amountEur: 7_200_000,
          year: 2024,
          source: 'operator-guess',
        },
        useReplacement: true,
      },
    ]) {
      const res = fakeRes();
      await router.handle(
        fakeReq('/api/audits/audit-1/report-preparation', { turnover }, 'PATCH'),
        res,
      );
      expect(res.statusCode).toBe(400);
    }

    expect(patchReportPreparationInputs).not.toHaveBeenCalled();
  });

  it('does not invalidate the missing-context acknowledgement when only turnover changes', async () => {
    const warningDigest = buildReportPreparationPreview({
      preparation: emptyReportPreparation(),
    }).warningDigest;
    storedPreparation = {
      ...emptyReportPreparation(),
      warningAcknowledgement: {
        digest: warningDigest,
        acknowledgedAt: '2026-09-01T00:00:00.000Z',
      },
    };
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();

    await router.handle(
      fakeReq(
        '/api/audits/audit-1/report-preparation',
        {
          turnover: {
            useReplacement: true,
            replacement: {
              kind: 'exact',
              amountEur: 7_200_000,
              year: 2024,
              source: 'official-annual-accounts',
            },
          },
        },
        'PATCH',
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!).acknowledgementCurrent).toBe(true);
  });
});

describe('POST /api/audits/:auditId/report-preparation/confirm-warnings', () => {
  it('records a server-computed digest for the current inputs', async () => {
    await writeEvidence();
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq('/api/audits/audit-1/report-preparation/confirm-warnings', {}, 'POST'),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(setWarningAcknowledgement).toHaveBeenCalledWith(
      fakeConnection,
      'audit-1',
      expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    );
    const body = JSON.parse(res.body!);
    expect(body.acknowledgementCurrent).toBe(true);
  });
});

describe('POST /api/audits/:auditId/report-preparation/regenerate-writing', () => {
  it('requires the explicit model-call and cost confirmation', async () => {
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq('/api/audits/audit-1/report-preparation/regenerate-writing', {}, 'POST'),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('cost warning');
    expect(runAnalysisStage).not.toHaveBeenCalled();
  });

  it('returns 409 with the warnings when the acknowledgement is missing', async () => {
    await writeEvidence();
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq(
        '/api/audits/audit-1/report-preparation/regenerate-writing',
        { costWarningConfirmed: true },
        'POST',
      ),
      res,
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toContain('warnings must be confirmed');
    expect(runAnalysisStage).not.toHaveBeenCalled();
  });

  it('regenerates both languages and records the exact pair as a ready candidate', async () => {
    await writeEvidence();
    // The acknowledgement must carry the digest the server itself computes
    // for the current inputs, so compute it through the same core function.
    const preview = buildReportPreparationPreview({
      preparation: emptyReportPreparation(),
      manifest: JSON.parse(await fs.readFile(AUDIT_DIR + '/manifest.json', 'utf-8')),
      findings: [],
    });
    storedPreparation = {
      ...emptyReportPreparation(),
      warningAcknowledgement: {
        digest: preview.warningDigest,
        acknowledgedAt: '2026-09-01T00:00:00.000Z',
      },
    };
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
    vi.mocked(
      await import('@odysseus/store').then((store) => store.recordReadyWritingCandidate),
    ).mockImplementation(async (_connection, _auditId, pair) => {
      storedPreparation = {
        ...storedPreparation,
        writingSelection: {
          candidate: { status: 'ready', pair, createdAt: '2026-09-01T12:00:00.000Z' },
        },
      };
      return storedPreparation;
    });

    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq(
        '/api/audits/audit-1/report-preparation/regenerate-writing',
        { costWarningConfirmed: true },
        'POST',
      ),
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(runAnalysisStage).toHaveBeenCalledTimes(2);
    expect(callOrder).toEqual(['analyze-fr', 'pause', 'analyze-en']);
    const body = JSON.parse(res.body!);
    expect(body.candidate.status).toBe('ready');
    expect(body.candidate.pair).toEqual({
      frAnalysisId: 'analysis-fr',
      enAnalysisId: 'analysis-en',
      findingsProvenance: {
        findingsSchemaVersion: 1,
        normalizationFingerprint: 'fp',
        findingsDigest: 'sha256:digest',
      },
    });
  });

  it('returns 409 when the artifacts are missing', async () => {
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq(
        '/api/audits/audit-1/report-preparation/regenerate-writing',
        { costWarningConfirmed: true },
        'POST',
      ),
      res,
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toContain('artifacts not found');
  });

  it('rejects a concurrent second submit with 409 while the first run holds the in-flight marker', async () => {
    await writeEvidence();
    const preview = buildReportPreparationPreview({
      preparation: emptyReportPreparation(),
      manifest: JSON.parse(await fs.readFile(AUDIT_DIR + '/manifest.json', 'utf-8')),
      findings: [],
    });
    storedPreparation = {
      ...emptyReportPreparation(),
      warningAcknowledgement: {
        digest: preview.warningDigest,
        acknowledgedAt: '2026-09-01T00:00:00.000Z',
      },
    };
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
    vi.mocked(recordReadyWritingCandidate).mockImplementation(
      async (_connection, _auditId, pair) => {
        storedPreparation = {
          ...storedPreparation,
          writingSelection: {
            candidate: { status: 'ready', pair, createdAt: '2026-09-01T12:00:00.000Z' },
          },
        };
        return storedPreparation;
      },
    );

    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    // The marker is module state shared by every test in this file, so this
    // opening check keeps the suite hermetic.
    expect(isWritingRegenerationInFlight('audit-1')).toBe(false);

    const firstRes = fakeRes();
    const first = router.handle(
      fakeReq(
        '/api/audits/audit-1/report-preparation/regenerate-writing',
        { costWarningConfirmed: true },
        'POST',
      ),
      firstRes,
    );
    // The guard must take the marker before the run's first await, so this
    // settles while the French stage is still gated.
    await vi.waitFor(() => expect(isWritingRegenerationInFlight('audit-1')).toBe(true));

    const secondRes = fakeRes();
    await router.handle(
      fakeReq(
        '/api/audits/audit-1/report-preparation/regenerate-writing',
        { costWarningConfirmed: true },
        'POST',
      ),
      secondRes,
    );
    expect(secondRes.statusCode).toBe(409);
    expect(secondRes.body).toContain('already running');

    releaseFr();
    await first;
    expect(firstRes.statusCode).toBe(201);
    expect(isWritingRegenerationInFlight('audit-1')).toBe(false);
  });

  it('releases the in-flight marker when the warning acknowledgement is stale', async () => {
    await writeEvidence();
    storedPreparation = {
      ...emptyReportPreparation(),
      warningAcknowledgement: {
        digest: 'stale',
        acknowledgedAt: '2026-09-01T00:00:00.000Z',
      },
    };
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq(
        '/api/audits/audit-1/report-preparation/regenerate-writing',
        { costWarningConfirmed: true },
        'POST',
      ),
      res,
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toContain('warnings must be confirmed');
    expect(runAnalysisStage).not.toHaveBeenCalled();
    expect(isWritingRegenerationInFlight('audit-1')).toBe(false);
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
      fakeReq(
        '/api/audits/audit-1/report-preparation/regenerate-writing',
        { costWarningConfirmed: true },
        'POST',
      ),
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

describe('POST /api/audits/:auditId/report-preparation/approve-candidate', () => {
  it('returns 409 when there is no ready candidate', async () => {
    vi.mocked(approveWritingCandidate).mockRejectedValue(
      new WritingSelectionConflictError(
        'odysseus: no ready writing candidate to approve for this audit',
      ),
    );
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq('/api/audits/audit-1/report-preparation/approve-candidate', {}, 'POST'),
      res,
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toContain('no ready writing candidate');
  });

  it('returns the updated view after an approval', async () => {
    vi.mocked(approveWritingCandidate).mockImplementation(async () => {
      storedPreparation = {
        ...storedPreparation,
        writingSelection: {
          selected: {
            frAnalysisId: 'fr-1',
            enAnalysisId: 'en-1',
            findingsProvenance: {
              findingsSchemaVersion: 1 as const,
              normalizationFingerprint: 'fp',
              findingsDigest: 'sha256:d',
            },
          },
          candidate: {
            status: 'selected',
            pair: {
              frAnalysisId: 'fr-1',
              enAnalysisId: 'en-1',
              findingsProvenance: {
                findingsSchemaVersion: 1 as const,
                normalizationFingerprint: 'fp',
                findingsDigest: 'sha256:d',
              },
            },
            approvedAt: '2026-09-01T12:00:00.000Z',
          },
        },
      };
      return storedPreparation;
    });
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq('/api/audits/audit-1/report-preparation/approve-candidate', {}, 'POST'),
      res,
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body!);
    expect(body.preparation.writingSelection.selected.frAnalysisId).toBe('fr-1');
    expect(body.preparation.writingSelection.candidate.status).toBe('selected');
  });
});

describe('GET /api/audits/:auditId/report-preparation/candidate/:language/preview', () => {
  const pairProvenance = {
    findingsSchemaVersion: 1 as const,
    normalizationFingerprint: 'fp',
    findingsDigest: 'sha256:digest',
  };

  function seedReadyCandidate(): void {
    storedPreparation = {
      ...emptyReportPreparation(),
      writingSelection: {
        candidate: {
          status: 'ready',
          pair: {
            frAnalysisId: 'analysis-fr',
            enAnalysisId: 'analysis-en',
            findingsProvenance: pairProvenance,
          },
          createdAt: '2026-09-01T12:00:00.000Z',
        },
      },
    };
  }

  it('returns 409 when there is no ready candidate', async () => {
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq('/api/audits/audit-1/report-preparation/candidate/fr/preview'),
      res,
    );
    expect(res.statusCode).toBe(409);
    expect(generateReportPdf).not.toHaveBeenCalled();
  });

  it('renders the candidate PDF for the requested language without persisting anything', async () => {
    seedReadyCandidate();
    await writeEvidence();
    vi.mocked(getAnalysisById).mockImplementation(async (_connection, _auditId, analysisId) => {
      return {
        analysisId,
        auditId: 'audit-1',
        language: analysisId.endsWith('-fr') ? 'fr' : 'en',
      } as never;
    });
    vi.mocked(getAuditManualFields).mockResolvedValue(undefined);
    vi.mocked(generateReportPdf).mockResolvedValue({
      pdf: Buffer.from('%PDF-candidate'),
      pageCount: 12,
    } as never);

    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq('/api/audits/audit-1/report-preparation/candidate/fr/preview'),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(generateReportPdf).toHaveBeenCalledTimes(1);
    const input = vi.mocked(generateReportPdf).mock.calls[0]![0]!;
    expect(input.analysis.analysisId).toBe('analysis-fr');
    expect(input.preparation?.language).toBe('fr');
  });

  it('rejects an unknown language with 400', async () => {
    const router = new Router();
    registerReportPreparationRoutes(router, fakeConnection);
    const res = fakeRes();
    await router.handle(
      fakeReq('/api/audits/audit-1/report-preparation/candidate/es/preview'),
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});
