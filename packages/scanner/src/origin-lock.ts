import { lookup } from 'node:dns/promises';

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

  /** Acquires every key, in one global order so two holders of overlapping
   *  key sets can never wait on each other. The returned function releases
   *  them all. */
  async acquireAll(keys: readonly string[]): Promise<() => void> {
    const releases: Array<() => void> = [];
    for (const key of [...new Set(keys)].sort()) {
      releases.push(await this.acquire(key));
    }
    return () => {
      for (const release of releases.reverse()) release();
    };
  }
}

export type AddressResolver = (hostname: string) => Promise<readonly string[]>;

const resolveAddresses: AddressResolver = async (hostname) =>
  (await lookup(hostname, { all: true })).map((entry) => entry.address);

/**
 * Lock keys for a long-running audit of `url`: its origin, plus one key per
 * address its host resolves to. Two sites on one shared server (haaitza.com
 * and lacoorniche.com answer from the same address) are different origins,
 * so the origin lock alone let two full audits run against that server at
 * once, doubling its load while each audit paced itself as if it were alone;
 * both then met 503s within minutes of the second one starting.
 *
 * The cost is on CDN-fronted sites, where unrelated sites can share an edge
 * address: two such audits wait for each other when they did not need to.
 * At this tool's volume that is lost time, not lost work. A host that does
 * not resolve keeps its origin key only, and the crawl reports the failure.
 */
export async function serverLockKeys(
  url: string,
  resolve: AddressResolver = resolveAddresses,
): Promise<string[]> {
  const { origin, hostname } = new URL(url);
  const addresses = await resolve(hostname).catch((): readonly string[] => []);
  return [origin, ...addresses.map((address) => `address:${address}`)];
}
