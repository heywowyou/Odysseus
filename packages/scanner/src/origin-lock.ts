/**
 * In-memory per-origin mutex: at most one job may be actively crawling or
 * scanning a given origin at a time. Deliberately a mutex, not a token
 * bucket - crawlSite's own effectiveDelayMs sleep already paces requests
 * within a single crawl (see crawl.ts). What's missing without this is
 * coordination *across* separate crawlSite/scanSite calls (two queued
 * jobs, or the same site queued twice), which today have nothing
 * preventing them from hitting the same origin concurrently. A mutex
 * makes that impossible by construction, which is all the engineering
 * constraint about per-origin rate limiting actually requires at this
 * volume - no shared token-bucket needed.
 *
 * Standard promise-chaining mutex, one chain per origin. Map entries are
 * never explicitly evicted; at the volume this tool runs at (a handful of
 * distinct origins scanned per day) that's a negligible amount of memory
 * to trade for not writing eviction logic nothing needs.
 */

export class OriginLock {
  private readonly tails = new Map<string, Promise<unknown>>();

  /** Resolves once every earlier acquire() for this origin has released.
   *  Returns the release function the caller must call exactly once. */
  async acquire(origin: string): Promise<() => void> {
    const previousTail = this.tails.get(origin) ?? Promise.resolve();

    let unlock!: () => void;
    const willLock = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const willUnlock = previousTail.then(() => unlock);

    this.tails.set(
      origin,
      previousTail.then(() => willLock),
    );

    return willUnlock;
  }
}
