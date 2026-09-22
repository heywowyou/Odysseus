import { describe, expect, it } from 'vitest';
import { delaySeconds, summarizePushback } from './pushback';

const page = 'https://example.com/';

describe('summarizePushback', () => {
  it('has nothing to say without events', () => {
    expect(summarizePushback([], 10_000)).toBeUndefined();
  });

  it('reports the pace the scanner slowed itself to, without advising a relaunch', () => {
    const summary = summarizePushback(
      [
        { pageUrl: page, delayMs: 20_000, atMaxDelay: false },
        { pageUrl: `${page}bar`, delayMs: 40_000, atMaxDelay: false },
      ],
      10_000,
    );

    expect(summary).toMatchObject({
      eventCount: 2,
      pageCount: 2,
      currentDelayMs: 40_000,
      relaunchAdvised: false,
    });
  });

  it('advises a relaunch once the site pushes back at the capped delay', () => {
    const summary = summarizePushback(
      [
        { pageUrl: page, delayMs: 60_000, atMaxDelay: false },
        { pageUrl: page, delayMs: 60_000, atMaxDelay: true },
      ],
      30_000,
    );

    expect(summary?.relaunchAdvised).toBe(true);
    expect(summary?.suggestedDelayMs).toBe(120_000);
  });

  it('advises a relaunch when pages stayed blocked after their retry', () => {
    const summary = summarizePushback([{ pageUrl: page, delayMs: 20_000 }], 10_000, 3);

    expect(summary?.relaunchAdvised).toBe(true);
  });

  it('falls back to the starting delay for events recorded before the pace was tracked', () => {
    const summary = summarizePushback([{ pageUrl: page, retryAfterMs: 7_000 }], 2_000);

    expect(summary?.currentDelayMs).toBe(2_000);
    expect(summary?.relaunchAdvised).toBe(false);
    expect(summary?.suggestedDelayMs).toBe(7_000);
  });
});

describe('delaySeconds', () => {
  it('rounds to whole seconds and never shows zero', () => {
    expect(delaySeconds(60_000)).toBe(60);
    expect(delaySeconds(333)).toBe(1);
  });
});
