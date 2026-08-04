import { describe, expect, it } from 'vitest';
import { OriginLock } from './origin-lock.js';

describe('OriginLock', () => {
  it('resolves immediately for an uncontended origin', async () => {
    const lock = new OriginLock();
    const release = await lock.acquire('https://a.example');
    expect(typeof release).toBe('function');
    release();
  });

  it('blocks a second acquire for the same origin until the first releases', async () => {
    const lock = new OriginLock();
    const events: string[] = [];

    const release1 = await lock.acquire('https://a.example');
    events.push('acquired-1');

    const second = lock.acquire('https://a.example').then((release2) => {
      events.push('acquired-2');
      release2();
    });

    // Give the second acquire a chance to run if it were (incorrectly) unblocked.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events).toEqual(['acquired-1']);

    release1();
    await second;
    expect(events).toEqual(['acquired-1', 'acquired-2']);
  });

  it('serializes three queued acquires for the same origin in order', async () => {
    const lock = new OriginLock();
    const order: number[] = [];

    async function run(id: number, holdMs: number): Promise<void> {
      const release = await lock.acquire('https://a.example');
      order.push(id);
      await new Promise((resolve) => setTimeout(resolve, holdMs));
      release();
    }

    await Promise.all([run(1, 20), run(2, 5), run(3, 5)]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('never blocks different origins against each other', async () => {
    const lock = new OriginLock();
    const events: string[] = [];

    const releaseA = await lock.acquire('https://a.example');
    events.push('a-acquired');

    const releaseB = await lock.acquire('https://b.example');
    events.push('b-acquired');

    expect(events).toEqual(['a-acquired', 'b-acquired']);
    releaseA();
    releaseB();
  });
});
