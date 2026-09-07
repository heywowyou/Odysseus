import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  completeJob: vi.fn(),
  listContactableCohortMembers: vi.fn(),
  updateJobProgress: vi.fn(),
}));
vi.mock('../../outreach/draft-runtime.js', () => ({ createTouchOneDraft: vi.fn() }));

import { completeJob, listContactableCohortMembers, updateJobProgress } from '@odysseus/store';
import { createTouchOneDraft } from '../../outreach/draft-runtime.js';
import { runOutreachDraftBatchJob } from './run-outreach-draft-batch-job.js';
import { CancellationRegistry, JobCancelledError } from '../cancellation.js';
import type { PipelineContext } from '../job-queue.js';

const fakeConnection = {} as never;

function fakeJob(limit: number, language?: 'fr' | 'en', jobId = 'job-1') {
  return {
    jobId,
    type: 'outreach-draft-batch',
    status: 'running',
    phase: 'queued',
    options: { limit, ...(language === undefined ? {} : { language }) },
    createdAt: new Date(),
    progress: {},
  } as never;
}

let ctx: PipelineContext;
let cancellation: CancellationRegistry;

beforeEach(() => {
  vi.clearAllMocks();
  cancellation = new CancellationRegistry();
  ctx = {
    connection: fakeConnection,
    cancellation,
    originLock: { acquire: vi.fn() } as never,
  };
  vi.mocked(completeJob).mockResolvedValue(undefined);
  vi.mocked(updateJobProgress).mockResolvedValue(undefined);
});

describe('runOutreachDraftBatchJob', () => {
  it('drafts each contactable cohort member and completes with the results', async () => {
    vi.mocked(listContactableCohortMembers).mockResolvedValue([
      { candidateId: 'cand-1', cohortId: 'c1', domain: 'a.example', address: 'a@a.example' },
      { candidateId: 'cand-2', cohortId: 'c1', domain: 'b.example', address: 'b@b.example' },
    ] as never);
    vi.mocked(createTouchOneDraft)
      .mockResolvedValueOnce({ configured: true, created: true, draftId: 'draft-1' } as never)
      .mockResolvedValueOnce({
        configured: true,
        created: false,
        refusal: 'thread-closed',
      } as never);

    const job = fakeJob(5, 'en');
    await runOutreachDraftBatchJob(job, ctx);

    expect(createTouchOneDraft).toHaveBeenNthCalledWith(1, fakeConnection, 'cand-1', {
      language: 'en',
    });
    expect(createTouchOneDraft).toHaveBeenNthCalledWith(2, fakeConnection, 'cand-2', {
      language: 'en',
    });
    expect(completeJob).toHaveBeenCalledWith(fakeConnection, 'job-1', {
      outreachBatchResults: [
        { id: 'cand-1', created: true },
        { id: 'cand-2', created: false, refusal: 'thread-closed' },
      ],
    });
  });

  it('defaults language to fr', async () => {
    vi.mocked(listContactableCohortMembers).mockResolvedValue([
      { candidateId: 'cand-1', cohortId: 'c1', domain: 'a.example', address: 'a@a.example' },
    ] as never);
    vi.mocked(createTouchOneDraft).mockResolvedValue({
      configured: true,
      created: true,
    } as never);

    await runOutreachDraftBatchJob(fakeJob(1), ctx);

    expect(createTouchOneDraft).toHaveBeenCalledWith(fakeConnection, 'cand-1', { language: 'fr' });
  });

  it('throws when the mailbox is not configured, stopping the batch', async () => {
    vi.mocked(listContactableCohortMembers).mockResolvedValue([
      { candidateId: 'cand-1', cohortId: 'c1', domain: 'a.example', address: 'a@a.example' },
    ] as never);
    vi.mocked(createTouchOneDraft).mockResolvedValue({
      configured: false,
      refusal: 'no-mailbox-configured',
    } as never);

    await expect(runOutreachDraftBatchJob(fakeJob(1), ctx)).rejects.toThrow(
      /no mailbox is configured/,
    );
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('throws when the job has no positive limit', async () => {
    await expect(runOutreachDraftBatchJob(fakeJob(0), ctx)).rejects.toThrow(/has no limit/);
    expect(listContactableCohortMembers).not.toHaveBeenCalled();
  });

  it('stops with JobCancelledError when cancellation is requested mid-batch', async () => {
    vi.mocked(listContactableCohortMembers).mockResolvedValue([
      { candidateId: 'cand-1', cohortId: 'c1', domain: 'a.example', address: 'a@a.example' },
      { candidateId: 'cand-2', cohortId: 'c1', domain: 'b.example', address: 'b@b.example' },
    ] as never);
    cancellation.request('job-1');

    await expect(runOutreachDraftBatchJob(fakeJob(2), ctx)).rejects.toThrow(JobCancelledError);
    expect(createTouchOneDraft).not.toHaveBeenCalled();
  });
});
