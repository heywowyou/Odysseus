import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../outreach/draft-runtime.js', () => ({
  createTouchOneDraft: vi.fn(),
  createFollowUpForProspect: vi.fn(),
}));
vi.mock('../../pipeline/audit-stage.js', () => ({ runAuditStage: vi.fn() }));
vi.mock('../../pipeline/finalize-prospect-scan.js', () => ({ finalizeProspectScan: vi.fn() }));
vi.mock('../report-progress.js', () => ({ createScanProgressReporter: vi.fn(() => vi.fn()) }));
vi.mock('@odysseus/store', () => ({
  completeJob: vi.fn(),
  ensureJobRunIdentity: vi.fn(),
  listThreadsDueForFollowUp: vi.fn(),
  updateJobProgress: vi.fn(),
}));
vi.mock('@odysseus/scanner', () => ({
  deleteCrawlCheckpoint: vi.fn(),
  deleteCrawlStateFile: vi.fn(),
}));

import {
  completeJob,
  ensureJobRunIdentity,
  listThreadsDueForFollowUp,
  updateJobProgress,
} from '@odysseus/store';
import { deleteCrawlCheckpoint } from '@odysseus/scanner';
import { createFollowUpForProspect, createTouchOneDraft } from '../../outreach/draft-runtime.js';
import { runAuditStage } from '../../pipeline/audit-stage.js';
import { finalizeProspectScan } from '../../pipeline/finalize-prospect-scan.js';
import { CancellationRegistry, JobCancelledError } from '../cancellation.js';
import type { PipelineContext } from '../job-queue.js';
import { runOutreachDraftBatchJob } from './run-outreach-draft-batch-job.js';
import { runOutreachFollowupBatchJob } from './run-outreach-followup-batch-job.js';
import { runOutreachFullScanJob } from './run-outreach-full-scan-job.js';

const connection = {} as never;

function fakeJob(type: string, options: Record<string, unknown>, siteUrl?: string) {
  return {
    jobId: `${type}-1`,
    type,
    status: 'running',
    phase: 'queued',
    options,
    createdAt: new Date(),
    progress: {},
    ...(siteUrl === undefined ? {} : { siteUrl }),
  } as never;
}

let ctx: PipelineContext;
let release: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  release = vi.fn();
  ctx = {
    connection,
    originLock: { acquire: vi.fn().mockResolvedValue(release) } as never,
    cancellation: new CancellationRegistry(),
  };
});

