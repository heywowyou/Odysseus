import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../pipeline/audit-stage.js', () => ({ runAuditStage: vi.fn() }));
vi.mock('../../pipeline/finalize-prospect-scan.js', () => ({ finalizeProspectScan: vi.fn() }));
vi.mock('../report-progress.js', () => ({ createScanProgressReporter: vi.fn(() => vi.fn()) }));
vi.mock('@odysseus/store', () => ({
  completeJob: vi.fn(),
  ensureJobRunIdentity: vi.fn(),
}));
vi.mock('@odysseus/scanner', () => ({
  deleteCrawlCheckpoint: vi.fn(),
  deleteCrawlStateFile: vi.fn(),
}));

import { runAuditStage } from '../../pipeline/audit-stage.js';
import { finalizeProspectScan } from '../../pipeline/finalize-prospect-scan.js';
import { completeJob, ensureJobRunIdentity } from '@odysseus/store';
import { runProspectingAuditJob } from './run-prospecting-audit-job.js';
import { CancellationRegistry } from '../cancellation.js';
import type { PipelineContext } from '../job-queue.js';

const fakeConnection = {} as never;

function fakeJob(options: Record<string, unknown> = {}) {
  return {
    jobId: 'outreach-job-1',
    type: 'prospecting-audit',
    status: 'running',
    phase: 'queued',
    siteUrl: 'https://example.fr/',
    options,
    createdAt: new Date(),
    progress: {},
  } as never;
}

const auditResult = {
  auditId: 'audit-outreach-1',
  manifest: { auditId: 'audit-outreach-1', scanIntent: 'prospecting-audit' },
  auditDir: '/artifacts/example.fr/outreach',
};

let ctx: PipelineContext;

beforeEach(() => {
  vi.clearAllMocks();
  ctx = {
    connection: fakeConnection,
    originLock: { acquire: vi.fn().mockResolvedValue(vi.fn()) } as never,
    cancellation: new CancellationRegistry(),
  };
  vi.mocked(ensureJobRunIdentity).mockResolvedValue({
    startedAt: new Date('2026-09-15T10:00:00.000Z'),
    auditId: 'run-outreach-1',
  });
  vi.mocked(runAuditStage).mockResolvedValue(auditResult as never);
  vi.mocked(finalizeProspectScan).mockResolvedValue(undefined);
  vi.mocked(completeJob).mockResolvedValue(undefined);
});

describe('runProspectingAuditJob', () => {
  it('runs the normal audit stage and stops before analysis/report generation', async () => {
    await runProspectingAuditJob(fakeJob(), ctx);

    const options = vi.mocked(runAuditStage).mock.calls[0]?.[1];
    expect(options).toEqual(
      expect.objectContaining({
        scanIntent: 'prospecting-audit',
        runIdentity: expect.objectContaining({ auditId: 'run-outreach-1' }),
      }),
    );
    expect(options).not.toEqual(
      expect.objectContaining({
        maxPages: expect.anything(),
        maxDepth: expect.anything(),
        skipLighthouse: true,
        sitemapMode: 'inspect',
      }),
    );
    expect(completeJob).toHaveBeenCalledWith(fakeConnection, 'outreach-job-1', {
      auditId: 'audit-outreach-1',
    });
  });

  it('passes the prospect through the audit and post-scan finalizer', async () => {
    await runProspectingAuditJob(fakeJob({ prospectId: 'prospect-1' }), ctx);

    expect(runAuditStage).toHaveBeenCalledWith(
      'https://example.fr/',
      expect.objectContaining({ prospectId: 'prospect-1', scanIntent: 'prospecting-audit' }),
      fakeConnection,
    );
    expect(finalizeProspectScan).toHaveBeenCalledWith(fakeConnection, {
      prospectId: 'prospect-1',
      manifest: auditResult.manifest,
    });
  });
});
