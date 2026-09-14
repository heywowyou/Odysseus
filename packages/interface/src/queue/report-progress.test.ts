import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({ updateJobProgress: vi.fn() }));

import { updateJobProgress } from '@odysseus/store';
import { createScanProgressReporter } from './report-progress.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateJobProgress).mockResolvedValue(undefined);
});

afterEach(() => {
  // The content-scan/Lighthouse phases below don't call Date.now() at all
  // (they only use each event's own durationMs), but the crawl-cadence
  // test does spy on it - restore so a leftover queued value never leaks
  // into another test's Date.now() calls.
  vi.restoreAllMocks();
});

describe('createScanProgressReporter staged full-audit progress', () => {
  it('persists independent content and Lighthouse buckets with a target-free selection phase', async () => {
    const report = createScanProgressReporter({} as never, 'job-1');

    report({ type: 'content-scan-start', totalPages: 4, alreadyCompleted: 0, concurrency: 2 });
    report({
      type: 'content-scan-page',
      completed: 2,
      totalPages: 4,
      url: 'https://example.com/a',
      durationMs: 4000,
    });
    report({ type: 'select-performance' });
    report({ type: 'lighthouse-start', totalPages: 2, alreadyCompleted: 0 });
    report({
      type: 'lighthouse-page',
      completed: 1,
      totalPages: 2,
      url: 'https://example.com/',
      durationMs: 6000,
    });
    report({ type: 'analysis-complete' });

    await vi.waitFor(() => expect(updateJobProgress).toHaveBeenCalledTimes(6));
    expect(vi.mocked(updateJobProgress).mock.calls.map((call) => call[2])).toEqual([
      { phase: 'content-scan', progress: { contentScan: { completed: 0, target: 4 } } },
      {
        phase: 'content-scan',
        // 1 sample of 4000ms, concurrency 2 -> ceil(2/2)=1 wave -> 4000ms.
        progress: {
          contentScan: {
            completed: 2,
            target: 4,
            etaMs: 4000,
            etaCalculatedAt: expect.any(Date),
          },
        },
      },
      { phase: 'select-performance' },
      { phase: 'lighthouse', progress: { lighthouse: { completed: 0, target: 2 } } },
      {
        phase: 'lighthouse',
        // 1 sample of 6000ms, concurrency always 1 -> 1 remaining -> 6000ms.
        progress: {
          lighthouse: {
            completed: 1,
            target: 2,
            etaMs: 6000,
            etaCalculatedAt: expect.any(Date),
          },
        },
      },
      { phase: 'normalize' },
    ]);
  });

  it('seeds resumed progress from alreadyCompleted without an ETA sample yet', async () => {
    // Issue #223: a resumed run's alreadyCompleted count must show up in
    // the persisted completed/target immediately, but with no ETA until a
    // real page finishes in this process - a resumed page took no wall
    // time here, so it must never look like an instantly-fast sample.
    const report = createScanProgressReporter({} as never, 'job-1');

    report({ type: 'content-scan-start', totalPages: 10, alreadyCompleted: 6, concurrency: 3 });
    report({ type: 'lighthouse-start', totalPages: 10, alreadyCompleted: 4 });

    await vi.waitFor(() => expect(updateJobProgress).toHaveBeenCalledTimes(2));
    expect(vi.mocked(updateJobProgress).mock.calls.map((call) => call[2])).toEqual([
      { phase: 'content-scan', progress: { contentScan: { completed: 6, target: 10 } } },
      { phase: 'lighthouse', progress: { lighthouse: { completed: 4, target: 10 } } },
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
          crawl: {
            visited: 0,
            target: 12,
            effectiveDelayMs: 60_000,
            etaMs: 720_000,
            etaCalculatedAt: expect.any(Date),
          },
        },
      },
      {
        phase: 'crawl',
        progress: {
          crawl: {
            visited: 0,
            target: 12,
            effectiveDelayMs: 90_000,
            etaMs: 1_080_000,
            etaCalculatedAt: expect.any(Date),
          },
        },
      },
    ]);
  });

  it('sharpens the crawl ETA from the configured delay to the observed page cadence', async () => {
    // Issue #223: once real crawl-page arrivals are observed, the ETA
    // should reflect actual cadence rather than staying pinned to the
    // configured delay for the whole crawl.
    const now = vi.spyOn(Date, 'now');
    now
      .mockReturnValueOnce(0) // crawl-start
      .mockReturnValueOnce(2000) // crawl-page #1
      .mockReturnValueOnce(6000); // crawl-page #2
    const report = createScanProgressReporter({} as never, 'job-1');

    report({ type: 'crawl-start', maxPages: 10, effectiveDelayMs: 1000, robotsTxtFound: false });
    report({ type: 'crawl-page', visited: 1, maxPages: 10, queued: 20 });
    report({ type: 'crawl-page', visited: 2, maxPages: 10, queued: 20 });

    await vi.waitFor(() => expect(updateJobProgress).toHaveBeenCalledTimes(3));
    const calls = vi.mocked(updateJobProgress).mock.calls.map((call) => call[2]);

    // crawl-start: no observed cadence yet, falls back to the configured delay.
    expect(calls[0]).toEqual({
      phase: 'crawl',
      progress: {
        crawl: {
          visited: 0,
          target: 10,
          effectiveDelayMs: 1000,
          etaMs: 10_000,
          etaCalculatedAt: expect.any(Date),
        },
      },
    });

    // crawl-page #1: one observed gap of 2000ms -> 9 remaining * 2000ms.
    expect(calls[1]).toEqual({
      phase: 'crawl',
      progress: {
        crawl: {
          visited: 1,
          target: 10,
          effectiveDelayMs: 1000,
          etaMs: 18_000,
          etaCalculatedAt: expect.any(Date),
        },
      },
    });

    // crawl-page #2: a second observed gap of 4000ms shifts the smoothed
    // estimate upward from the first sample.
    const crawlProgress = (calls[2] as { progress: { crawl: { etaMs: number } } }).progress.crawl;
    expect(crawlProgress.etaMs).toBeGreaterThan(18_000);
  });
});
