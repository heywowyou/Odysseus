import { beforeEach, describe, expect, it, vi } from 'vitest';

// Issue #559: no catalogue facts, as for an audit with no directory entry.
vi.mock('../../pipeline/catalogue-site-context.js', () => ({
  catalogueContextOption: vi.fn(async () => ({})),
}));

vi.mock('../../pipeline/audit-stage.js', () => ({ runAuditStage: vi.fn() }));
vi.mock('@odysseus/scanner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odysseus/scanner')>()),
  serverLockKeys: vi.fn(async (url: string) => [new URL(url).origin, 'address:192.0.2.1']),
}));
vi.mock('../../pipeline/analysis-stage.js', () => ({ runAnalysisStage: vi.fn() }));
vi.mock('../../pipeline/report-stage.js', () => ({ runAllReportsStage: vi.fn() }));
vi.mock('@odysseus/store', () => ({
  approveWritingCandidate: vi.fn(),
  completeJob: vi.fn(),
  recordReadyWritingCandidate: vi.fn(),
  updateJobProgress: vi.fn(),
  ensureJobRunIdentity: vi.fn(),
  isJobClaimCurrent: vi.fn(),
}));
import { runAuditStage } from '../../pipeline/audit-stage.js';
import { runAnalysisStage } from '../../pipeline/analysis-stage.js';
import { runAllReportsStage } from '../../pipeline/report-stage.js';
import {
  approveWritingCandidate,
  completeJob,
  ensureJobRunIdentity,
  recordReadyWritingCandidate,
  isJobClaimCurrent,
  updateJobProgress,
} from '@odysseus/store';
import { runFullAuditJob } from './run-full-audit-job.js';
import { CancellationRegistry, JobCancelledError } from '../cancellation.js';
import type { PipelineContext } from '../job-queue.js';

const fakeConnection = {} as never;

function fakeJob(
  overrides: Partial<{ jobId: string; siteUrl: string; options: Record<string, unknown> }> = {},
) {
  return {
    jobId: overrides.jobId ?? 'job-1',
    type: 'full-audit',
    status: 'running',
    phase: 'queued',
    siteUrl: overrides.siteUrl ?? 'https://example.com/',
    options: overrides.options ?? {},
    createdAt: new Date(),
    progress: {},
  } as never;
}

function fakeAuditResult() {
  return {
    auditId: 'audit-1',
    manifest: {
      auditId: 'audit-1',
      pages: [
        {
          url: 'https://example.com/',
          status: 'visited',
          errors: {},
          coreWebVitals: { lcp: { score: 0.9, numericValue: 1800, displayValue: '1.8 s' } },
        },
      ],
    } as never,
    findings: [] as never,
    auditDir: '/artifacts/example.com/dir',
    visitedCount: 2,
    prunedPageDirCount: 0,
    coverageSummary: {
      kind: 'current' as const,
      inventoriedUrlCount: 2,
      noindexPageCount: 0,
      continuationOmittedUrlCount: 0,
      content: { completed: 2, partial: 0, failed: 0 },
      passes: {
        rendered: { completed: 2, partial: 0, failed: 0, notPlanned: 0 },
        axe: { completed: 2, partial: 0, failed: 0, notPlanned: 0 },
        extended: { completed: 2, partial: 0, failed: 0, notPlanned: 0 },
        lighthouse: { completed: 1, partial: 0, failed: 0, notPlanned: 1 },
      },
      pagesWithoutContentAnalysis: {},
      templateFamilyCount: 1,
    },
    obligationAssessment: { status: 'undetermined', basis: [] } as never,
  };
}

function fakeAnalysisResult(language: 'fr' | 'en') {
  return {
    analysis: { language, auditId: 'audit-1' } as never,
    analysisPath: `/artifacts/example.com/dir/analyses/x-${language}.json`,
    structurePath: '/artifacts/example.com/dir/analyses/x-structure.json',
    structureReused: language === 'en',
    writingReused: false,
    unreferencedFindingCount: 0,
    usedFallbackContext: true,
    // Issue #145: the runner settles this field after the report stage, so
    // the mocked stage result has to carry it (empty: nothing pending).
    advisoryPasses: [] as Promise<void>[],
    sanitizationWarnings: [],
  };
}

let release: ReturnType<typeof vi.fn>;
let ctx: PipelineContext;

