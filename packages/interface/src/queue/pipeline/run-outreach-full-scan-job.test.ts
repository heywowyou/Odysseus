import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../pipeline/audit-stage.js', () => ({ runAuditStage: vi.fn() }));
vi.mock('@odysseus/store', () => ({
  planOutreachFullScan: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
  ensureJobRunIdentity: vi.fn(),
}));
vi.mock('@odysseus/scanner', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  deleteCrawlCheckpoint: vi.fn(),
  deleteCrawlStateFile: vi.fn(),
}));
vi.mock('../report-progress.js', () => ({ createScanProgressReporter: vi.fn() }));
vi.mock('../../prospecting/hotel-qualification/qualify-hotels.js', () => ({
  CURRENT_QUALIFICATION_VERSION: 'v-test',
}));

import { runAuditStage } from '../../pipeline/audit-stage.js';
import { completeJob, ensureJobRunIdentity, failJob, planOutreachFullScan } from '@odysseus/store';
import { deleteCrawlCheckpoint, deleteCrawlStateFile, OriginLock } from '@odysseus/scanner';
import { createScanProgressReporter } from '../report-progress.js';
import { CancellationRegistry } from '../cancellation.js';
import { runOutreachFullScanJob } from './run-outreach-full-scan-job.js';
import type { PipelineContext } from '../job-queue.js';

const fakeConnection = {} as never;

function fakeJob(
  overrides: Partial<{ jobId: string; siteUrl: string; options: Record<string, unknown> }> = {},
) {
  return {
    jobId: overrides.jobId ?? 'job-1',
    type: 'outreach-full-scan',
    status: 'running',
    phase: 'queued',
    siteUrl: overrides.siteUrl ?? 'https://example.com/',
    options: overrides.options ?? {
      outreachCandidateId: 'candidate-1',
      outreachCohortId: 'cohort-1',
      outreachScoringVersion: 'hotel-outreach-v1',
    },
    createdAt: new Date(),
    progress: {},
  } as never;
}

function fakeContext(): PipelineContext {
  return {
    connection: fakeConnection,
    originLock: new OriginLock(),
    cancellation: new CancellationRegistry(),
  };
}

function fakeAuditResult() {
  return {
    auditId: 'audit-1',
    manifest: { auditId: 'audit-1', pages: [] } as never,
    findings: [] as never,
    auditDir: '/artifacts/example.com/dir',
    visitedCount: 2,
    prunedPageDirCount: 0,
    coverageSummary: { kind: 'legacy-unknown', inventoriedUrlCount: 2 } as never,
    obligationAssessment: { status: 'undetermined', basis: [] } as never,
  };
}

describe('runOutreachFullScanJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(planOutreachFullScan).mockResolvedValue({
      candidateId: 'candidate-1',
      domain: 'example.com',
      cohortId: 'cohort-1',
      scoringVersion: 'hotel-outreach-v1',
    });
    vi.mocked(ensureJobRunIdentity).mockResolvedValue({
      startedAt: new Date('2026-09-11T00:00:00.000Z'),
      auditId: 'audit-1',
    });
    vi.mocked(runAuditStage).mockResolvedValue(fakeAuditResult());
    vi.mocked(createScanProgressReporter).mockReturnValue(vi.fn());
  });

  it('re-validates the plan, runs the audit stage with outreach provenance, and stops before analysis', async () => {
    await runOutreachFullScanJob(fakeJob(), fakeContext());

    expect(planOutreachFullScan).toHaveBeenCalledWith(fakeConnection, 'candidate-1', {
      qualificationVersion: 'v-test',
    });
    expect(runAuditStage).toHaveBeenCalledTimes(1);
    const [, options] = vi.mocked(runAuditStage).mock.calls[0]!;
    expect(options.outreachContext).toEqual({
      candidateId: 'candidate-1',
      cohortId: 'cohort-1',
      scoringVersion: 'hotel-outreach-v1',
    });
    expect(completeJob).toHaveBeenCalledWith(fakeConnection, 'job-1', { auditId: 'audit-1' });
    expect(deleteCrawlCheckpoint).toHaveBeenCalledWith('/artifacts/example.com/dir');
    expect(deleteCrawlStateFile).toHaveBeenCalledWith('/artifacts/example.com/dir');
  });

  it('fails the job without scanning when the plan refuses', async () => {
    vi.mocked(planOutreachFullScan).mockResolvedValue({ refused: 'suppressed' });

    await runOutreachFullScanJob(fakeJob(), fakeContext());

    expect(failJob).toHaveBeenCalledWith(
      fakeConnection,
      'job-1',
      'outreach full scan refused: suppressed',
    );
    expect(runAuditStage).not.toHaveBeenCalled();
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('fails the job when the job URL no longer matches the selection domain', async () => {
    vi.mocked(planOutreachFullScan).mockResolvedValue({
      candidateId: 'candidate-1',
      domain: 'renamed.example',
      cohortId: 'cohort-1',
      scoringVersion: 'hotel-outreach-v1',
    });

    await runOutreachFullScanJob(fakeJob(), fakeContext());

    expect(failJob).toHaveBeenCalledWith(
      fakeConnection,
      'job-1',
      expect.stringContaining('domain-mismatch'),
    );
    expect(runAuditStage).not.toHaveBeenCalled();
  });

  it('throws on a job whose options carry no candidate provenance', async () => {
    await expect(runOutreachFullScanJob(fakeJob({ options: {} }), fakeContext())).rejects.toThrow(
      /no candidate provenance/u,
    );
    expect(runAuditStage).not.toHaveBeenCalled();
  });
});
