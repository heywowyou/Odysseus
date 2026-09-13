import { describe, expect, it, vi } from 'vitest';
import { createPollingController } from './polling';

interface Tick {
  resolve: (value: number) => void;
  reject: (error: Error) => void;
}

/** Drives the controller with fake timers and manual promise handles so
 *  overlap and cancellation are observable deterministically. settle/fail
 *  await one microtask flush because runOnce resumes asynchronously after
 *  the underlying promise resolves. */
function harness(intervalMs: number) {
  const pending: Tick[] = [];
  const events: string[] = [];
  let nextValue = 0;
  const controller = createPollingController({
    intervalMs,
    fetcher: () =>
      new Promise<number>((resolve, reject) => {
        pending.push({ resolve, reject });
      }),
    onUpdate: (data) => events.push(`update:${String(data)}`),
    onError: (message) => events.push(message === undefined ? 'error:clear' : `error:${message}`),
    onSettled: (isLoading) => events.push(`loading:${String(isLoading)}`),
  });
  return {
    controller,
    events,
    settle: async (value?: number): Promise<void> => {
      pending.shift()!.resolve(value ?? ++nextValue);
      await Promise.resolve();
    },
    fail: async (message: string): Promise<void> => {
      pending.shift()!.reject(new Error(message));
      await Promise.resolve();
    },
    pendingCount: () => pending.length,
    advance: (ms: number) => {
      vi.advanceTimersByTime(ms);
    },
  };
}

describe('createPollingController', () => {
  it('fetches once immediately and never reschedules with intervalMs 0', async () => {
    vi.useFakeTimers();
    const tick = harness(0);
    tick.controller.start();
    expect(tick.pendingCount()).toBe(1);
    await tick.settle(7);
    expect(tick.events).toEqual(['loading:true', 'error:clear', 'update:7', 'loading:false']);
    tick.advance(60_000);
    expect(tick.pendingCount()).toBe(0);
    vi.useRealTimers();
  });

  it('schedules the next fetch only after the current one settles', async () => {
    vi.useFakeTimers();
    const tick = harness(5_000);
    tick.controller.start();
    await tick.settle(1);
    tick.advance(4_999);
    expect(tick.pendingCount()).toBe(0);
    tick.advance(1);
    expect(tick.pendingCount()).toBe(1);
    expect(tick.events).toContain('update:1');
    vi.useRealTimers();
  });

  it('never stacks a second in-flight request', () => {
    vi.useFakeTimers();
    const tick = harness(5_000);
    tick.controller.start();
    tick.advance(60_000);
    expect(tick.pendingCount()).toBe(1);
    vi.useRealTimers();
  });

  it('reports errors and keeps polling', async () => {
    vi.useFakeTimers();
    const tick = harness(5_000);
    tick.controller.start();
    await tick.fail('boom');
    expect(tick.events).toContain('error:boom');
    expect(tick.events).toContain('loading:false');
    tick.advance(5_000);
    expect(tick.pendingCount()).toBe(1);
    vi.useRealTimers();
  });

  it('clears a transient error when polling later succeeds', async () => {
    vi.useFakeTimers();
    const tick = harness(5_000);
    tick.controller.start();
    await tick.settle(1);
    tick.advance(5_000);
    await tick.fail('temporary outage');
    tick.advance(5_000);
    await tick.settle(2);

    expect(tick.events).toEqual([
      'loading:true',
      'error:clear',
      'update:1',
      'loading:false',
      'loading:true',
      'error:temporary outage',
      'loading:false',
      'loading:true',
      'error:clear',
      'update:2',
      'loading:false',
    ]);
    vi.useRealTimers();
  });

  it('stop() cancels the pending timer and drops in-flight results', async () => {
    vi.useFakeTimers();
    const tick = harness(5_000);
    tick.controller.start();
    await tick.settle(1);
    tick.advance(5_000);
    expect(tick.pendingCount()).toBe(1);
    tick.controller.stop();
    await tick.settle(2);
    expect(tick.events).not.toContain('update:2');
    tick.advance(60_000);
    expect(tick.pendingCount()).toBe(0);
    vi.useRealTimers();
  });

  it('pause() cancels the pending timer but keeps an in-flight result', async () => {
    vi.useFakeTimers();
    const tick = harness(5_000);
    tick.controller.start();
    await tick.settle(1);
    tick.controller.pause();
    tick.advance(60_000);
    expect(tick.pendingCount()).toBe(0);
    vi.useRealTimers();
  });

  it('pause() during an in-flight fetch still delivers that result, then stays paused', async () => {
    vi.useFakeTimers();
    const tick = harness(5_000);
    tick.controller.start();
    tick.controller.pause();
    await tick.settle(1);
    expect(tick.events).toContain('update:1');
    tick.advance(60_000);
    expect(tick.pendingCount()).toBe(0);
    vi.useRealTimers();
  });

  it('resume() fetches immediately and restarts the interval cadence', async () => {
    vi.useFakeTimers();
    const tick = harness(5_000);
    tick.controller.start();
    await tick.settle(1);
    tick.controller.pause();
    tick.advance(60_000);
    expect(tick.pendingCount()).toBe(0);
    tick.controller.resume();
    expect(tick.pendingCount()).toBe(1);
    await tick.settle(2);
    tick.advance(5_000);
    expect(tick.pendingCount()).toBe(1);
    vi.useRealTimers();
  });

  it('resume() is a no-op when never paused or already stopped', async () => {
    vi.useFakeTimers();
    const tick = harness(5_000);
    tick.controller.start();
    await tick.settle(1);
    tick.controller.resume();
    expect(tick.pendingCount()).toBe(0);
    tick.controller.stop();
    tick.controller.resume();
    expect(tick.pendingCount()).toBe(0);
    vi.useRealTimers();
  });
});
