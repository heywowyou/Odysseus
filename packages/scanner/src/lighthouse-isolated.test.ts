import { describe, expect, it } from 'vitest';
import { runLighthouseIsolated } from './lighthouse-isolated.js';

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
