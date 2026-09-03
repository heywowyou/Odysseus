import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Provider rate-limit pacing for the analysis passes' API-error retries.
 * The retry budgets and guards are unchanged (docs/rules/llm-layer-rules.md
 * section 2): this only stops the loop from burning every attempt inside
 * one throttling window - measured live during plan 019's operator review,
 * where a French pass succeeded and the English pass then 429ed on all
 * three immediate attempts.
 *
 * Amended 2026-09-03 (issue #30): after the plan-025 provider switch the
 * same flow still exhausted all three attempts - the old 60s total backoff
 * no longer outlasts the current provider's throttling window, and a
 * Retry-After response header went unread. The backoff floor is now 60s
 * per attempt, a Retry-After the provider asks for is waited out in full
 * (a floor over the base delay, never a shortcut under it), and
 * pauseBetweenLanguagePasses keeps the French and English passes of one
 * audit out of the same window.
 */

const RATE_LIMIT_BASE_DELAY_MS = 60_000;
const LANGUAGE_PASS_PAUSE_MS = 20_000;

export function isRateLimitFailure(message: string): boolean {
  return /429|rate.?limit/i.test(message);
}

/**
 * The wait the provider asked for, in milliseconds, read off a thrown API
 * error. Duck-typed on purpose: the SDK's error message wording changes
 * across major versions (the 429 in issue #30's log does not match the
 * installed SDK's rendering), but every generation exposes `status` and
 * `headers` on the error object. Returns undefined for anything that is
 * not a 429 or that carries no readable retry hint.
 */
export function extractProviderRetryAfterMs(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as { status?: unknown; headers?: unknown };
  if (candidate.status !== 429) return undefined;
  const headers = candidate.headers;
  if (typeof headers !== 'object' || headers === null) return undefined;

  const read = (name: string): string | null => {
    const get = (headers as { get?: unknown }).get;
    if (typeof get === 'function') {
      const value = (get as (name: string) => unknown).call(headers, name);
      return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
    }
    const value = (headers as Record<string, unknown>)[name];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  };

  const msHeader = read('retry-after-ms');
  if (msHeader !== null) {
    const ms = Number(msHeader);
    if (Number.isFinite(ms) && ms >= 0) return ms;
  }

  const secondsHeader = read('retry-after');
  if (secondsHeader !== null) {
    const seconds = Number(secondsHeader);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(secondsHeader);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }

  return undefined;
}

const RETRY_AFTER_HINT_LABEL = 'provider retry-after';
const RETRY_AFTER_HINT_PATTERN = /provider retry-after: (\d+(?:\.\d+)?)(ms|s)\)/;

/** Appends the machine-readable marker the pacing helper parses. The
 *  analyze retry loops only see a failure's message text, so the header's
 *  ask has to travel inside that text; the format is ours, not the SDK's,
 *  for the version-drift reason above. */
export function appendProviderRetryAfterHint(message: string, retryAfterMs: number): string {
  const duration =
    retryAfterMs > 0 && retryAfterMs % 1000 === 0
      ? `${retryAfterMs / 1000}s`
      : `${Math.round(retryAfterMs)}ms`;
  return `${message} (${RETRY_AFTER_HINT_LABEL}: ${duration})`;
}

export function parseProviderRetryAfterHint(failure: string): number | undefined {
  const match = RETRY_AFTER_HINT_PATTERN.exec(failure);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return match[2] === 'ms' ? value : value * 1000;
}

/** Sleep before the next attempt when the failure was a provider rate
 *  limit, scaling with the attempt number, and never shorter than any
 *  Retry-After the provider itself asked for. Non-rate-limit failures
 *  return immediately, keeping guard rejections as fast as before. The
 *  sleep is injectable for tests. */
export async function paceRateLimitedRetry(
  attempt: number,
  failure: string,
  sleepFn: (ms: number) => Promise<void> = sleep,
): Promise<void> {
  if (!isRateLimitFailure(failure)) return;
  const retryAfterMs = parseProviderRetryAfterHint(failure) ?? 0;
  const delayMs = Math.max(RATE_LIMIT_BASE_DELAY_MS * attempt, retryAfterMs);
  console.warn(
    `odysseus analyze: provider rate limit hit; waiting ${Math.round(delayMs / 1000)}s before retry ${attempt}`,
  );
  await sleepFn(delayMs);
}

/** Fixed pause between the French and English analysis passes of one
 *  audit (run-full-audit-job.ts and regenerate-writing.ts are the two
 *  fr-then-en call sites). The first pass is what drains the quota window
 *  the second then enters - the exact shape of the issue #30 failure.
 *  Unconditional, because no caller state tracks whether either pass hit
 *  a 429, and the cost is bounded at 20s. Injectable sleep for tests. */
export async function pauseBetweenLanguagePasses(
  sleepFn: (ms: number) => Promise<void> = sleep,
): Promise<void> {
  console.warn(
    `odysseus analyze: pausing ${LANGUAGE_PASS_PAUSE_MS / 1000}s between the French and English passes to stay inside the provider's rate window`,
  );
  await sleepFn(LANGUAGE_PASS_PAUSE_MS);
}