describe('runOutreachDraftBatchJob', () => {
  it('drafts the first email and records the outcome on the job', async () => {
    vi.mocked(createTouchOneDraft).mockResolvedValue({
      configured: true,
      created: false,
      refusal: 'suppressed-before-provider',
    });

    await runOutreachDraftBatchJob(fakeJob('outreach-draft-batch', { prospectId: 'p-1' }), ctx);

    expect(createTouchOneDraft).toHaveBeenCalledWith(connection, 'p-1', {
      language: 'fr',
      previewToken: '',
    });
    const result = { id: 'p-1', created: false, refusal: 'suppressed-before-provider' };
    expect(updateJobProgress).toHaveBeenCalledWith(connection, 'outreach-draft-batch-1', {
      phase: 'drafting',
      progress: { message: '1 of 1 drafted' },
      outreachBatchResults: [result],
    });
    expect(completeJob).toHaveBeenCalledWith(connection, 'outreach-draft-batch-1', {
      outreachBatchResults: [result],
    });
  });

  it('fails the job when no mailbox is configured', async () => {
    vi.mocked(createTouchOneDraft).mockResolvedValue({
      configured: false,
      refusal: 'no-mailbox-configured',
    });
    await expect(
      runOutreachDraftBatchJob(fakeJob('outreach-draft-batch', { prospectId: 'p-1' }), ctx),
    ).rejects.toThrow('no mailbox is configured');
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('drafts nothing once stopped, and refuses a job with no prospect', async () => {
    ctx.cancellation.request('outreach-draft-batch-1');
    await expect(
      runOutreachDraftBatchJob(fakeJob('outreach-draft-batch', { prospectId: 'p-1' }), ctx),
    ).rejects.toBeInstanceOf(JobCancelledError);
    await expect(
      runOutreachDraftBatchJob(fakeJob('outreach-draft-batch', {}), ctx),
    ).rejects.toThrow('has no prospectId');
    expect(createTouchOneDraft).not.toHaveBeenCalled();
  });
});

describe('runOutreachFollowupBatchJob', () => {
  const due = [
    { threadId: 't-1', prospectId: 'p-1' },
    { threadId: 't-2', prospectId: 'p-2' },
  ];

  it('drafts a follow-up for each due thread within the limit', async () => {
    vi.mocked(listThreadsDueForFollowUp).mockResolvedValue(due as never);
    vi.mocked(createFollowUpForProspect)
      .mockResolvedValueOnce({ configured: true, created: true })
      .mockResolvedValueOnce({ configured: true, created: false, refusal: 'thread-closed' });

    await runOutreachFollowupBatchJob(fakeJob('outreach-followup-batch', { limit: 2 }), ctx);

    expect(listThreadsDueForFollowUp).toHaveBeenCalledWith(connection, {
      now: expect.any(Date),
      limit: 2,
    });
    expect(vi.mocked(createFollowUpForProspect).mock.calls.map((call) => call[1])).toEqual([
      'p-1',
      'p-2',
    ]);
    expect(completeJob).toHaveBeenCalledWith(connection, 'outreach-followup-batch-1', {
      outreachBatchResults: [
        { id: 't-1', created: true },
        { id: 't-2', created: false, refusal: 'thread-closed' },
      ],
    });
  });

  it('stops between threads when a stop is requested', async () => {
    vi.mocked(listThreadsDueForFollowUp).mockResolvedValue(due as never);
    vi.mocked(createFollowUpForProspect).mockImplementation(async () => {
      ctx.cancellation.request('outreach-followup-batch-1');
      return { configured: true, created: true };
    });

    await expect(
      runOutreachFollowupBatchJob(fakeJob('outreach-followup-batch', { limit: 5 }), ctx),
    ).rejects.toBeInstanceOf(JobCancelledError);
    expect(createFollowUpForProspect).toHaveBeenCalledTimes(1);
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('refuses a job without a positive limit', async () => {
    await expect(
      runOutreachFollowupBatchJob(fakeJob('outreach-followup-batch', { limit: 0 }), ctx),
    ).rejects.toThrow('has no limit');
    expect(listThreadsDueForFollowUp).not.toHaveBeenCalled();
  });
});

describe('runOutreachFullScanJob', () => {
  const auditResult = {
    auditId: 'audit-1',
    manifest: { auditId: 'audit-1' },
    auditDir: '/artifacts/example.fr/run',
  };

  beforeEach(() => {
    vi.mocked(ensureJobRunIdentity).mockResolvedValue({
      startedAt: new Date('2026-09-15T10:00:00.000Z'),
      auditId: 'run-1',
    });
    vi.mocked(runAuditStage).mockResolvedValue(auditResult as never);
  });

  const job = () =>
    fakeJob('outreach-full-scan', { prospectId: 'p-1' }, 'https://example.fr/chambres');

  it('scans under the origin lock, links the prospect and completes', async () => {
    await runOutreachFullScanJob(job(), ctx);

    expect(ctx.originLock.acquire).toHaveBeenCalledWith('https://example.fr');
    expect(runAuditStage).toHaveBeenCalledWith(
      'https://example.fr/chambres',
      expect.objectContaining({ prospectId: 'p-1', scanIntent: 'prospecting-audit' }),
      connection,
    );
    expect(finalizeProspectScan).toHaveBeenCalledWith(connection, {
      prospectId: 'p-1',
      manifest: auditResult.manifest,
    });
    expect(completeJob).toHaveBeenCalledWith(connection, 'outreach-full-scan-1', {
      auditId: 'audit-1',
    });
    expect(deleteCrawlCheckpoint).toHaveBeenCalledWith(auditResult.auditDir);
    expect(release).toHaveBeenCalled();
  });

  it('links the persisted audit to a job stopped during the scan', async () => {
    vi.mocked(runAuditStage).mockImplementation(async () => {
      ctx.cancellation.request('outreach-full-scan-1');
      return auditResult as never;
    });

    await expect(runOutreachFullScanJob(job(), ctx)).rejects.toBeInstanceOf(JobCancelledError);
    expect(updateJobProgress).toHaveBeenCalledWith(connection, 'outreach-full-scan-1', {
      auditId: 'audit-1',
    });
    expect(completeJob).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalled();
  });

  it('releases the origin lock when the scan fails', async () => {
    vi.mocked(runAuditStage).mockRejectedValue(new Error('crawl failed'));
    await expect(runOutreachFullScanJob(job(), ctx)).rejects.toThrow('crawl failed');
    expect(release).toHaveBeenCalled();
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('refuses a job missing its site or prospect', async () => {
    await expect(
      runOutreachFullScanJob(fakeJob('outreach-full-scan', { prospectId: 'p-1' }), ctx),
    ).rejects.toThrow('missing its scope');
    expect(ctx.originLock.acquire).not.toHaveBeenCalled();
  });
});
