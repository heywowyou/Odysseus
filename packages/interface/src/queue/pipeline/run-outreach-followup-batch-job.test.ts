import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  completeJob: vi.fn(),
  listThreadsDueForFollowUp: vi.fn(),
  updateJobProgress: vi.fn(),
}));
vi.mock('../../outreach/draft-runtime.js', () => ({ createFollowUpForCandidate: vi.fn() }));

import { completeJob, listThreadsDueForFollowUp, updateJobProgress } from '@odysseus/store';
import { createFollowUpForCandidate } from '../../outreach/draft-runtime.js';
import { runOutreachFollowupBatchJob } from './run-outreach-followup-batch-job.js';
import { CancellationRegistry, JobCancelledError } from '../cancellation.js';
import type { PipelineContext } from '../job-queue.js';

const fakeConnection = {} as never;

function fakeJob(limit: number, jobId = 'job-1') {
  return {
    jobId,
    type: 'outreach-followup-batch',
    status: 'running',
    phase: 'queued',
    options: { limit },
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

describe('runOutreachFollowupBatchJob', () => {
  it('drafts a follow-up for each due thread and completes with the results', async () => {
    vi.mocked(listThreadsDueForFollowUp).mockResolvedValue([
      { threadId: 'thread-1' },
      { threadId: 'thread-2' },
    ] as never);
    vi.mocked(createFollowUpForCandidate)
      .mockResolvedValueOnce({ configured: true, created: true, draftId: 'draft-1' } as never)
      .mockResolvedValueOnce({
        configured: true,
        created: false,
        refusal: 'suppressed-before-generation',
      } as never);

    const job = fakeJob(5);
    await runOutreachFollowupBatchJob(job, ctx);

    expect(createFollowUpForCandidate).toHaveBeenNthCalledWith(1, fakeConnection, 'thread-1');
    expect(createFollowUpForCandidate).toHaveBeenNthCalledWith(2, fakeConnection, 'thread-2');
    expect(completeJob).toHaveBeenCalledWith(fakeConnection, 'job-1', {
      outreachBatchResults: [
        { id: 'thread-1', created: true },
        { id: 'thread-2', created: false, refusal: 'suppressed-before-generation' },
      ],
    });
  });

  it('throws when the mailbox is not configured, stopping the batch', async () => {
    vi.mocked(listThreadsDueForFollowUp).mockResolvedValue([{ threadId: 'thread-1' }] as never);
    vi.mocked(createFollowUpForCandidate).mockResolvedValue({
      configured: false,
      refusal: 'no-mailbox-configured',
    } as never);

    await expect(runOutreachFollowupBatchJob(fakeJob(1), ctx)).rejects.toThrow(
      /no mailbox is configured/,
    );
    expect(completeJob).not.toHaveBeenCalled();
  });

  it('throws when the job has no positive limit', async () => {
    await expect(runOutreachFollowupBatchJob(fakeJob(0), ctx)).rejects.toThrow(/has no limit/);
    expect(listThreadsDueForFollowUp).not.toHaveBeenCalled();
  });

  it('stops with JobCancelledError when cancellation is requested mid-batch', async () => {
    vi.mocked(listThreadsDueForFollowUp).mockResolvedValue([
      { threadId: 'thread-1' },
      { threadId: 'thread-2' },
    ] as never);
    cancellation.request('job-1');

    await expect(runOutreachFollowupBatchJob(fakeJob(2), ctx)).rejects.toThrow(JobCancelledError);
    expect(createFollowUpForCandidate).not.toHaveBeenCalled();
  });
});
