import type { Connection } from 'mongoose';
import { getSeverityRollups, type SeverityRollup } from '@odysseus/store';

/** Staleness contract: these rollups back the 5-second dashboard poll only.
 *  They can change only when findings are re-persisted by a pipeline run,
 *  and the audit detail route (GET /api/audits/:auditId, via
 *  getSeverityRollup) always computes fresh numbers, so a cached headline
 *  here is safe. Entries are also dropped wholesale whenever the poll's
 *  auditId set changes, so a newly linked or deleted audit is never shown
 *  from a stale key set. */
export const DEFAULT_ROLLUP_CACHE_TTL_MS = 30_000;

export interface SeverityRollupCacheOptions {
  ttlMs?: number;
  now?: () => number;
}

interface RollupCacheEntry {
  rollup: SeverityRollup;
  cachedAtMs: number;
}

const cache = new Map<string, RollupCacheEntry>();
let cachedAuditIdKey = '';

function presenceKey(auditIds: readonly string[]): string {
  return [...new Set(auditIds)].sort().join('\n');
}

export async function getSeverityRollupsForPoll(
  connection: Connection,
  auditIds: readonly string[],
  options: SeverityRollupCacheOptions = {},
): Promise<Map<string, SeverityRollup>> {
  const ttlMs = options.ttlMs ?? DEFAULT_ROLLUP_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  const key = presenceKey(auditIds);
  if (key !== cachedAuditIdKey) {
    cache.clear();
    cachedAuditIdKey = key;
  }
  const result = new Map<string, SeverityRollup>();
  const staleIds: string[] = [];
  for (const auditId of new Set(auditIds)) {
    const entry = cache.get(auditId);
    if (entry && now() - entry.cachedAtMs < ttlMs) {
      result.set(auditId, entry.rollup);
    } else {
      staleIds.push(auditId);
    }
  }
  if (staleIds.length > 0) {
    const fresh = await getSeverityRollups(connection, staleIds);
    const atMs = now();
    for (const [auditId, rollup] of fresh) {
      cache.set(auditId, { rollup, cachedAtMs: atMs });
      result.set(auditId, rollup);
    }
  }
  return result;
}

/** Test isolation only: the cache is module-level by design so the poll
 *  shares one window across requests. */
export function resetSeverityRollupCacheForTests(): void {
  cache.clear();
  cachedAuditIdKey = '';
}
