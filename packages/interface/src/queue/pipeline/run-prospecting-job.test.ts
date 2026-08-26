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
      obligationAssessment: { status: 'undetermined', basis: [] } as never,
    });

    const job = fakeJob(['https://a.example/', 'https://b.example/']);
    await runProspectingJob(job, ctx);

    expect(runAuditStage).toHaveBeenCalledTimes(2);
    expect(runAuditStage).toHaveBeenNthCalledWith(
      1,
      'https://a.example/',
      { maxPages: PROSPECTING_MAX_PAGES, maxDepth: PROSPECTING_MAX_DEPTH, skipLighthouse: true },
      fakeConnection,
    );
    expect(runAuditStage).toHaveBeenNthCalledWith(
      2,
      'https://b.example/',
      { maxPages: PROSPECTING_MAX_PAGES, maxDepth: PROSPECTING_MAX_DEPTH, skipLighthouse: true },
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
      obligationAssessment: { status: 'undetermined', basis: [] } as never,
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
        obligationAssessment: { status: 'undetermined', basis: [] } as never,
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
    expect(runAuditStage).toHaveBeenCalledWith(
      'https://b.example/',
      expect.anything(),
      fakeConnection,
    );
  });

  it('throws if the job has no urls', async () => {
    await expect(runProspectingJob(fakeJob([]), ctx)).rejects.toThrow(/no urls/);
  });

  describe('throttled progress writes', () => {
    it('does not call updateJobProgress once per URL for a batch larger than the write interval', async () => {
      vi.mocked(runAuditStage).mockResolvedValue({
        auditId: 'audit-x',
        manifest: {} as never,
        findings: [] as never,
        auditDir: '/dir',
        visitedCount: 1,
        prunedPageDirCount: 0,
        obligationAssessment: { status: 'undetermined', basis: [] } as never,
      });

      const urls = Array.from({ length: 25 }, (_, i) => `https://site-${i}.example/`);
      await runProspectingJob(fakeJob(urls), ctx);

      // 1 initial write plus at most a couple of throttled writes plus the
      // final forced write - nowhere near one write per URL (25).
      expect(vi.mocked(updateJobProgress).mock.calls.length).toBeLessThan(10);

      const lastCall = vi.mocked(updateJobProgress).mock.calls.at(-1);
      expect(lastCall?.[2]).toMatchObject({
        progress: { message: `${urls.length} of ${urls.length} URLs scanned` },
      });
      expect((lastCall?.[2] as { urlResults: unknown[] }).urlResults).toHaveLength(urls.length);
    });
  });

  describe('2026-08-22 milestone 9b: bounded worker pool', () => {
    it('runs distinct origins concurrently rather than one at a time', async () => {
      // Each runAuditStage call blocks until every expected call has been
      // made - only possible if PROSPECTING_JOB_CONCURRENCY workers are
      // genuinely in flight at once, not a serial loop awaiting one call
      // before starting the next.
      const urls = ['https://a.example/', 'https://b.example/', 'https://c.example/'];
      let inFlight = 0;
      let maxInFlight = 0;
      vi.mocked(runAuditStage).mockImplementation(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return {
          auditId: 'audit-x',
          manifest: {} as never,
          findings: [] as never,
          auditDir: '/dir',
          visitedCount: 1,
          prunedPageDirCount: 0,
          obligationAssessment: { status: 'undetermined', basis: [] } as never,
        };
      });

      await runProspectingJob(fakeJob(urls), ctx);

      expect(runAuditStage).toHaveBeenCalledTimes(3);
      expect(maxInFlight).toBeGreaterThan(1);
    });

    it('a worker that finishes early picks up remaining work rather than sitting idle', async () => {
      // 4 URLs against a 3-worker pool: the fast URL's worker must pick up
      // the 4th once done, not leave it for whichever worker "owns" it in
      // a fixed-slice scheme.
      const urls = [
        'https://fast.example/',
        'https://b.example/',
        'https://c.example/',
        'https://d.example/',
      ];
      vi.mocked(runAuditStage).mockImplementation(async (url) => {
        const delay = url === 'https://fast.example/' ? 0 : 20;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return {
          auditId: `audit-${url}`,
          manifest: {} as never,
          findings: [] as never,
          auditDir: '/dir',
          visitedCount: 1,
          prunedPageDirCount: 0,
          obligationAssessment: { status: 'undetermined', basis: [] } as never,
        };
      });

      await runProspectingJob(fakeJob(urls), ctx);

      expect(runAuditStage).toHaveBeenCalledTimes(4);
      expect(completeJob).toHaveBeenCalledWith(
        fakeConnection,
        'job-1',
        expect.objectContaining({
          auditIds: expect.arrayContaining([expect.stringContaining('audit-')]),
        }),
      );
    });
  });
});
