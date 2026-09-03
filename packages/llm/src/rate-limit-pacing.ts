import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Provider rate-limit pacing for the analysis passes' API-error retries.
 * The retry budgets and guards are unchanged (docs/rules/llm-layer-rules.md
 * section 2): this only stops the loop from burning every attempt inside
 * one throttling window - measured live during plan 019's operator review,
 * where a French pass succeeded and the English pass then 429ed on all
 * three immediate attempts.
 */

const RATE_LIMIT_BASE_DELAY_MS = 20_000;

export function isRateLimitFailure(message: string): boolean {
  return /429|rate.?limit/i.test(message);
}

/** Sleep before the next attempt when the failure was a provider rate
 *  limit, scaling with the attempt number. Non-rate-limit failures return
 *  immediately, keeping guard rejections as fast as before. The sleep is
 *  injectable for tests. */
export async function paceRateLimitedRetry(
  attempt: number,
  failure: string,
  sleepFn: (ms: number) => Promise<void> = sleep,
): Promise<void> {
  if (!isRateLimitFailure(failure)) return;
  const delayMs = RATE_LIMIT_BASE_DELAY_MS * attempt;
  console.warn(
    `odysseus analyze: provider rate limit hit; waiting ${Math.round(delayMs / 1000)}s before retry ${attempt}`,
  );
  await sleepFn(delayMs);
}
