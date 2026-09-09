/** Exponential lockout schedule: the Nth consecutive failure locks the IP
 *  for min(2^(N-1), 900) seconds, so password probing gets slow fast while
 *  an operator who mistypes once waits seconds, not minutes. */
export const MAX_LOCKOUT_SECONDS = 900;

/** How long past its last lockout an untouched entry may linger before a
 *  touch deletes it. Set to MAX_LOCKOUT_SECONDS so a maximum lockout can
 *  never vanish early and no entry outlives its last failure by more than
 *  one extra window. */
export const ENTRY_EXPIRY_GRACE_SECONDS = MAX_LOCKOUT_SECONDS;

/** Hard bound on tracked addresses. The Map keys come from a proxy-appended
 *  header value an attacker can vary per attempt, so without a cap a flood
 *  of failed logins with fresh addresses grows process memory without
 *  limit; when the cap is hit the oldest insertion-order entries go first. */
export const MAX_TRACKED_ADDRESSES = 10_000;

function entryExpiresAtMs(entry: { lockedUntil: number }): number {
  return entry.lockedUntil + ENTRY_EXPIRY_GRACE_SECONDS * 1000;
}

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
 *  toward locking the operator out of their own dashboard. Stale entries
 *  expire lazily on touch and the Map is capped, so failed-login floods
 *  cannot grow the process without bound; it is not persisted. */
export function createLoginRateLimiter(options: { now?: () => number } = {}): LoginRateLimiter {
  const now = options.now ?? Date.now;
  const failures = new Map<string, { count: number; lockedUntil: number }>();
  return {
    check(ip) {
      const entry = failures.get(ip);
      if (entry === undefined) return { allowed: true };
      const current = now();
      if (current >= entryExpiresAtMs(entry)) {
        // Lazy expiry: touched past its grace window, so drop it instead of
        // keeping the address forever.
        failures.delete(ip);
        return { allowed: true };
      }
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
      const existing = failures.get(ip);
      if (existing !== undefined && current >= entryExpiresAtMs(existing)) {
        // Lazy expiry: an ancient streak restarts from 1, it does not
        // resurrect through the grace window.
        failures.delete(ip);
      }
      const count = (failures.get(ip)?.count ?? 0) + 1;
      if (!failures.has(ip)) {
        // New key about to be inserted: evict from the Map's front, which
        // iterates in insertion order, until the cap leaves room for it.
        while (failures.size >= MAX_TRACKED_ADDRESSES) {
          const oldest = failures.keys().next();
          if (oldest.done) break;
          failures.delete(oldest.value);
        }
      }
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
