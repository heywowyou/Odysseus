import { logger } from '../../logger.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Issue #201: a domain-scoped hotel-prescan job (the dashboard's per-hotel
// quick check, or the CLI's own `--domain`) must run the same on-demand
// scoring pass the wave-add action uses (issue #199), so a hand-added
// hotel's score surfaces without a second, manually-remembered command. A
// population-wide batch (no domain) must not trigger this per-hotel pass.
//
// Every heavy dependency is mocked: this test is about the one wiring
// decision (call scoreHotelOnDemandForConnection when, and only when, the
// job is domain-scoped), not about the browser/store plumbing the other
// tests in run-hotel-prescan-job.test.ts already cover.

vi.mock('@odysseus/scanner', () => ({
  buildPrescanDir: vi.fn(() => 'artifacts-dir'),
  getPrescansRoot: vi.fn(() => '/tmp/prescans'),
  launchBrowser: vi.fn(async () => ({ browser: { close: vi.fn(async () => {}) } })),
  removePrescanArtifacts: vi.fn(async () => {}),
  prescanSite: vi.fn(),
  sweepExpiredPrescanArtifacts: vi.fn(async () => ({})),
}));

vi.mock('@odysseus/store', () => ({
  completeJob: vi.fn(async () => {}),
  listCandidatesToPrescan: vi.fn(async () => []),
  recordPrescan: vi.fn(),
  updateJobProgress: vi.fn(async () => {}),
}));

const emptyReport = {
  resolutionVersion: 'rv1',
  qualificationVersion: 'qv1',
  prescanVersion: 'pv1',
  scanJobId: 'job-1',
  dryRun: false,
  candidatesPrescanned: 0,
  byStatus: {},
  byEvidenceStatus: { complete: 0, incomplete: 0, missing: 0 },
  pagesLoaded: 0,
  failures: 0,
  pointersMissed: 0,
  reconciles: true,
};

vi.mock('../../prospecting/hotel-prescan/prescan-hotels.js', () => ({
  CURRENT_PRESCAN_VERSION: 'pv1',
  prescanHotels: vi.fn(async () => emptyReport),
}));

vi.mock('../../prospecting/hotel-scoring/score-on-demand.js', () => ({
  scoreHotelOnDemandForConnection: vi.fn(async () => ({ outcome: 'scored' })),
}));

const { completeJob } = await import('@odysseus/store');
const { scoreHotelOnDemandForConnection } =
  await import('../../prospecting/hotel-scoring/score-on-demand.js');
const { CancellationRegistry } = await import('../cancellation.js');
const { runHotelPrescanJob } = await import('./run-hotel-prescan-job.js');
type PipelineContext = import('../job-queue.js').PipelineContext;

function ctx(): PipelineContext {
  return {
    connection: { id: 'fake-connection' } as never,
    originLock: { acquire: vi.fn(async () => vi.fn()) } as never,
    cancellation: new CancellationRegistry(),
    log: logger,
  };
}

describe('runHotelPrescanJob on-demand scoring (issue #201)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scores the domain on demand after a domain-scoped run completes', async () => {
    await runHotelPrescanJob(
      {
        jobId: 'job-1',
        type: 'hotel-prescan',
        status: 'running',
        phase: 'prescanning',
        options: {
          resolutionVersion: 'rv1',
          qualificationVersion: 'qv1',
          domain: 'hotel-exemple.fr',
          maxPages: 1,
        },
        createdAt: new Date(),
        progress: {},
      } as never,
      ctx(),
    );

    expect(scoreHotelOnDemandForConnection).toHaveBeenCalledWith(
      expect.anything(),
      'hotel-exemple.fr',
    );
    expect(completeJob).toHaveBeenCalledWith(expect.anything(), 'job-1');
  });

  it('leaves a population-wide batch to the operator’s own score run', async () => {
    await runHotelPrescanJob(
      {
        jobId: 'job-2',
        type: 'hotel-prescan',
        status: 'running',
        phase: 'prescanning',
        options: {
          resolutionVersion: 'rv1',
          qualificationVersion: 'qv1',
          prescanCandidateIds: ['cand-1'],
        },
        createdAt: new Date(),
        progress: {},
      } as never,
      ctx(),
    );

    expect(scoreHotelOnDemandForConnection).not.toHaveBeenCalled();
    expect(completeJob).toHaveBeenCalledWith(expect.anything(), 'job-2');
  });
});
