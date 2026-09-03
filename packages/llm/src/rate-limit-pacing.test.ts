import { describe, expect, it } from 'vitest';
import {
  appendProviderRetryAfterHint,
  extractProviderRetryAfterMs,
  isRateLimitFailure,
  paceRateLimitedRetry,
  parseProviderRetryAfterHint,
  pauseBetweenLanguagePasses,
} from './rate-limit-pacing.js';

describe('isRateLimitFailure', () => {
  it('recognizes provider rate-limit failures in any phrasing', () => {
    expect(isRateLimitFailure('API error occurred: Status 429')).toBe(true);
    expect(isRateLimitFailure('Body: {"message":"Rate limit exceeded","code":"1300"}')).toBe(true);
    expect(isRateLimitFailure('rate_limited')).toBe(true);
  });

  it('ignores every other failure', () => {
    expect(isRateLimitFailure('severity vocabulary violations in field(s): executiveSummary')).toBe(
      false,
    );
    expect(isRateLimitFailure('Status 500')).toBe(false);
  });
});

describe('extractProviderRetryAfterMs', () => {
  it('reads retry-after seconds off a 429 error with SDK-shaped headers', () => {
    const error = Object.assign(new Error('429 Rate limit exceeded'), {
      status: 429,
      headers: new Headers({ 'retry-after': '90' }),
    });
    expect(extractProviderRetryAfterMs(error)).toBe(90_000);
  });

  it('prefers the millisecond-granularity retry-after-ms hint', () => {
    const error = Object.assign(new Error('429'), {
      status: 429,
      headers: new Headers({ 'retry-after': '90', 'retry-after-ms': '250' }),
    });
    expect(extractProviderRetryAfterMs(error)).toBe(250);
  });

  it('accepts fractional seconds', () => {
    const error = Object.assign(new Error('429'), {
      status: 429,
      headers: new Headers({ 'retry-after': '1.5' }),
    });
    expect(extractProviderRetryAfterMs(error)).toBe(1500);
  });

  it('parses an HTTP-date retry-after as time from now', () => {
    const error = Object.assign(new Error('429'), {
      status: 429,
      headers: new Headers({ 'retry-after': new Date(Date.now() + 60_000).toUTCString() }),
    });
    const retryAfterMs = extractProviderRetryAfterMs(error);
    expect(retryAfterMs).toBeGreaterThanOrEqual(30_000);
    expect(retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it('reads a plain-object header when the error carries no Headers instance', () => {
    const error = { status: 429, headers: { 'retry-after': '7' } };
    expect(extractProviderRetryAfterMs(error)).toBe(7_000);
  });

  it('returns undefined without a readable hint, for non-429s, and for non-errors', () => {
    expect(
      extractProviderRetryAfterMs(
        Object.assign(new Error('429'), { status: 429, headers: new Headers() }),
      ),
    ).toBeUndefined();
    expect(
      extractProviderRetryAfterMs(
        Object.assign(new Error('500'), {
          status: 500,
          headers: new Headers({ 'retry-after': '7' }),
        }),
      ),
    ).toBeUndefined();
    expect(extractProviderRetryAfterMs({ status: 429 })).toBeUndefined();
    expect(extractProviderRetryAfterMs('429')).toBeUndefined();
    expect(extractProviderRetryAfterMs(undefined)).toBeUndefined();
  });
});

describe('provider retry-after hint marker', () => {
  it('round-trips seconds and milliseconds', () => {
    expect(appendProviderRetryAfterHint('429 Rate limit exceeded', 90_000)).toBe(
      '429 Rate limit exceeded (provider retry-after: 90s)',
    );
    expect(appendProviderRetryAfterHint('429 Rate limit exceeded', 1500)).toBe(
      '429 Rate limit exceeded (provider retry-after: 1500ms)',
    );
    expect(parseProviderRetryAfterHint('429 Rate limit exceeded (provider retry-after: 90s)')).toBe(
      90_000,
    );
    expect(parseProviderRetryAfterHint('boom (provider retry-after: 1500ms)')).toBe(1500);
    expect(parseProviderRetryAfterHint('no marker here')).toBeUndefined();
  });
});

describe('paceRateLimitedRetry', () => {
  it('waits longer on each consecutive rate-limited attempt, floor 60s per attempt', async () => {
    const sleeps: number[] = [];
    const fakeSleep = async (ms: number): Promise<void> => {
      sleeps.push(ms);
    };
    await paceRateLimitedRetry(1, 'Status 429', fakeSleep);
    await paceRateLimitedRetry(2, 'Rate limit exceeded', fakeSleep);
    expect(sleeps).toEqual([60_000, 120_000]);
  });

  it('waits out a Retry-After ask longer than the floor (issue #30)', async () => {
    const sleeps: number[] = [];
    await paceRateLimitedRetry(
      1,
      appendProviderRetryAfterHint('Status 429', 90_000),
      async (ms) => {
        sleeps.push(ms);
      },
    );
    expect(sleeps).toEqual([90_000]);
  });

  it('keeps the attempt floor when the provider asks for less', async () => {
    const sleeps: number[] = [];
    await paceRateLimitedRetry(
      2,
      appendProviderRetryAfterHint('Status 429', 30_000),
      async (ms) => {
        sleeps.push(ms);
      },
    );
    expect(sleeps).toEqual([120_000]);
  });

  it('returns immediately for non-rate-limit failures', async () => {
    const sleeps: number[] = [];
    await paceRateLimitedRetry(1, 'language compliance violations', async (ms) => {
      sleeps.push(ms);
    });
    expect(sleeps).toEqual([]);
  });
});

describe('pauseBetweenLanguagePasses', () => {
  it('pauses a fixed 20s between the French and English passes', async () => {
    const sleeps: number[] = [];
    await pauseBetweenLanguagePasses(async (ms) => {
      sleeps.push(ms);
    });
    expect(sleeps).toEqual([20_000]);
  });
});
