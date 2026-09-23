/**
 * A full audit whose server is busy gives its queue slot back while it
 * waits. On 2026-09-24 La Corniche waited for Haaitza (same server) while
 * holding one of the two slots, so three queued audits on other servers could
 * not start for hours.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  backfillQueueOrder: vi.fn().mockResolvedValue(0),
  cancelJob: vi.fn(),
  claimNextQueuedJob: vi.fn(),
  failJob: vi.fn(),
  markJobNeedsInput: vi.fn(),
  reconcileFailedAuditJobs: vi.fn().mockResolvedValue(0),
  resetOrphanedRunningJobs: vi.fn().mockResolvedValue(0),
  settleCancelRequestedJobsOnStartup: vi.fn().mockResolvedValue(0),
  updateJobProgress: vi.fn(),
}));
vi.mock('@odysseus/scanner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@odysseus/scanner')>();
  return {
    OriginLock: actual.OriginLock,
    readOdysseusBuildId: () => 'test-build',
    StaleAcquisitionLeaseError: class extends Error {},
  };
});
vi.mock('@odysseus/report', () => ({ ReportIdentityUnconfirmedError: class extends Error {} }));
vi.mock('../telemetry/job-telemetry.js', () => ({ captureJobTelemetry: vi.fn() }));
vi.mock('../logger.js', () => {
  const log = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), child: () => log };
  return { logger: log };
});

import {
  cancelJob,
  claimNextQueuedJob,
  failJob,
  updateJobProgress,
  type JobDocument,
  type JobType,
} from '@odysseus/store';
import { JobQueue, type PipelineFn } from './job-queue.js';

interface Planned {
  server: string;
  done: Promise<void>;
  finish: () => void;
}

let queue: JobQueue | undefined;
let plans: Map<string, Planned>;
let working: Set<string>;
let started: string[];
let maxWorking: number;

function plan(jobId: string, server: string): void {
  let finish!: () => void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  plans.set(jobId, { server, done, finish });
}

function jobDoc(jobId: string): JobDocument {
  return {
    jobId,
    type: 'full-audit',
    status: 'running',
    phase: 'queued',
    options: {},
    createdAt: new Date(),
    progress: {},
  } as JobDocument;
}

/** Claims the planned jobs in order, one per call, as Mongo would. */
function queueJobs(jobIds: string[]): void {
  const pending = [...jobIds];
  vi.mocked(claimNextQueuedJob).mockImplementation(async () => {
    const next = pending.shift();
    return next === undefined ? null : jobDoc(next);
  });
}

const runner: PipelineFn = async (job, ctx) => {
  const planned = plans.get(job.jobId)!;
  const release = await ctx.acquireServer([`address:${planned.server}`]);
  try {
    working.add(job.jobId);
    started.push(job.jobId);
    maxWorking = Math.max(maxWorking, working.size);
    await planned.done;
  } finally {
    working.delete(job.jobId);
    release();
  }
};

function startQueue(concurrency: number): JobQueue {
  const runners = new Proxy({} as Record<JobType, PipelineFn>, { get: () => runner });
  queue = new JobQueue({
    connection: {} as never,
    concurrency,
    pollIntervalMs: 5,
    serverWaitCancelPollMs: 10,
    runners,
  });
  return queue;
}

function waitingReports(jobId: string): boolean[] {
  return vi
    .mocked(updateJobProgress)
    .mock.calls.filter((call) => call[1] === jobId)
    .map((call) => call[2].progress?.serverWait?.waiting)
    .filter((value): value is boolean => value !== undefined);
}

beforeEach(() => {
  plans = new Map();
  working = new Set();
  started = [];
  maxWorking = 0;
});

afterEach(async () => {
  for (const planned of plans.values()) planned.finish();
  await queue?.stop();
  queue = undefined;
  vi.clearAllMocks();
});

