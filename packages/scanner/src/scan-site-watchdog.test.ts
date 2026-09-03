import { describe, expect, it } from 'vitest';
import { withPageWatchdog } from './scan-site.js';
import type { RenderedAnalysisResult } from './scan-page.js';

const completed = (url: string): RenderedAnalysisResult => ({
  url,
  checkOutcomes: {},
});

describe('withPageWatchdog', () => {
  it('resolves with the work result when the page finishes before the deadline', async () => {
    const work = new Promise<RenderedAnalysisResult>((resolve) =>
      setTimeout(() => resolve(completed('https://example.com/slow-but-finite/')), 5),
    );
    const result = await withPageWatchdog('https://example.com/slow-but-finite/', work, 5_000);
    expect(result).toEqual(completed('https://example.com/slow-but-finite/'));
  });

  it('resolves with a synthesized failed result when the page never completes', async () => {
    const never = new Promise<RenderedAnalysisResult>(() => undefined);
    const result = await withPageWatchdog('https://example.com/wedged/', never, 10);
    expect(result.url).toBe('https://example.com/wedged/');
    expect(result.renderDiffError).toContain('watchdog');
    expect(result.renderDiffError).toContain('10ms');
    expect(result.checkOutcomes).toEqual({});
  });

  it('does not fire the deadline after the work result already won the race', async () => {
    const work = Promise.resolve(completed('https://example.com/fast/'));
    const result = await withPageWatchdog('https://example.com/fast/', work, 10_000);
    expect(result).toEqual(completed('https://example.com/fast/'));
  });
});
