import { describe, expect, it } from 'vitest';
import { HostRequestScheduler } from './host-request-scheduler.js';

/** A clock whose `sleep` advances it, so pacing is asserted on values rather
 *  than on how long the test actually took. */
function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    sleep: async (ms: number) => {
      time += ms;
    },
  };
}

describe('request spacing', () => {
  it('separates consecutive request starts by the effective delay', async () => {
    const clock = fakeClock();
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 1000,
      maxConcurrency: 3,
      ...clock,
    });

    const startedAt: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      await scheduler.schedule(async () => {
        startedAt.push(clock.now());
      });
    }

    expect(startedAt).toEqual([0, 1000, 2000]);
  });

  it('spaces starts globally rather than per lane, so extra lanes add no pressure', async () => {
    const clock = fakeClock();
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 500,
      maxConcurrency: 4,
      ...clock,
    });

    const startedAt: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      await scheduler.schedule(async () => {
        startedAt.push(clock.now());
      });
    }

    const gaps = startedAt.slice(1).map((value, index) => value - startedAt[index]!);
    expect(gaps.every((gap) => gap >= 500)).toBe(true);
  });
});

describe('concurrency', () => {
  it('never runs more operations at once than its current limit', async () => {
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 0,
      maxConcurrency: 2,
      now: () => 0,
      sleep: async () => {},
    });

    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        scheduler.schedule(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await Promise.resolve();
          active -= 1;
        }),
      ),
    );

    expect(peak).toBe(2);
  });
});

describe('pressure only ever increases', () => {
  it('raises the delay when asked and ignores a request to lower it', () => {
    const scheduler = new HostRequestScheduler({ floorDelayMs: 1000, maxConcurrency: 3 });

    scheduler.raiseDelayTo(4000);
    expect(scheduler.effectiveDelayMs).toBe(4000);

    scheduler.raiseDelayTo(1000);
    expect(scheduler.effectiveDelayMs).toBe(4000);
  });

  it('never drops below the configured floor', () => {
    const scheduler = new HostRequestScheduler({ floorDelayMs: 1000, maxConcurrency: 3 });
    scheduler.raiseDelayTo(0);
    expect(scheduler.effectiveDelayMs).toBe(1000);
  });

  it('backs off and sheds a lane on a rate-limit signal', () => {
    const scheduler = new HostRequestScheduler({ floorDelayMs: 1000, maxConcurrency: 4 });

    scheduler.noteRateLimited();
    expect(scheduler.effectiveDelayMs).toBe(2000);
    expect(scheduler.concurrency).toBe(2);

    scheduler.noteRateLimited();
    expect(scheduler.effectiveDelayMs).toBe(4000);
    expect(scheduler.concurrency).toBe(1);
  });

  it('keeps at least one lane, so backing off never deadlocks the run', () => {
    const scheduler = new HostRequestScheduler({ floorDelayMs: 100, maxConcurrency: 2 });
    for (let index = 0; index < 8; index += 1) scheduler.noteRateLimited();
    expect(scheduler.concurrency).toBe(1);
  });

  it('bounds backoff so a hostile host cannot stall the run indefinitely', () => {
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 1000,
      maxConcurrency: 2,
      maxDelayMs: 10_000,
    });

    for (let index = 0; index < 20; index += 1) scheduler.noteRateLimited();
    expect(scheduler.effectiveDelayMs).toBe(10_000);
  });

  it('honours the reduced concurrency for work queued after the signal', async () => {
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 0,
      maxConcurrency: 4,
      now: () => 0,
      sleep: async () => {},
    });

    scheduler.noteRateLimited();

    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        scheduler.schedule(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await Promise.resolve();
          active -= 1;
        }),
      ),
    );

    expect(peak).toBe(2);
  });
});
