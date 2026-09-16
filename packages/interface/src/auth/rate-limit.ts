import { isIPv6 } from 'node:net';

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

/** Global ceiling on password verifications, ahead of the per-address
 *  lockout. Per-address limits alone let an attacker holding many addresses
 *  (one IPv6 /64 is plenty) force unauthenticated scrypt work onto the
 *  shared libuv threadpool of the host that also runs scans. A single
 *  operator never logs in anywhere near this often, so the bucket only binds
 *  under a flood; existing sessions are untouched while it does. */
export const GLOBAL_LOGIN_VERIFICATIONS_PER_MINUTE = 20;
export const GLOBAL_LOGIN_BURST = 20;

/** The key an address is locked under. IPv6 hosts are routinely handed a
 *  whole /64, so keying by full address would give one attacker 2^64 fresh
 *  lockout slots; the /64 prefix is the unit one subscriber controls. IPv4
 *  and IPv4-mapped IPv6 addresses stay whole. */
export function rateLimitKeyForAddress(address: string): string {
  if (!isIPv6(address)) return address;
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:') && lower.includes('.')) return lower.slice('::ffff:'.length);
  const [head = '', tail = ''] = lower.split('::');
  const headGroups = head === '' ? [] : head.split(':');
  const tailGroups = tail === '' ? [] : tail.split(':');
  const groups = lower.includes('::')
    ? [
        ...headGroups,
        ...Array<string>(8 - headGroups.length - tailGroups.length).fill('0'),
        ...tailGroups,
      ]
    : headGroups;
  const prefix = groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, ''));
  return `${prefix.join(':')}::/64`;
}

function entryExpiresAtMs(entry: { lockedUntil: number }): number {
  return entry.lockedUntil + ENTRY_EXPIRY_GRACE_SECONDS * 1000;
}

export function lockoutSecondsForFailures(failureCount: number): number {
  return Math.min(2 ** (failureCount - 1), MAX_LOCKOUT_SECONDS);
}

export type LoginRateLimitDecision =
  { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface LoginRateLimiter {
  /** Must run before any password work: a locked address, or any attempt
   *  once the global verification budget is spent, is refused without ever
   *  reaching the scrypt comparison. An allowed decision spends one unit of
   *  that budget, so call it exactly once per verification. */
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
  const refillPerMs = GLOBAL_LOGIN_VERIFICATIONS_PER_MINUTE / 60_000;
  const bucket = { tokens: GLOBAL_LOGIN_BURST, updatedAt: now() };

  function checkAddress(ip: string, current: number): LoginRateLimitDecision {
    const entry = failures.get(ip);
    if (entry === undefined) return { allowed: true };
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
  }

  function takeGlobalToken(current: number): LoginRateLimitDecision {
    const elapsed = Math.max(0, current - bucket.updatedAt);
    bucket.tokens = Math.min(GLOBAL_LOGIN_BURST, bucket.tokens + elapsed * refillPerMs);
    bucket.updatedAt = current;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true };
    }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((1 - bucket.tokens) / refillPerMs / 1000)),
    };
  }

  return {
    check(address) {
      const current = now();
      const perAddress = checkAddress(rateLimitKeyForAddress(address), current);
      // A locked address spends nothing, so a locked flood cannot drain the
      // budget the operator's own login draws on.
      if (!perAddress.allowed) return perAddress;
      return takeGlobalToken(current);
    },
    recordFailure(address) {
      const ip = rateLimitKeyForAddress(address);
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
    recordSuccess(address) {
      failures.delete(rateLimitKeyForAddress(address));
    },
  };
}
