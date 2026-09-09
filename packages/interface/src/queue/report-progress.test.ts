import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({ updateJobProgress: vi.fn() }));

import { updateJobProgress } from '@odysseus/store';
import { createScanProgressReporter } from './report-progress.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateJobProgress).mockResolvedValue(undefined);
});

describe('createScanProgressReporter staged full-audit progress', () => {
  it('persists independent content and Lighthouse buckets with a target-free selection phase', async () => {
    const now = vi.spyOn(Date, 'now');
    now
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(5000)
      .mockReturnValueOnce(10_000)
      .mockReturnValueOnce(16_000);
    const report = createScanProgressReporter({} as never, 'job-1');

    report({ type: 'content-scan-start', totalPages: 4 });
    report({
      type: 'content-scan-page',
      completed: 2,
      totalPages: 4,
      url: 'https://example.com/a',
    });
    report({ type: 'select-performance' });
    report({ type: 'lighthouse-start', totalPages: 2 });
    report({ type: 'lighthouse-page', completed: 1, totalPages: 2, url: 'https://example.com/' });
    report({ type: 'analysis-complete' });

    await vi.waitFor(() => expect(updateJobProgress).toHaveBeenCalledTimes(6));
    expect(vi.mocked(updateJobProgress).mock.calls.map((call) => call[2])).toEqual([
      { phase: 'content-scan', progress: { contentScan: { completed: 0, target: 4 } } },
      {
        phase: 'content-scan',
        progress: { contentScan: { completed: 2, target: 4, etaMs: 4000 } },
      },
      { phase: 'select-performance' },
      { phase: 'lighthouse', progress: { lighthouse: { completed: 0, target: 2 } } },
      {
        phase: 'lighthouse',
        progress: { lighthouse: { completed: 1, target: 2, etaMs: 6000 } },
      },
      { phase: 'normalize' },
    ]);
  });

  it('persists continuation omissions without changing the crawl phase', async () => {
    const report = createScanProgressReporter({} as never, 'job-1');
    report({ type: 'continuation-guard', omittedUrlCount: 7, omittedFamilyCount: 2 });

    await vi.waitFor(() => expect(updateJobProgress).toHaveBeenCalledOnce());
    expect(updateJobProgress).toHaveBeenCalledWith({} as never, 'job-1', {
      progress: { continuationGuard: { omittedUrlCount: 7, omittedFamilyCount: 2 } },
    });
  });

  it('leaves the queued phase at setup, before the paced robots and sitemap fetches finish', async () => {
    // Issue #121: a slow-profile job used to sit on phase queued for the
    // whole robots.txt plus sitemap window because the first event only
    // fired after those paced fetches.
    const report = createScanProgressReporter({} as never, 'job-1');
    report({ type: 'crawl-setup', maxPages: 12, delayMs: 60_000 });
    report({ type: 'crawl-start', maxPages: 12, effectiveDelayMs: 90_000, robotsTxtFound: true });

    await vi.waitFor(() => expect(updateJobProgress).toHaveBeenCalledTimes(2));
    expect(vi.mocked(updateJobProgress).mock.calls.map((call) => call[2])).toEqual([
      {
        phase: 'crawl',
        progress: {
          crawl: { visited: 0, target: 12, effectiveDelayMs: 60_000, etaMs: 720_000 },
        },
      },
      {
        phase: 'crawl',
        progress: {
          crawl: { visited: 0, target: 12, effectiveDelayMs: 90_000, etaMs: 1_080_000 },
        },
      },
    ]);
  });
});
