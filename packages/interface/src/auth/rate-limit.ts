/** Exponential lockout schedule: the Nth consecutive failure locks the IP
 *  for min(2^(N-1), 900) seconds, so password probing gets slow fast while
 *  an operator who mistypes once waits seconds, not minutes. */
export const MAX_LOCKOUT_SECONDS = 900;

export function lockoutSecondsForFailures(failureCount: number): number {
  return Math.min(2 ** (failureCount - 1), MAX_LOCKOUT_SECONDS);
}

export type LoginRateLimitDecision =
  { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface LoginRateLimiter {
  /** Must run before any password work: a locked IP is refused without
   *  ever reaching the scrypt comparison. */
  check(ip: string): LoginRateLimitDecision;
  recordFailure(ip: string): void;
  recordSuccess(ip: string): void;
}

/** In-memory like the session store: a restart forgets lockouts, which only
 *  ever errs toward letting a locked IP try again after a deploy, never
 *  toward locking the operator out of their own dashboard. */
export function createLoginRateLimiter(options: { now?: () => number } = {}): LoginRateLimiter {
  const now = options.now ?? Date.now;
  const failures = new Map<string, { count: number; lockedUntil: number }>();
  return {
    check(ip) {
      const entry = failures.get(ip);
      if (entry === undefined) return { allowed: true };
      const current = now();
      if (current < entry.lockedUntil) {
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil((entry.lockedUntil - current) / 1000),
        };
      }
      return { allowed: true };
    },
    recordFailure(ip) {
      const current = now();
      const count = (failures.get(ip)?.count ?? 0) + 1;
      failures.set(ip, {
        count,
        lockedUntil: current + lockoutSecondsForFailures(count) * 1000,
      });
    },
    recordSuccess(ip) {
      failures.delete(ip);
    },
  };
}
