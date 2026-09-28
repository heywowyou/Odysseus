import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RetentionRunOptions } from './apply-retention.js';
import {
  isRetentionSweepEnabled,
  RETENTION_SWEEP_FIRST_DELAY_MS,
  RETENTION_SWEEP_INTERVAL_MS,
  startRetentionSweeper,
} from './retention-sweeper.js';

vi.mock('../logger.js', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('../artifacts/configured-artifact-store.js', () => ({
  createConfiguredArtifactStore: () => undefined,
}));

describe('isRetentionSweepEnabled', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['off', false],
    ['true', false],
    ['ON', false],
    ['on', true],
  ])('%s -> %s', (value, expected) => {
    const env = value === undefined ? {} : { ODYSSEUS_RETENTION_SWEEP: value };
    expect(isRetentionSweepEnabled(env)).toBe(expected);
  });
});

describe('startRetentionSweeper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits 15 minutes, then runs once a day, applying with the cap in force', async () => {
    const run = vi.fn(async (_options: RetentionRunOptions) => ({
      counts: {},
      bytesReclaimed: { local: 0, remote: 0 },
      failures: [],
    }));
    const snapshotFunnel = vi.fn(async () => 1);
    const stop = startRetentionSweeper({} as never, {
      inFlightJobIds: () => ['job-1'],
      run: run as never,
      snapshotFunnel,
    });

    await vi.advanceTimersByTimeAsync(RETENTION_SWEEP_FIRST_DELAY_MS - 1);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledOnce();
    const options = run.mock.calls[0]![0];
    expect(options).toMatchObject({ apply: true, allowLarge: false, trigger: 'sweeper' });
    expect(options.inProcess?.inFlightJobIds()).toEqual(['job-1']);

    await vi.advanceTimersByTimeAsync(RETENTION_SWEEP_INTERVAL_MS);
    expect(run).toHaveBeenCalledTimes(2);
    // Issue #561: every sweep stores the day's funnel counts.
    expect(snapshotFunnel).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(RETENTION_SWEEP_INTERVAL_MS);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('keeps running after a failed sweep', async () => {
    const run = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    const snapshotFunnel = vi.fn(async () => 0);
    const stop = startRetentionSweeper({} as never, {
      inFlightJobIds: () => [],
      run: run as never,
      snapshotFunnel,
    });

    await vi.advanceTimersByTimeAsync(RETENTION_SWEEP_FIRST_DELAY_MS + RETENTION_SWEEP_INTERVAL_MS);

    expect(run).toHaveBeenCalledTimes(2);
    // A failed retention run still stores the funnel snapshot.
    expect(snapshotFunnel).toHaveBeenCalledTimes(2);
    stop();
  });
});