describe('a job waiting for its server holds no queue slot', () => {
  it('lets a job on another server run while one waits, and never exceeds the slots', async () => {
    plan('haaitza', 's1');
    plan('corniche', 's1');
    plan('opera', 's2');
    queueJobs(['haaitza', 'corniche', 'opera']);
    await startQueue(2).start();

    await vi.waitFor(() => expect(started).toEqual(['haaitza', 'opera']));
    expect(waitingReports('corniche')).toEqual([true]);

    plans.get('haaitza')!.finish();
    await vi.waitFor(() => expect(started).toEqual(['haaitza', 'opera', 'corniche']));
    expect(waitingReports('corniche')).toEqual([true, false]);
    expect(maxWorking).toBe(2);
  });

  it('gives a freed slot to the job that waited before claiming new work', async () => {
    plan('haaitza', 's1');
    plan('corniche', 's1');
    plan('opera', 's2');
    plan('alpes', 's3');
    queueJobs(['haaitza', 'corniche', 'opera', 'alpes']);
    await startQueue(2).start();
    await vi.waitFor(() => expect(started).toEqual(['haaitza', 'opera']));

    // Haaitza's slot goes to La Corniche, not to a newly claimed Alpes.
    plans.get('haaitza')!.finish();
    await vi.waitFor(() => expect(started).toEqual(['haaitza', 'opera', 'corniche']));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(started).not.toContain('alpes');

    plans.get('opera')!.finish();
    await vi.waitFor(() => expect(started).toEqual(['haaitza', 'opera', 'corniche', 'alpes']));
    expect(maxWorking).toBe(2);
  });

  it('keeps its slot and reports nothing when its server is free', async () => {
    plan('opera', 's2');
    queueJobs(['opera']);
    await startQueue(1).start();

    await vi.waitFor(() => expect(started).toEqual(['opera']));
    expect(waitingReports('opera')).toEqual([]);
  });

  it('stops a waiting job on request and frees the server for the next one', async () => {
    plan('haaitza', 's1');
    plan('corniche', 's1');
    plan('later', 's1');
    queueJobs(['haaitza', 'corniche', 'later']);
    await startQueue(2).start();
    await vi.waitFor(() => expect(waitingReports('corniche')).toEqual([true]));

    queue!.requestCancel('corniche');
    await vi.waitFor(() =>
      expect(cancelJob).toHaveBeenCalledWith(expect.anything(), 'corniche', expect.any(String)),
    );
    expect(failJob).not.toHaveBeenCalled();

    plans.get('haaitza')!.finish();
    await vi.waitFor(() => expect(started).toEqual(['haaitza', 'later']));
    expect(started).not.toContain('corniche');
  });

  it('does not lose a slot when a job fails after waiting', async () => {
    plan('haaitza', 's1');
    plan('corniche', 's1');
    plan('opera', 's2');
    plan('alpes', 's3');
    plan('pointfrance', 's4');
    queueJobs(['haaitza', 'corniche', 'opera', 'alpes', 'pointfrance']);
    await startQueue(2).start();
    await vi.waitFor(() => expect(started).toEqual(['haaitza', 'opera']));

    // Every job ends; the slot count must come back to two working scans.
    plans.get('haaitza')!.finish();
    plans.get('opera')!.finish();
    await vi.waitFor(() => expect(started).toHaveLength(4));
    for (const id of ['corniche', 'alpes']) plans.get(id)!.finish();
    await vi.waitFor(() => expect(started).toHaveLength(5));
    expect(maxWorking).toBe(2);
  });
});

