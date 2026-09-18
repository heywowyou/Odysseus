/**
 * The one place a full audit is allowed to start an HTTP request against the
 * audited host (plan 059 section 8, decision 18).
 *
 * The politeness problem this solves is not "is there a delay somewhere". The
 * crawl loop already sleeps between pages. It is that plan 059 adds whole new
 * categories of request - mobile surfaces, hydration sweeps, isolated retries,
 * diagnostic reruns, site-level probes - and each one implemented with its own
 * `setTimeout` is a separate request lane the site experiences simultaneously.
 * Three lanes each politely waiting a second is three requests a second.
 *
 * So spacing here is global: whatever the concurrency, request *starts* are
 * separated by the effective delay. Concurrency still buys what it should -
 * render, axe and Lighthouse work on several pages overlapping - it just stops
 * buying extra request pressure. Wiring the existing crawl loop through this is
 * Phase B; a crawl at concurrency 3 will get slower when that happens, and that
 * is the intended direction, since plan 059 states cost is not the objective.
 *
 * Pressure moves one way. `raiseDelayTo` and `noteRateLimited` can slow the
 * scheduler down; nothing speeds it back up, and concurrency only ever falls.
 * Section 22 lists retrying a rate limit with more concurrency among the
 * rejected alternatives, and the simplest way to honour that is to make the
 * increase unrepresentable rather than merely discouraged.
 */

export interface HostRequestSchedulerOptions {
  /** The configured and robots-derived floor. The scheduler never waits less
   *  than this between request starts, whatever else happens. */
  floorDelayMs: number;
  /** Lanes of overlapping work. Never exceeded, and reduced under pressure. */
  maxConcurrency: number;
  /** Multiplier applied on each rate-limit signal. */
  rateLimitBackoffFactor?: number;
  /** Upper bound on backoff, so a misbehaving site cannot stall the run
   *  forever without the caller noticing it has stopped making progress. */
  maxDelayMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_BACKOFF_FACTOR = 2;
const DEFAULT_MAX_DELAY_MS = 60_000;

export class HostRequestScheduler {
  readonly #floorDelayMs: number;
  readonly #maxDelayMs: number;
  readonly #backoffFactor: number;
  readonly #now: () => number;
  readonly #sleep: (ms: number) => Promise<void>;

  #delayMs: number;
  #concurrency: number;
  #active = 0;
  #waiting: (() => void)[] = [];
  /** Earliest wall-clock time the next request may start. */
  #nextStartAt = 0;

  constructor(options: HostRequestSchedulerOptions) {
    this.#floorDelayMs = Math.max(0, options.floorDelayMs);
    this.#delayMs = this.#floorDelayMs;
    this.#maxDelayMs = Math.max(this.#floorDelayMs, options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);
    this.#backoffFactor = options.rateLimitBackoffFactor ?? DEFAULT_BACKOFF_FACTOR;
    this.#concurrency = Math.max(1, options.maxConcurrency);
    this.#now = options.now ?? (() => Date.now());
    this.#sleep =
      options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  }

  get effectiveDelayMs(): number {
    return this.#delayMs;
  }

  get concurrency(): number {
    return this.#concurrency;
  }

  /**
   * Raises the delay, typically because a robots revalidation asked for more.
   * A request to lower it is ignored rather than rejected: callers recompute
   * the epoch's effective delay from the whole policy chain and hand it over,
   * and that value legitimately stays the same most of the time.
   */
  raiseDelayTo(delayMs: number): void {
    this.#delayMs = Math.min(this.#maxDelayMs, Math.max(this.#delayMs, delayMs));
  }

  /**
   * Records that the host pushed back - a 429, a 503 with Retry-After, an
   * anti-bot interstitial. Backs off and sheds a lane. Never the reverse.
   */
  noteRateLimited(): void {
    this.#delayMs = Math.min(
      this.#maxDelayMs,
      Math.max(this.#floorDelayMs, Math.ceil(this.#delayMs * this.#backoffFactor)),
    );
    this.#concurrency = Math.max(1, Math.floor(this.#concurrency / 2));
  }

  /**
   * Runs one request-making operation in its turn.
   *
   * The spacing is applied after a lane is acquired and before `run` starts,
   * and `#nextStartAt` advances at that moment, so two lanes cannot both
   * observe the same free slot and fire together.
   */
  async schedule<T>(run: () => Promise<T>): Promise<T> {
    await this.#acquireLane();
    try {
      await this.pace();
      return await run();
    } finally {
      this.#releaseLane();
    }
  }

  /**
   * Waits for the next request slot without taking a lane.
   *
   * This exists because `schedule` holds a lane for the whole of a page's work,
   * which is what lets a rate-limit response shed a lane, but a page's work is
   * not one request. The rendered pass navigates a second time, Lighthouse
   * navigates again, and a nested `schedule` from inside a held lane deadlocks
   * as soon as every lane is held by a caller waiting for a lane. Separating
   * the spacing from the lane makes those inner navigations pace correctly
   * against every other request in the run rather than against nothing.
   *
   * The distinction is worth stating plainly, because getting it wrong is how
   * the ceiling silently stops meaning anything: `schedule` answers "may this
   * unit of work begin", and `pace` answers "may this request leave now".
   * Anything that touches the audited host over the network calls one of them.
   */
  async pace(): Promise<void> {
    const waitMs = this.#nextStartAt - this.#now();
    if (waitMs > 0) await this.#sleep(waitMs);
    this.#nextStartAt = Math.max(this.#now(), this.#nextStartAt) + this.#delayMs;
  }

  async #acquireLane(): Promise<void> {
    if (this.#active < this.#concurrency) {
      this.#active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.#waiting.push(resolve));
    this.#active += 1;
  }

  #releaseLane(): void {
    this.#active -= 1;
    // Concurrency can have fallen since this lane was taken, so only wake a
    // waiter when there is genuinely room under the current limit.
    if (this.#active < this.#concurrency) {
      this.#waiting.shift()?.();
    }
  }
}
