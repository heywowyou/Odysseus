import { describe, expect, it } from 'vitest';
import { HostRequestScheduler, type HostPushbackEvent } from './host-request-scheduler.js';

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

  it('paces inner requests without acquiring a second lane', async () => {
    const clock = fakeClock();
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 333,
      maxConcurrency: 1,
      ...clock,
    });

    const startedAt: number[] = [];
    await scheduler.schedule(async () => {
      startedAt.push(clock.now());
      await scheduler.pace();
      startedAt.push(clock.now());
      await scheduler.pace();
      startedAt.push(clock.now());
    });

    expect(startedAt).toEqual([0, 333, 666]);
  });

  it('charges a lane-held pass one slot for its one paced request', async () => {
    const clock = fakeClock();
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 40_000,
      maxConcurrency: 1,
      ...clock,
    });

    const startedAt: number[] = [];
    await scheduler.schedule(async () => {
      startedAt.push(clock.now());
    });
    await scheduler.holdLane(async () => {
      await scheduler.pace();
      startedAt.push(clock.now());
    });
    await scheduler.schedule(async () => {
      startedAt.push(clock.now());
    });

    expect(startedAt).toEqual([0, 40_000, 80_000]);
  });

  it('keeps a lane-held pass inside the concurrency limit', async () => {
    const scheduler = new HostRequestScheduler({ floorDelayMs: 0, maxConcurrency: 1 });
    let active = 0;
    let peak = 0;
    const pass = () =>
      scheduler.holdLane(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
      });

    await Promise.all([pass(), pass(), pass()]);

    expect(peak).toBe(1);
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

  it('reports each pushback with its source and timestamp', () => {
    const events: unknown[] = [];
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 1000,
      maxConcurrency: 4,
      now: () => 1_700_000_000_000,
      onPushback: (event) => events.push(event),
    });

    scheduler.noteRateLimited({
      pageUrl: 'https://example.com/products',
      kind: 'rate-limit',
      fetcher: 'crawl',
      status: 429,
      retryAfterMs: 5000,
    });
    scheduler.noteRateLimited({
      pageUrl: 'https://example.com/products',
      kind: 'bot-challenge',
      fetcher: 'render',
      status: 200,
    });

    expect(events).toEqual([
      {
        pageUrl: 'https://example.com/products',
        kind: 'rate-limit',
        fetcher: 'crawl',
        status: 429,
        retryAfterMs: 5000,
        occurredAt: '2023-11-14T22:13:20.000Z',
        delayMs: 10_000,
        atMaxDelay: false,
      },
      {
        pageUrl: 'https://example.com/products',
        kind: 'bot-challenge',
        fetcher: 'render',
        status: 200,
        occurredAt: '2023-11-14T22:13:20.000Z',
        delayMs: 20_000,
        atMaxDelay: false,
      },
    ]);
  });

  it('says when a pushback arrives with the delay already at its cap', () => {
    const events: HostPushbackEvent[] = [];
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 30_000,
      maxConcurrency: 1,
      onPushback: (event) => events.push(event),
    });
    const signal = {
      pageUrl: 'https://example.com/',
      kind: 'bot-challenge',
      fetcher: 'crawl',
    } as const;

    scheduler.noteRateLimited(signal);
    scheduler.noteRateLimited(signal);

    expect(events.map(({ delayMs, atMaxDelay }) => ({ delayMs, atMaxDelay }))).toEqual([
      { delayMs: 60_000, atMaxDelay: false },
      { delayMs: 60_000, atMaxDelay: true },
    ]);
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

describe('pressure recovers after clean request starts', () => {
  it('halves a capped delay to the floor after each twenty clean starts', async () => {
    const clock = fakeClock();
    const recovered: number[] = [];
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 10_000,
      maxDelayMs: 60_000,
      maxConcurrency: 8,
      ...clock,
      onPacingRecovered: (event) => recovered.push(event.delayMs),
    });
    scheduler.noteRateLimited();
    scheduler.noteRateLimited();
    scheduler.noteRateLimited();
    expect(scheduler.effectiveDelayMs).toBe(60_000);

    for (let index = 0; index < 60; index += 1) await scheduler.pace();

    expect(recovered).toEqual([30_000, 15_000, 10_000]);
    expect(scheduler.effectiveDelayMs).toBe(10_000);
    expect(scheduler.requestStartCount).toBe(60);
    expect(scheduler.concurrency).toBe(1);
  });

  it('honours Retry-After before counting clean starts toward recovery', async () => {
    const clock = fakeClock();
    const recovered: number[] = [];
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 100,
      maxDelayMs: 800,
      maxConcurrency: 4,
      ...clock,
      onPacingRecovered: (event) => recovered.push(event.delayMs),
    });
    scheduler.noteRateLimited({
      pageUrl: 'https://example.com/',
      kind: 'rate-limit',
      fetcher: 'crawl',
      retryAfterMs: 1000,
    });

    for (let index = 0; index < 19; index += 1) await scheduler.pace();
    expect(clock.now()).toBeGreaterThanOrEqual(1000);
    expect(recovered).toEqual([]);

    await scheduler.pace();
    expect(recovered).toEqual([400]);
  });

  it('resets the clean-start counter on a new pushback', async () => {
    const clock = fakeClock();
    const recovered: number[] = [];
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 10,
      maxDelayMs: 60,
      maxConcurrency: 4,
      ...clock,
      onPacingRecovered: (event) => recovered.push(event.delayMs),
    });
    scheduler.noteRateLimited();
    scheduler.noteRateLimited();
    scheduler.noteRateLimited();
    for (let index = 0; index < 19; index += 1) await scheduler.pace();
    scheduler.noteRateLimited();
    for (let index = 0; index < 19; index += 1) await scheduler.pace();
    expect(recovered).toEqual([]);

    await scheduler.pace();
    expect(recovered).toEqual([30]);
    expect(scheduler.effectiveDelayMs).toBe(30);
  });
});
