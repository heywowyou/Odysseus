import { describe, expect, it } from 'vitest';
import { isRateLimitFailure, paceRateLimitedRetry } from './rate-limit-pacing.js';

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

describe('paceRateLimitedRetry', () => {
  it('waits longer on each consecutive rate-limited attempt', async () => {
    const sleeps: number[] = [];
    const fakeSleep = async (ms: number): Promise<void> => {
      sleeps.push(ms);
    };
    await paceRateLimitedRetry(1, 'Status 429', fakeSleep);
    await paceRateLimitedRetry(2, 'Rate limit exceeded', fakeSleep);
    expect(sleeps).toEqual([20_000, 40_000]);
  });

  it('returns immediately for non-rate-limit failures', async () => {
    const sleeps: number[] = [];
    await paceRateLimitedRetry(1, 'language compliance violations', async (ms) => {
      sleeps.push(ms);
    });
    expect(sleeps).toEqual([]);
  });
});
