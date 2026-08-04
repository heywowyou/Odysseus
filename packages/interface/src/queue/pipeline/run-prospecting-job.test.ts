import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../pipeline/audit-stage.js', () => ({ runAuditStage: vi.fn() }));
vi.mock('@odysseus/store', () => ({ completeJob: vi.fn(), updateJobProgress: vi.fn() }));

import { runAuditStage } from '../../pipeline/audit-stage.js';
import { completeJob, updateJobProgress } from '@odysseus/store';
import { runProspectingJob } from './run-prospecting-job.js';
import { PROSPECTING_MAX_DEPTH, PROSPECTING_MAX_PAGES } from '../../config.js';
import type { PipelineContext } from '../job-queue.js';

const fakeConnection = {} as never;

function fakeJob(urls: string[], jobId = 'job-1') {
  return {
    jobId,
    type: 'prospecting',
    status: 'running',
    phase: 'queued',
    urls,
    options: {},
    createdAt: new Date(),
    progress: {},
  } as never;
}

let releaseFns: Array<ReturnType<typeof vi.fn>>;
let ctx: PipelineContext;

beforeEach(() => {
  vi.clearAllMocks();
  releaseFns = [];
  ctx = {
    connection: fakeConnection,
    originLock: {
      acquire: vi.fn().mockImplementation(async () => {
        const release = vi.fn();
        releaseFns.push(release);
        return release;
      }),
    } as never,
  };
  vi.mocked(completeJob).mockResolvedValue(undefined);
  vi.mocked(updateJobProgress).mockResolvedValue(undefined);
});

describe('runProspectingJob', () => {
  it('scans each URL with the hard-capped light config, ignoring any client-supplied cap', async () => {
    vi.mocked(runAuditStage).mockResolvedValue({
      auditId: 'audit-x',
      manifest: {} as never,
      findings: [] as never,
      auditDir: '/dir',
      visitedCount: 1,
      prunedPageDirCount: 0,
    });

    const job = fakeJob(['https://a.example/', 'https://b.example/']);
    await runProspectingJob(job, ctx);

    expect(runAuditStage).toHaveBeenCalledTimes(2);
    expect(runAuditStage).toHaveBeenNthCalledWith(
      1,
      'https://a.example/',
      { maxPages: PROSPECTING_MAX_PAGES, maxDepth: PROSPECTING_MAX_DEPTH },
      fakeConnection,
    );
    expect(runAuditStage).toHaveBeenNthCalledWith(
      2,
      'https://b.example/',
      { maxPages: PROSPECTING_MAX_PAGES, maxDepth: PROSPECTING_MAX_DEPTH },
      fakeConnection,
    );
  });

  it('acquires and releases the origin lock per URL, not for the whole batch', async () => {
    vi.mocked(runAuditStage).mockResolvedValue({
      auditId: 'audit-x',
      manifest: {} as never,
      findings: [] as never,
      auditDir: '/dir',
      visitedCount: 1,
      prunedPageDirCount: 0,
    });

    await runProspectingJob(fakeJob(['https://a.example/', 'https://b.example/']), ctx);

    expect(ctx.originLock.acquire).toHaveBeenCalledTimes(2);
    expect(ctx.originLock.acquire).toHaveBeenNthCalledWith(1, 'https://a.example');
    expect(ctx.originLock.acquire).toHaveBeenNthCalledWith(2, 'https://b.example');
    expect(releaseFns[0]).toHaveBeenCalledTimes(1);
    expect(releaseFns[1]).toHaveBeenCalledTimes(1);
  });

  it('records an error result for a URL that fails, without aborting the rest of the batch', async () => {
    vi.mocked(runAuditStage)
      .mockRejectedValueOnce(new Error('scan failed'))
      .mockResolvedValueOnce({
        auditId: 'audit-b',
        manifest: {} as never,
        findings: [] as never,
        auditDir: '/dir',
        visitedCount: 1,
        prunedPageDirCount: 0,
      });

    await runProspectingJob(fakeJob(['https://a.example/', 'https://b.example/']), ctx);

    expect(completeJob).toHaveBeenCalledWith(fakeConnection, 'job-1', {
      auditIds: ['audit-b'],
      urlResults: [
        { url: 'https://a.example/', status: 'error', error: 'scan failed' },
        { url: 'https://b.example/', status: 'complete', auditId: 'audit-b' },
      ],
    });
  });

  it('records a not-a-valid-URL error without calling runAuditStage for that entry', async () => {
    await runProspectingJob(fakeJob(['not a url', 'https://b.example/']), ctx);

    expect(runAuditStage).toHaveBeenCalledTimes(1);
    expect(runAuditStage).toHaveBeenCalledWith('https://b.example/', expect.anything(), fakeConnection);
  });

  it('throws if the job has no urls', async () => {
    await expect(runProspectingJob(fakeJob([]), ctx)).rejects.toThrow(/no urls/);
  });
});
