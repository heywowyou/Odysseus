import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@odysseus/scanner', () => ({
  buildAuditDir: vi.fn(() => '/artifacts/example.com/2026-09-12T00-00-00Z'),
  getArtifactsRoot: vi.fn(() => '/artifacts'),
}));
vi.mock('@odysseus/store', () => ({
  getAuditManualFields: vi.fn(),
  syncProspectIdentityIntoAudit: vi.fn(),
  getAuditRuntimeFields: vi.fn(),
  reconcileFailedAuditJobs: vi.fn(),
  approveWritingCandidate: vi.fn(),
  recordReadyWritingCandidate: vi.fn(),
  resolveSelectedAnalysisPairForAudit: vi.fn(),
}));
vi.mock('@odysseus/llm', () => ({ pauseBetweenLanguagePasses: vi.fn() }));
vi.mock('../artifacts/sync-audit-artifacts.js', () => ({ syncAuditDirToBucket: vi.fn() }));
vi.mock('./backfill-audit-row.js', () => ({ backfillAuditRow: vi.fn() }));
vi.mock('./renormalize-audit.js', () => ({ renormalizeAudit: vi.fn() }));
vi.mock('./analysis-stage.js', () => ({ runAnalysisStage: vi.fn() }));
vi.mock('./audit-stage.js', () => ({ runAuditStage: vi.fn() }));
vi.mock('./regenerate-reports.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./regenerate-reports.js')>()),
  readAuditArtifacts: vi.fn(),
  regenerateReportsForAudit: vi.fn(),
}));

import { buildFindingsProvenance } from '@odysseus/core';
import {
  getAuditManualFields,
  getAuditRuntimeFields,
  reconcileFailedAuditJobs,
  approveWritingCandidate,
  recordReadyWritingCandidate,
  resolveSelectedAnalysisPairForAudit,
} from '@odysseus/store';
import { ReportIdentityUnconfirmedError } from '@odysseus/report';
import { syncAuditDirToBucket } from '../artifacts/sync-audit-artifacts.js';
import { backfillAuditRow } from './backfill-audit-row.js';
import { renormalizeAudit } from './renormalize-audit.js';
import { runAnalysisStage } from './analysis-stage.js';
import { runAuditStage } from './audit-stage.js';
import {
  readAuditArtifacts,
  regenerateReportsForAudit,
  AuditArtifactsUnavailableError,
  NoAnalysisPairError,
} from './regenerate-reports.js';
import { makeReportReady } from './make-report-ready.js';
import { RegenerationConflictError } from './regeneration-conflict-error.js';
import { reportProductionState } from './report-production-state.js';

const fakeConnection = {} as never;

function fakeAuditRuntimeFields() {
  return {
    auditId: 'audit-1',
    siteUrl: 'https://example.com/',
    startedAt: new Date('2026-09-12T00:00:00.000Z'),
    findingsProvenance: buildFindingsProvenance([]),
  };
}

const freshProvenance = buildFindingsProvenance([]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuditRuntimeFields).mockResolvedValue(fakeAuditRuntimeFields());
  vi.mocked(getAuditManualFields).mockResolvedValue(undefined);
  vi.mocked(reconcileFailedAuditJobs).mockResolvedValue(0);
  vi.mocked(resolveSelectedAnalysisPairForAudit).mockResolvedValue({ kind: 'none' } as never);
});