beforeEach(() => {
  vi.clearAllMocks();
  release = vi.fn();
  ctx = {
    connection: fakeConnection,
    originLock: {} as never,
    acquireServer: vi.fn().mockResolvedValue(release),
    cancellation: new CancellationRegistry(),
  };

  vi.mocked(runAuditStage).mockResolvedValue(fakeAuditResult());
  vi.mocked(runAnalysisStage).mockImplementation(async (_dir, _manifest, _findings, options) =>
    fakeAnalysisResult((options as { language: 'fr' | 'en' }).language),
  );
  vi.mocked(runAllReportsStage).mockResolvedValue([
    {
      language: 'fr',
      reportPath: '/dir/reports/x.pdf',
      generatedAt: new Date(),
      pageCount: 44,
    },
  ]);
  vi.mocked(approveWritingCandidate).mockResolvedValue(undefined as never);
  vi.mocked(recordReadyWritingCandidate).mockResolvedValue(undefined as never);
  vi.mocked(completeJob).mockResolvedValue(undefined);
  vi.mocked(updateJobProgress).mockResolvedValue(undefined);
  vi.mocked(ensureJobRunIdentity).mockResolvedValue({
    startedAt: new Date('2026-09-09T00:00:00.000Z'),
    auditId: 'run-audit-1',
  });
});

