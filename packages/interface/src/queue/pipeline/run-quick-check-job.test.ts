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
import { runQuickCheckJob } from './run-quick-check-job.js';
import { CancellationRegistry } from '../cancellation.js';
import type { PipelineContext } from '../job-queue.js';

const fakeConnection = {} as never;

function fakeJob(options: Record<string, unknown> = {}) {
  return {
    jobId: 'quick-job-1',
    type: 'quick-check',
    status: 'running',
    phase: 'queued',
    siteUrl: 'https://example.fr/',
    options,
    createdAt: new Date(),
    progress: {},
  } as never;
}

const auditResult = {
  auditId: 'audit-quick-1',
  manifest: { auditId: 'audit-quick-1', scanIntent: 'quick-check' },
  auditDir: '/artifacts/example.fr/quick',
};

let ctx: PipelineContext;

beforeEach(() => {
  vi.clearAllMocks();
  ctx = {
    connection: fakeConnection,
    originLock: { acquire: vi.fn().mockResolvedValue(vi.fn()) } as never,
    cancellation: new CancellationRegistry(),
    acquireServer: vi.fn(),
  };
  vi.mocked(ensureJobRunIdentity).mockResolvedValue({
    startedAt: new Date('2026-09-15T10:00:00.000Z'),
    auditId: 'run-quick-1',
  });
  vi.mocked(runAuditStage).mockResolvedValue(auditResult as never);
  vi.mocked(finalizeProspectScan).mockResolvedValue(undefined);
  vi.mocked(completeJob).mockResolvedValue(undefined);
});

describe('runQuickCheckJob', () => {
  it('forwards the operator pacing options and keeps the one-page cap', async () => {
    await runQuickCheckJob(fakeJob({ delayMs: 60_000, scanConcurrency: 1, maxPages: 40 }), ctx);

    expect(runAuditStage).toHaveBeenCalledWith(
      'https://example.fr/',
      expect.objectContaining({ delayMs: 60_000, scanConcurrency: 1, maxPages: 1 }),
      fakeConnection,
    );
  });

  it('runs one bounded audit and no analysis or report stage', async () => {
    await runQuickCheckJob(fakeJob(), ctx);

    expect(runAuditStage).toHaveBeenCalledWith(
      'https://example.fr/',
      expect.objectContaining({
        maxPages: 1,
        skipLighthouse: true,
        sitemapMode: 'inspect',
        scanIntent: 'quick-check',
      }),
      fakeConnection,
    );
    expect(completeJob).toHaveBeenCalledWith(fakeConnection, 'quick-job-1', {
      auditId: 'audit-quick-1',
    });
  });

  it('finalizes an attached check without changing its informational intent', async () => {
    await runQuickCheckJob(fakeJob({ prospectId: 'prospect-1' }), ctx);

    expect(finalizeProspectScan).toHaveBeenCalledWith(fakeConnection, {
      prospectId: 'prospect-1',
      manifest: auditResult.manifest,
    });
  });
});
