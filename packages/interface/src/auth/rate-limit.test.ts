import { describe, expect, it } from 'vitest';
import {
  createLoginRateLimiter,
  lockoutSecondsForFailures,
  MAX_LOCKOUT_SECONDS,
} from './rate-limit.js';

function clockAt(start: number) {
  const state = { now: start };
  return {
    now: () => state.now,
    advance: (ms: number) => {
      state.now += ms;
    },
  };
}

describe('lockoutSecondsForFailures', () => {
  it('doubles per consecutive failure and caps at 15 minutes', () => {
    expect(lockoutSecondsForFailures(1)).toBe(1);
    expect(lockoutSecondsForFailures(2)).toBe(2);
    expect(lockoutSecondsForFailures(3)).toBe(4);
    expect(lockoutSecondsForFailures(10)).toBe(512);
    expect(lockoutSecondsForFailures(11)).toBe(MAX_LOCKOUT_SECONDS);
    expect(lockoutSecondsForFailures(50)).toBe(MAX_LOCKOUT_SECONDS);
  });
});

describe('createLoginRateLimiter', () => {
  it('allows an IP with no recorded failures', () => {
    expect(createLoginRateLimiter().check('203.0.113.1')).toEqual({ allowed: true });
  });

  it('locks after the first failure and releases when the lock lapses', () => {
    const clock = clockAt(0);
    const limiter = createLoginRateLimiter({ now: clock.now });
    limiter.recordFailure('203.0.113.1');
    expect(limiter.check('203.0.113.1')).toEqual({ allowed: false, retryAfterSeconds: 1 });
    clock.advance(999);
    expect(limiter.check('203.0.113.1').allowed).toBe(false);
    clock.advance(1);
    expect(limiter.check('203.0.113.1')).toEqual({ allowed: true });
  });

  it('escalates the window per consecutive failure', () => {
    const clock = clockAt(0);
    const limiter = createLoginRateLimiter({ now: clock.now });
    limiter.recordFailure('203.0.113.1');
    clock.advance(1_000);
    limiter.recordFailure('203.0.113.1');
    expect(limiter.check('203.0.113.1')).toEqual({ allowed: false, retryAfterSeconds: 2 });
  });

  it('caps the retry window at 15 minutes', () => {
    const clock = clockAt(0);
    const limiter = createLoginRateLimiter({ now: clock.now });
    for (let i = 0; i < 20; i++) limiter.recordFailure('203.0.113.1');
    expect(limiter.check('203.0.113.1')).toEqual({
      allowed: false,
      retryAfterSeconds: MAX_LOCKOUT_SECONDS,
    });
  });

  it('resets the consecutive count on success', () => {
    const clock = clockAt(0);
    const limiter = createLoginRateLimiter({ now: clock.now });
    limiter.recordFailure('203.0.113.1');
    limiter.recordSuccess('203.0.113.1');
    expect(limiter.check('203.0.113.1')).toEqual({ allowed: true });
    limiter.recordFailure('203.0.113.1');
    expect(limiter.check('203.0.113.1')).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it('tracks IPs independently', () => {
    const limiter = createLoginRateLimiter();
    limiter.recordFailure('203.0.113.1');
    expect(limiter.check('203.0.113.2')).toEqual({ allowed: true });
  });
});
