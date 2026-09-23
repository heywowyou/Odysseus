import { describe, expect, it } from 'vitest';
import { OriginLock, serverLockKeys } from './origin-lock.js';

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

describe('OriginLock.acquireAll', () => {
  /** haaitza.com and lacoorniche.com answer from one shared server. Two
   *  full audits held different origin keys and ran together, doubling the
   *  server's load; both met 503s minutes after the second one started. */
  it('makes two sites on one server wait for each other', async () => {
    const lock = new OriginLock();
    const events: string[] = [];

    const releaseFirst = await lock.acquireAll(['https://haaitza.example', 'address:192.0.2.7']);
    const second = lock
      .acquireAll(['https://lacoorniche.example', 'address:192.0.2.7'])
      .then((release) => {
        events.push('second');
        release();
      });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events).toEqual([]);

    releaseFirst();
    await second;
    expect(events).toEqual(['second']);
  });

  it('never deadlocks when two holders list shared keys in opposite orders', async () => {
    const lock = new OriginLock();
    const hold = async (keys: string[]): Promise<void> => {
      const release = await lock.acquireAll(keys);
      await new Promise((resolve) => setTimeout(resolve, 5));
      release();
    };

    await Promise.all([
      hold(['address:192.0.2.1', 'address:192.0.2.2']),
      hold(['address:192.0.2.2', 'address:192.0.2.1']),
    ]);
  });

  it('leaves a single-origin caller unaffected by other servers', async () => {
    const lock = new OriginLock();
    const releaseAudit = await lock.acquireAll(['https://a.example', 'address:192.0.2.1']);
    const release = await lock.acquire('https://b.example');
    release();
    releaseAudit();
  });
});

describe('serverLockKeys', () => {
  it('keys a site by its origin and every address its host resolves to', async () => {
    const keys = await serverLockKeys('http://haaitza.example/fr/', async (hostname) => {
      expect(hostname).toBe('haaitza.example');
      return ['192.0.2.7', '2001:db8::7'];
    });

    expect(keys).toEqual(['http://haaitza.example', 'address:192.0.2.7', 'address:2001:db8::7']);
  });

  it('falls back to the origin alone when the host does not resolve', async () => {
    const keys = await serverLockKeys('https://gone.example/', async () => {
      throw new Error('ENOTFOUND');
    });

    expect(keys).toEqual(['https://gone.example']);
  });
});
