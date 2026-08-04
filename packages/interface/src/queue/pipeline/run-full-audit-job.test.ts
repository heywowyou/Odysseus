import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../pipeline/audit-stage.js', () => ({ runAuditStage: vi.fn() }));
vi.mock('../../pipeline/analysis-stage.js', () => ({ runAnalysisStage: vi.fn() }));
vi.mock('../../pipeline/report-stage.js', () => ({ runReportStage: vi.fn() }));
vi.mock('@odysseus/store', () => ({ completeJob: vi.fn(), updateJobProgress: vi.fn() }));

import { runAuditStage } from '../../pipeline/audit-stage.js';
import { runAnalysisStage } from '../../pipeline/analysis-stage.js';
import { runReportStage } from '../../pipeline/report-stage.js';
import { completeJob, updateJobProgress } from '@odysseus/store';
import { runFullAuditJob } from './run-full-audit-job.js';
import type { PipelineContext } from '../job-queue.js';

const fakeConnection = {} as never;

function fakeJob(overrides: Partial<{ jobId: string; siteUrl: string; options: Record<string, unknown> }> = {}) {
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
    manifest: { auditId: 'audit-1' } as never,
    findings: [] as never,
    auditDir: '/artifacts/example.com/dir',
    visitedCount: 2,
    prunedPageDirCount: 0,
  };
}

function fakeAnalysisResult(language: 'fr' | 'en') {
  return {
    analysis: { language, auditId: 'audit-1' } as never,
    analysisPath: `/artifacts/example.com/dir/analyses/x-${language}.json`,
    structurePath: '/artifacts/example.com/dir/analyses/x-structure.json',
    structureReused: language === 'en',
    unreferencedFindingCount: 0,
    usedFallbackContext: true,
  };
}

let release: ReturnType<typeof vi.fn>;
let ctx: PipelineContext;

beforeEach(() => {
  vi.clearAllMocks();
  release = vi.fn();
  ctx = {
    connection: fakeConnection,
    originLock: { acquire: vi.fn().mockResolvedValue(release) } as never,
  };

  vi.mocked(runAuditStage).mockResolvedValue(fakeAuditResult());
  vi.mocked(runAnalysisStage).mockImplementation(async (_dir, _manifest, _findings, options) =>
    fakeAnalysisResult((options as { language: 'fr' | 'en' }).language),
  );
  vi.mocked(runReportStage).mockResolvedValue({ reportPath: '/dir/reports/x.pdf', generatedAt: new Date() });
  vi.mocked(completeJob).mockResolvedValue(undefined);
  vi.mocked(updateJobProgress).mockResolvedValue(undefined);
});

describe('runFullAuditJob', () => {
  it('runs scan -> analyze(fr) -> analyze(en) -> report(fr) -> report(en) -> complete, in order', async () => {
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
    vi.mocked(runReportStage).mockImplementation(async (_d, _m, _f, analysis) => {
      calls.push(`report-${(analysis as { language: string }).language}`);
      return { reportPath: '/x.pdf', generatedAt: new Date() };
    });
    vi.mocked(completeJob).mockImplementation(async () => {
      calls.push('complete');
    });

    await runFullAuditJob(job, ctx);

    expect(calls).toEqual(['audit', 'analyze-fr', 'analyze-en', 'report-fr', 'report-en', 'complete']);
  });

  it('acquires and releases the origin lock for the job siteUrl', async () => {
    const job = fakeJob({ siteUrl: 'https://a.example/page' });
    await runFullAuditJob(job, ctx);

    expect(ctx.originLock.acquire).toHaveBeenCalledWith('https://a.example');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('passes job.options through to runAuditStage', async () => {
    const job = fakeJob({ options: { maxPages: 5, maxDepth: 1, delayMs: 250 } });
    await runFullAuditJob(job, ctx);

    expect(runAuditStage).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ maxPages: 5, maxDepth: 1, delayMs: 250 }),
      fakeConnection,
    );
  });

  it('completes the job with the produced auditId', async () => {
    const job = fakeJob();
    await runFullAuditJob(job, ctx);

    expect(completeJob).toHaveBeenCalledWith(fakeConnection, 'job-1', { auditId: 'audit-1' });
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
});
