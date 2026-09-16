import { describe, expect, it } from 'vitest';
import {
  createLoginRateLimiter,
  ENTRY_EXPIRY_GRACE_SECONDS,
  GLOBAL_LOGIN_BURST,
  GLOBAL_LOGIN_VERIFICATIONS_PER_MINUTE,
  lockoutSecondsForFailures,
  MAX_LOCKOUT_SECONDS,
  MAX_TRACKED_ADDRESSES,
  rateLimitKeyForAddress,
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

  it('drops an entry once its lockout plus the grace window has passed', () => {
    const clock = clockAt(0);
    const limiter = createLoginRateLimiter({ now: clock.now });
    limiter.recordFailure('203.0.113.1');
    clock.advance((lockoutSecondsForFailures(1) + ENTRY_EXPIRY_GRACE_SECONDS + 1) * 1000);
    expect(limiter.check('203.0.113.1')).toEqual({ allowed: true });
    // The expired entry is gone: the next failure starts a fresh streak, so
    // the lock is the 1-second first-failure window, not an escalation.
    limiter.recordFailure('203.0.113.1');
    expect(limiter.check('203.0.113.1')).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it('keeps an entry alive while its lockout or grace window is still running', () => {
    const clock = clockAt(0);
    const limiter = createLoginRateLimiter({ now: clock.now });
    for (let i = 0; i < 20; i++) limiter.recordFailure('203.0.113.1');
    // Lockout over but the entry inside its grace window: still allowed to
    // try, and a failure inside the window resumes the old streak.
    clock.advance((lockoutSecondsForFailures(20) + ENTRY_EXPIRY_GRACE_SECONDS - 1) * 1000);
    expect(limiter.check('203.0.113.1')).toEqual({ allowed: true });
    limiter.recordFailure('203.0.113.1');
    expect(limiter.check('203.0.113.1')).toEqual({
      allowed: false,
      retryAfterSeconds: lockoutSecondsForFailures(21),
    });
  });

  it('evicts the oldest addresses once the size cap is hit and keeps fresh ones', () => {
    const limiter = createLoginRateLimiter();
    const overflow = 100;
    const ipAt = (n: number): string =>
      `10.${Math.floor(n / 65536) % 256}.${Math.floor(n / 256) % 256}.${n % 256}`;
    for (let n = 0; n < MAX_TRACKED_ADDRESSES + overflow; n++) {
      limiter.recordFailure(ipAt(n));
    }
    const evicted = ipAt(0);
    const recent = ipAt(MAX_TRACKED_ADDRESSES + overflow - 1);
    // The oldest insertion-order address was evicted: it answers allowed and
    // a new failure starts it over at the 1-second first-failure lock.
    expect(limiter.check(evicted)).toEqual({ allowed: true });
    limiter.recordFailure(evicted);
    expect(limiter.check(evicted)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    // The most recently touched address was not evicted: still fully locked.
    expect(limiter.check(recent)).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });
});

describe('rateLimitKeyForAddress', () => {
  it('keeps IPv4 and IPv4-mapped addresses whole', () => {
    expect(rateLimitKeyForAddress('203.0.113.1')).toBe('203.0.113.1');
    expect(rateLimitKeyForAddress('::ffff:203.0.113.1')).toBe('203.0.113.1');
  });

  it('keys IPv6 addresses by their /64 prefix whatever the spelling', () => {
    const key = rateLimitKeyForAddress('2001:db8:1:2::1');
    expect(key).toBe('2001:db8:1:2::/64');
    expect(rateLimitKeyForAddress('2001:0DB8:0001:0002:ffff:eeee:dddd:cccc')).toBe(key);
    expect(rateLimitKeyForAddress('2001:db8:1:3::1')).not.toBe(key);
    expect(rateLimitKeyForAddress('2001:db8::')).toBe('2001:db8:0:0::/64');
  });

  it('leaves a non-IP value such as the unknown fallback unchanged', () => {
    expect(rateLimitKeyForAddress('unknown')).toBe('unknown');
  });
});

describe('createLoginRateLimiter global verification budget', () => {
  it('shares one lockout across every address in an IPv6 /64', () => {
    const limiter = createLoginRateLimiter();
    limiter.recordFailure('2001:db8:1:2::a');
    expect(limiter.check('2001:db8:1:2::b')).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.check('2001:db8:1:3::a')).toEqual({ allowed: true });
  });

  it('refuses every address once the burst is spent, then refills over time', () => {
    const clock = clockAt(0);
    const limiter = createLoginRateLimiter({ now: clock.now });
    for (let n = 0; n < GLOBAL_LOGIN_BURST; n++) {
      expect(limiter.check(`198.51.100.${n}`)).toEqual({ allowed: true });
    }
    const refused = limiter.check('203.0.113.99');
    expect(refused.allowed).toBe(false);
    clock.advance(Math.ceil(60_000 / GLOBAL_LOGIN_VERIFICATIONS_PER_MINUTE));
    expect(limiter.check('203.0.113.99')).toEqual({ allowed: true });
    expect(limiter.check('203.0.113.100').allowed).toBe(false);
  });

  it('does not spend the global budget on an address that is already locked', () => {
    const limiter = createLoginRateLimiter();
    limiter.recordFailure('203.0.113.1');
    for (let n = 0; n < GLOBAL_LOGIN_BURST * 3; n++) {
      expect(limiter.check('203.0.113.1').allowed).toBe(false);
    }
    expect(limiter.check('203.0.113.2')).toEqual({ allowed: true });
  });
});
