import { describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({ updateJobProgress: vi.fn() }));

import { updateJobProgress } from '@odysseus/store';
import { CancellationRegistry, JobCancelledError } from './cancellation.js';
import { createScanProgressReporter } from './report-progress.js';

describe('CancellationRegistry', () => {
  it('reports a requested job until it is forgotten', () => {
    const registry = new CancellationRegistry();
    expect(registry.isRequested('job-1')).toBe(false);

    registry.request('job-1');
    expect(registry.isRequested('job-1')).toBe(true);

    registry.forget('job-1');
    expect(registry.isRequested('job-1')).toBe(false);
  });
});

describe('createScanProgressReporter cancellation', () => {
  const crawlStartEvent = {
    type: 'crawl-start',
    maxPages: 10,
    effectiveDelayMs: 1000,
    robotsTxtFound: true,
  } as const;

  it('throws synchronously into the caller once a stop is requested', () => {
    const registry = new CancellationRegistry();
    const reporter = createScanProgressReporter({} as never, 'job-1', registry);

    expect(() => reporter(crawlStartEvent)).not.toThrow();

    registry.request('job-1');
    expect(() => reporter(crawlStartEvent)).toThrow(JobCancelledError);
    // The aborted event must not be processed: no progress write for it.
    expect(updateJobProgress).toHaveBeenCalledTimes(1);
  });

  it('without a registry, the reporter behaves as before (async, never throws)', () => {
    const reporter = createScanProgressReporter({} as never, 'job-1');
    expect(() => reporter(crawlStartEvent)).not.toThrow();
  });
});