describe('runFullAuditJob', () => {
  it('runs scan -> analyze(fr) -> render French -> complete, in order', async () => {
    const job = fakeJob();
    const calls: string[] = [];
    vi.mocked(runAuditStage).mockImplementation(async () => {
      calls.push('audit');
      return fakeAuditResult();
    });
    vi.mocked(runAnalysisStage).mockImplementation(async (_d, _m, _f, options) => {
      calls.push(`analyze-${(options as { language: string }).language}`);
      return fakeAnalysisResult((options as { language: 'fr' | 'en' }).language);
    });
    vi.mocked(runAllReportsStage).mockImplementation(async () => {
      calls.push('report-all');
      return [];
    });
    vi.mocked(completeJob).mockImplementation(async () => {
      calls.push('complete');
    });

    await runFullAuditJob(job, ctx);

    expect(calls).toEqual(['audit', 'analyze-fr', 'report-all', 'complete']);
  });

  it('renders only the canonical French analysis on the normal path', async () => {
    const job = fakeJob();
    await runFullAuditJob(job, ctx);

    expect(runAllReportsStage).toHaveBeenCalledTimes(1);
    expect(runAllReportsStage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      {
        fr: expect.objectContaining({ language: 'fr' }),
      },
      fakeConnection,
      // Issue #140: the runner computes the provenance once over the audit
      // findings and threads the same value down as the new trailing
      // argument.
      expect.anything(),
    );
  });

  it('acquires and releases the origin and server locks for the job siteUrl', async () => {
    const job = fakeJob({ siteUrl: 'https://a.example/page' });
    await runFullAuditJob(job, ctx);

    expect(ctx.acquireServer).toHaveBeenCalledWith(['https://a.example', 'address:192.0.2.1']);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('passes job.options through to runAuditStage', async () => {
    const job = fakeJob({
      options: { maxPages: 5, maxDepth: 1, delayMs: 250, scanConcurrency: 1 },
    });
    await runFullAuditJob(job, ctx);

    expect(runAuditStage).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({
        maxPages: 5,
        maxDepth: 1,
        delayMs: 250,
        scanConcurrency: 1,
        scanIntent: 'full-audit',
      }),
      fakeConnection,
    );
  });

  // Plan 035 (issue #124): one identity per job, minted once, reused by
  // every orphan re-claim, and handed to the audit stage so the audit
  // directory is stable across re-claims.
  it('stamps the job run identity once and forwards it into runAuditStage options', async () => {
    const runIdentity = { startedAt: new Date('2026-09-09T00:00:00.000Z'), auditId: 'run-audit-1' };
    vi.mocked(ensureJobRunIdentity).mockResolvedValue(runIdentity);
    const job = fakeJob();
    await runFullAuditJob(job, ctx);

    expect(ensureJobRunIdentity).toHaveBeenCalledTimes(1);
    expect(ensureJobRunIdentity).toHaveBeenCalledWith(fakeConnection, 'job-1');
    expect(runAuditStage).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ runIdentity }),
      fakeConnection,
    );
  });

  it('fences the audit stage on the claim this worker holds', async () => {
    const job = { ...(fakeJob() as object), claimId: 'claim-1' } as never;
    await runFullAuditJob(job, ctx);

    const options = vi.mocked(runAuditStage).mock.calls[0]![1];
    expect(options.acquisitionClaim?.claimId).toBe('claim-1');
    vi.mocked(isJobClaimCurrent).mockResolvedValue(false);
    await expect(options.acquisitionClaim?.isCurrent()).resolves.toBe(false);
    expect(isJobClaimCurrent).toHaveBeenCalledWith(fakeConnection, 'job-1', 'claim-1');
  });

  it('runs unfenced for a job claimed before claim ids existed', async () => {
    await runFullAuditJob(fakeJob(), ctx);
    expect(vi.mocked(runAuditStage).mock.calls[0]![1]).not.toHaveProperty('acquisitionClaim');
  });

  it('completes the job with the produced auditId', async () => {
    const job = fakeJob();
    await runFullAuditJob(job, ctx);

    expect(completeJob).toHaveBeenCalledWith(fakeConnection, 'job-1', { auditId: 'audit-1' });
  });

  // P0.1 (2026-08-21 La Corniche feedback pass): a completed job whose
  // report has zero Core Web Vitals data used to look identical, in the
  // dashboard, to a genuinely complete one.
  it('flags needsReview when no page has any measured Core Web Vital', async () => {
    vi.mocked(runAuditStage).mockResolvedValue({
      ...fakeAuditResult(),
      manifest: {
        auditId: 'audit-1',
        pages: [{ url: 'https://example.com/', errors: {} }],
      } as never,
    });
    const job = fakeJob();
    await runFullAuditJob(job, ctx);

    expect(completeJob).toHaveBeenCalledWith(
      fakeConnection,
      'job-1',
      expect.objectContaining({ needsReview: expect.stringContaining('Lighthouse') }),
    );
  });

  it('does not flag needsReview when at least one page has measured Core Web Vitals', async () => {
    const job = fakeJob();
    await runFullAuditJob(job, ctx);

    expect(completeJob).toHaveBeenCalledWith(fakeConnection, 'job-1', { auditId: 'audit-1' });
  });

  it('passes the obligationAssessment computed by runAuditStage into the French analysis', async () => {
    const job = fakeJob();
    await runFullAuditJob(job, ctx);

    const obligationAssessment = fakeAuditResult().obligationAssessment;
    expect(runAnalysisStage).toHaveBeenCalledTimes(1);
    expect(runAnalysisStage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ language: 'fr', obligationAssessment }),
      fakeConnection,
    );
  });

  it('releases the origin lock even when a stage throws', async () => {
    vi.mocked(runAnalysisStage).mockRejectedValueOnce(new Error('llm boom'));
    const job = fakeJob();

    await expect(runFullAuditJob(job, ctx)).rejects.toThrow('llm boom');
    expect(release).toHaveBeenCalledTimes(1);
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('throws if the job has no siteUrl', async () => {
    const job = {
      jobId: 'job-1',
      type: 'full-audit',
      status: 'running',
      phase: 'queued',
      options: {},
      createdAt: new Date(),
      progress: {},
    } as never;

    await expect(runFullAuditJob(job, ctx)).rejects.toThrow(/no siteUrl/);
  });

  describe('stop between stages', () => {
    it('links the audit, then stops before analysis when the stop came during the scan', async () => {
      vi.mocked(runAuditStage).mockImplementation(async () => {
        ctx.cancellation.request('job-1');
        return fakeAuditResult();
      });

      await expect(runFullAuditJob(fakeJob(), ctx)).rejects.toBeInstanceOf(JobCancelledError);
      expect(updateJobProgress).toHaveBeenCalledWith(fakeConnection, 'job-1', {
        phase: 'analyze-fr',
        auditId: 'audit-1',
      });
      expect(runAnalysisStage).not.toHaveBeenCalled();
      expect(completeJob).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalled();
    });

    it('skips rendering when the stop came during the French analysis', async () => {
      vi.mocked(runAnalysisStage).mockImplementationOnce(async () => {
        ctx.cancellation.request('job-1');
        return fakeAnalysisResult('fr');
      });

      await expect(runFullAuditJob(fakeJob(), ctx)).rejects.toBeInstanceOf(JobCancelledError);
      expect(runAnalysisStage).toHaveBeenCalledTimes(1);
      expect(runAllReportsStage).not.toHaveBeenCalled();
    });
  });
});