describe('the claim loop reserves its slot before asking Mongo', () => {
  /** A claim is a Mongo round trip. A job that takes a free slot during it
   *  used to be counted on top of the claimed job: three scans on two slots. */
  it('does not overfill the slots when a waiting job resumes during a claim', async () => {
    const releasedEarly = new Map<string, () => void>();
    const earlyRunner: PipelineFn = async (job, ctx) => {
      const planned = plans.get(job.jobId)!;
      const release = await ctx.acquireServer([`address:${planned.server}`]);
      releasedEarly.set(job.jobId, release);
      working.add(job.jobId);
      started.push(job.jobId);
      maxWorking = Math.max(maxWorking, working.size);
      try {
        await planned.done;
      } finally {
        working.delete(job.jobId);
        release();
      }
    };
    plan('haaitza', 's1');
    plan('corniche', 's1');
    plan('opera', 's2');
    const pending = ['haaitza', 'corniche', 'opera'];
    let slowClaim = false;
    vi.mocked(claimNextQueuedJob).mockImplementation(async () => {
      const next = pending.shift();
      if (next === 'opera') {
        slowClaim = true;
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      return next === undefined ? null : jobDoc(next);
    });
    const runners = new Proxy({} as Record<JobType, PipelineFn>, { get: () => earlyRunner });
    queue = new JobQueue({
      connection: {} as never,
      concurrency: 2,
      pollIntervalMs: 5,
      serverWaitCancelPollMs: 10,
      runners,
    });
    await queue.start();
    await vi.waitFor(() => expect(waitingReports('corniche')).toEqual([true]));
    await vi.waitFor(() => expect(slowClaim).toBe(true));

    // Haaitza frees the server but keeps working while Opéra is being claimed.
    releasedEarly.get('haaitza')!();
    await vi.waitFor(() => expect(started).toContain('opera'), { timeout: 2_000 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(maxWorking).toBe(2);
    expect(started).not.toContain('corniche');

    plans.get('haaitza')!.finish();
    await vi.waitFor(() => expect(started).toContain('corniche'));
    expect(maxWorking).toBe(2);
  });
});

describe('the slot and server rules hold under load', () => {
  /** Deterministic pseudo-random sequence, so a failure replays exactly. */
  function sequence(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    };
  }

  it.each([1, 2, 3, 4, 5])(
    'never overfills the slots, never shares a server, and finishes every job (seed %i)',
    async (seed) => {
      const random = sequence(seed);
      const ids = Array.from({ length: 16 }, (_, index) => `job-${index}`);
      const serverOf = new Map(ids.map((id) => [id, `s${Math.floor(random() * 3)}`]));
      const holdMs = new Map(ids.map((id) => [id, 1 + Math.floor(random() * 15)]));
      const stopped = new Set(ids.filter(() => random() < 0.2));
      const busyServers = new Map<string, string>();
      const ended = new Set<string>();
      let sharedServer = false;

      const loadRunner: PipelineFn = async (job, ctx) => {
        const server = serverOf.get(job.jobId)!;
        if (stopped.has(job.jobId)) setTimeout(() => queue!.requestCancel(job.jobId), 2);
        try {
          const release = await ctx.acquireServer([`address:${server}`]);
          try {
            if (busyServers.has(server)) sharedServer = true;
            busyServers.set(server, job.jobId);
            working.add(job.jobId);
            maxWorking = Math.max(maxWorking, working.size);
            await new Promise((resolve) => setTimeout(resolve, holdMs.get(job.jobId)));
          } finally {
            working.delete(job.jobId);
            busyServers.delete(server);
            release();
          }
        } finally {
          ended.add(job.jobId);
        }
      };

      queueJobs(ids);
      const runners = new Proxy({} as Record<JobType, PipelineFn>, { get: () => loadRunner });
      queue = new JobQueue({
        connection: {} as never,
        concurrency: 2,
        pollIntervalMs: 2,
        serverWaitCancelPollMs: 3,
        runners,
      });
      await queue.start();

      await vi.waitFor(() => expect(ended.size).toBe(ids.length), { timeout: 5_000 });
      expect(sharedServer).toBe(false);
      expect(
        vi
          .mocked(updateJobProgress)
          .mock.calls.some((call) => call[2].progress?.serverWait?.waiting === true),
      ).toBe(true);
      expect(maxWorking).toBeLessThanOrEqual(2);
      expect(maxWorking).toBe(2);
      // Nothing is left holding a slot: a fresh job still starts at once.
      plan('after', 's9');
      queueJobs(['after']);
      queue.notify();
      const probe: PipelineFn = async (job, ctx) => {
        const release = await ctx.acquireServer(['address:s9']);
        started.push(job.jobId);
        release();
      };
      Object.defineProperty(queue, 'runners', {
        value: new Proxy({} as Record<JobType, PipelineFn>, { get: () => probe }),
      });
      await vi.waitFor(() => expect(started).toContain('after'));
    },
  );
});
