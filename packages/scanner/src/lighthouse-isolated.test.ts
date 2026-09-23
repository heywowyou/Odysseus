import { EventEmitter } from 'node:events';
import { fork } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, fork: vi.fn(actual.fork) };
});
import { resolveWorkerPath, runLighthouseIsolated } from './lighthouse-isolated.js';

/**
 * Regression guard for the bug found during the 2026-08-21 La Corniche
 * feedback pass: WORKER_PATH used to hardcode the '.ts' extension, which
 * only exists when this module is loaded from source under tsx (dev mode).
 * Every real consumer of the built @odysseus/scanner package (odysseus
 * serve, the CLI's workspace resolution) loads this module as dist/
 * lighthouse-isolated.js, where only lighthouse-worker.js exists - the
 * fork target resolved to a nonexistent .ts file and crashed identically
 * on every single page of every single real scan, which read as a
 * Lighthouse/site-compatibility problem until traced to this.
 */
describe('resolveWorkerPath', () => {
  it('resolves to a .ts worker path when loaded from a .ts module URL', () => {
    expect(resolveWorkerPath('file:///repo/packages/scanner/src/lighthouse-isolated.ts')).toBe(
      '/repo/packages/scanner/src/lighthouse-worker.ts',
    );
  });

  it('resolves to a .js worker path when loaded from a built .js module URL', () => {
    expect(resolveWorkerPath('file:///repo/packages/scanner/dist/lighthouse-isolated.js')).toBe(
      '/repo/packages/scanner/dist/lighthouse-worker.js',
    );
  });
});

/**
 * No live Chromium/debugPort here on purpose (repo convention: unit tests
 * don't require a browser). Pointing at an unreachable port makes
 * Lighthouse itself fail fast inside the child, which is enough to prove
 * the fork/IPC plumbing this test actually cares about: a failure inside
 * the worker surfaces as a normal rejected promise here, not a crash of
 * the test process, and does so within the timeout budget.
 */
describe('runLighthouseIsolated', () => {
  it('closes new page targets when the Lighthouse worker is killed', async () => {
    const child = new EventEmitter() as EventEmitter & {
      stderr: EventEmitter;
      send: ReturnType<typeof vi.fn>;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stderr = new EventEmitter();
    child.send = vi.fn();
    child.kill = vi.fn();
    vi.mocked(fork).mockImplementationOnce(() => child as never);

    const existing = [{ id: 'baseline-target', type: 'page' }];
    const afterFailure = [...existing, { id: 'stray-target', type: 'page' }];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(existing)))
      .mockResolvedValueOnce(new Response(JSON.stringify(afterFailure)))
      .mockResolvedValueOnce(new Response('Target is closing'));
    vi.stubGlobal('fetch', fetchMock);

    const pending = runLighthouseIsolated('https://example.com/', 9222, { timeoutMs: 1 });
    await vi.waitFor(() => expect(fork).toHaveBeenCalledOnce());
    child.emit('exit', null, 'SIGKILL');
    await expect(pending).rejects.toThrow(/exited before returning a result/);

    expect(fetchMock.mock.calls.map(([targetUrl]) => targetUrl)).toContain(
      'http://127.0.0.1:9222/json/close/stray-target',
    );
  });

  it('propagates a worker-side failure as a rejection instead of crashing', async () => {
    await expect(
      runLighthouseIsolated('http://127.0.0.1:1', 0, { timeoutMs: 5_000 }),
    ).rejects.toThrow();
  }, 30_000);
});