describe('makeReportReady', () => {
  it('refuses when the audit does not exist', async () => {
    vi.mocked(getAuditRuntimeFields).mockResolvedValue(null);

    const outcome = await makeReportReady(fakeConnection, 'missing', undefined);

    expect(outcome).toEqual({ kind: 'refused', refusal: { kind: 'audit-not-found' } });
  });

  it('refuses with scan-data-missing when artifacts cannot be read', async () => {
    vi.mocked(readAuditArtifacts).mockRejectedValue(new AuditArtifactsUnavailableError());

    const outcome = await makeReportReady(fakeConnection, 'audit-1', undefined);

    expect(outcome).toEqual({ kind: 'refused', refusal: { kind: 'scan-data-missing' } });
    expect(renormalizeAudit).not.toHaveBeenCalled();
  });

  it('renders directly when findings are already fresh', async () => {
    vi.mocked(readAuditArtifacts).mockResolvedValue({
      manifest: { findingsProvenance: freshProvenance } as never,
      findings: [],
    });
    const reports = [{ language: 'fr' }, { language: 'en' }] as never;
    vi.mocked(regenerateReportsForAudit).mockResolvedValue(reports);

    const outcome = await makeReportReady(fakeConnection, 'audit-1', undefined);

    expect(outcome).toEqual({ kind: 'ready', reports, findingsWereRefreshed: false });
    expect(renormalizeAudit).not.toHaveBeenCalled();
    expect(reconcileFailedAuditJobs).toHaveBeenCalledWith(fakeConnection);
  });

  it('refuses with no-analysis when there is no complete pair to render', async () => {
    vi.mocked(readAuditArtifacts).mockResolvedValue({
      manifest: { findingsProvenance: freshProvenance } as never,
      findings: [],
    });
    vi.mocked(regenerateReportsForAudit).mockRejectedValue(new NoAnalysisPairError());

    const outcome = await makeReportReady(fakeConnection, 'audit-1', undefined);

    expect(outcome).toEqual({ kind: 'refused', refusal: { kind: 'no-analysis' } });
  });

  it('refuses with identity-unconfirmed and the offending fields', async () => {
    vi.mocked(readAuditArtifacts).mockResolvedValue({
      manifest: { findingsProvenance: freshProvenance } as never,
      findings: [],
    });
    const fields = [{ field: 'nomCommercial', value: 'Site Officiel' }] as never;
    vi.mocked(regenerateReportsForAudit).mockRejectedValue(
      new ReportIdentityUnconfirmedError(fields, 'unconfirmed'),
    );

    const outcome = await makeReportReady(fakeConnection, 'audit-1', undefined);

    expect(outcome).toEqual({
      kind: 'refused',
      refusal: { kind: 'identity-unconfirmed', fields },
    });
  });

  it('renormalizes, regenerates the writing pair, then renders, when findings are stale', async () => {
    // Stamped fingerprint differs from what the current code would
    // compute from findings.json - the exact Les Flots Bleus scenario.
    vi.mocked(readAuditArtifacts).mockResolvedValue({
      manifest: {
        findingsProvenance: { ...freshProvenance, normalizationFingerprint: 'old-fingerprint' },
      } as never,
      findings: [],
    });
    vi.mocked(renormalizeAudit).mockResolvedValue({
      auditId: 'audit-1',
      pageCount: 1,
      findingCount: 0,
      manifest: { findingsProvenance: freshProvenance } as never,
    });
    vi.mocked(backfillAuditRow).mockResolvedValue(undefined as never);
    vi.mocked(runAnalysisStage).mockImplementation(
      async (_dir, _manifest, _findings, options) =>
        ({
          analysis: {
            analysisId: `analysis-${options.language}`,
            findingsProvenance: freshProvenance,
          },
          advisoryPasses: [],
        }) as never,
    );
    vi.mocked(recordReadyWritingCandidate).mockResolvedValue(undefined as never);
    vi.mocked(approveWritingCandidate).mockResolvedValue(undefined as never);
    const reports = [{ language: 'fr' }, { language: 'en' }] as never;
    vi.mocked(regenerateReportsForAudit).mockResolvedValue(reports);

    const outcome = await makeReportReady(fakeConnection, 'audit-1', undefined);

    expect(renormalizeAudit).toHaveBeenCalledWith(
      '/artifacts/example.com/2026-09-12T00-00-00Z',
      undefined,
    );
    expect(backfillAuditRow).toHaveBeenCalled();
    expect(syncAuditDirToBucket).toHaveBeenCalled();
    expect(runAnalysisStage).toHaveBeenCalledTimes(2);
    expect(recordReadyWritingCandidate).toHaveBeenCalledWith(
      fakeConnection,
      'audit-1',
      expect.objectContaining({ frAnalysisId: 'analysis-fr', enAnalysisId: 'analysis-en' }),
    );
    expect(approveWritingCandidate).toHaveBeenCalledWith(fakeConnection, 'audit-1');
    expect(outcome).toEqual({ kind: 'ready', reports, findingsWereRefreshed: true });
    // Plan 050: the refresh rebuilds derived data from stored evidence only.
    // The scanner mock above exposes no crawl entry point, and the audit
    // stage (the only path to a website request) is never reached.
    expect(runAuditStage).not.toHaveBeenCalled();
  });

  it('rewrites a selected pair older than the already refreshed findings instead of rendering it', async () => {
    vi.mocked(readAuditArtifacts).mockResolvedValue({
      manifest: { findingsProvenance: freshProvenance } as never,
      findings: [],
    });
    const oldProvenance = { ...freshProvenance, normalizationFingerprint: 'old-fingerprint' };
    vi.mocked(resolveSelectedAnalysisPairForAudit).mockResolvedValue({
      kind: 'selected',
      fr: { analysisId: 'old-fr', findingsProvenance: oldProvenance },
      en: { analysisId: 'old-en', findingsProvenance: oldProvenance },
    } as never);
    vi.mocked(runAnalysisStage).mockImplementation(
      async (_dir, _manifest, _findings, options) =>
        ({
          analysis: {
            analysisId: `analysis-${options.language}`,
            findingsProvenance: freshProvenance,
          },
          advisoryPasses: [],
        }) as never,
    );
    const reports = [{ language: 'fr' }, { language: 'en' }] as never;
    vi.mocked(regenerateReportsForAudit).mockResolvedValue(reports);

    const outcome = await makeReportReady(fakeConnection, 'audit-1', undefined);

    expect(renormalizeAudit).not.toHaveBeenCalled();
    expect(runAnalysisStage).toHaveBeenCalledTimes(2);
    expect(approveWritingCandidate).toHaveBeenCalledWith(fakeConnection, 'audit-1');
    expect(vi.mocked(approveWritingCandidate).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(regenerateReportsForAudit).mock.invocationCallOrder[0]!,
    );
    expect(outcome).toEqual({ kind: 'ready', reports, findingsWereRefreshed: true });
  });

  it('refuses a second production for the same audit while the first is running', async () => {
    vi.mocked(readAuditArtifacts).mockResolvedValue({
      manifest: { findingsProvenance: freshProvenance } as never,
      findings: [],
    });
    let finish: (value: never) => void = () => undefined;
    vi.mocked(regenerateReportsForAudit).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    const first = makeReportReady(fakeConnection, 'audit-1', undefined);
    await expect(makeReportReady(fakeConnection, 'audit-1', undefined)).rejects.toBeInstanceOf(
      RegenerationConflictError,
    );
    finish([] as never);
    await expect(first).resolves.toMatchObject({ kind: 'ready' });

    vi.mocked(regenerateReportsForAudit).mockResolvedValue([] as never);
    await expect(makeReportReady(fakeConnection, 'audit-1', undefined)).resolves.toMatchObject({
      kind: 'ready',
    });
  });

  it('exposes the PDF stage while rendering, then completed (issue #376)', async () => {
    vi.mocked(readAuditArtifacts).mockResolvedValue({
      manifest: { findingsProvenance: freshProvenance } as never,
      findings: [],
    });
    let finish: (value: never) => void = () => undefined;
    vi.mocked(regenerateReportsForAudit).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    const run = makeReportReady(fakeConnection, 'audit-stages', undefined);
    await vi.waitFor(() =>
      expect(reportProductionState('audit-stages').status).toBe('pdf-generation'),
    );
    finish([] as never);
    await run;
    expect(reportProductionState('audit-stages').status).toBe('completed');
  });

  it('records a failed PDF stage with its message, and a refusal as idle (issue #376)', async () => {
    vi.mocked(readAuditArtifacts).mockResolvedValue({
      manifest: { findingsProvenance: freshProvenance } as never,
      findings: [],
    });
    vi.mocked(regenerateReportsForAudit).mockRejectedValueOnce(new Error('renderer crashed'));
    await expect(makeReportReady(fakeConnection, 'audit-failed', undefined)).rejects.toThrow();
    expect(reportProductionState('audit-failed')).toMatchObject({
      status: 'failed',
      stage: 'pdf-generation',
      message: 'renderer crashed',
    });

    vi.mocked(regenerateReportsForAudit).mockRejectedValueOnce(new NoAnalysisPairError());
    await makeReportReady(fakeConnection, 'audit-failed', undefined);
    expect(reportProductionState('audit-failed')).toEqual({ status: 'idle' });
  });
});
