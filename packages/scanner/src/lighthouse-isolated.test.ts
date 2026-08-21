import { describe, expect, it } from 'vitest';
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
  it('propagates a worker-side failure as a rejection instead of crashing', async () => {
    await expect(
      runLighthouseIsolated('http://127.0.0.1:1', 0, { timeoutMs: 5_000 }),
    ).rejects.toThrow();
  }, 20_000);
});
