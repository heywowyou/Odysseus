import type { Connection } from 'mongoose';
import { primarySeverityRollup } from '@odysseus/report';
import {
  getStoredPrimarySeverityRollups,
  loadSeverityPopulationInputs,
  storePrimarySeverityRollup,
  type SeverityRollup,
} from '@odysseus/store';

/** Staleness contract: these rollups back the 5-second dashboard poll only.
 *  They can change only when findings are re-persisted by a pipeline run,
 *  and the audit detail route (GET /api/audits/:auditId) always computes
 *  fresh numbers, so a cached headline here is safe. Entries are also
 *  dropped wholesale whenever the poll's auditId set changes, so a newly
 *  linked or deleted audit is never shown from a stale key set. */
const DEFAULT_ROLLUP_CACHE_TTL_MS = 30_000;

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
    const fresh = await loadPrimarySeverityRollups(connection, staleIds);
    const atMs = now();
    for (const [auditId, rollup] of fresh) {
      cache.set(auditId, { rollup, cachedAtMs: atMs });
      result.set(auditId, rollup);
    }
  }
  return result;
}

/**
 * Issue #508: the list shows the report's primary population, the counts the
 * audit page shows, never a raw count of every finding. persistAudit stores
 * them with the findings; an audit persisted before that is computed once
 * from its projected findings and stored for the next poll.
 */
async function loadPrimarySeverityRollups(
  connection: Connection,
  auditIds: readonly string[],
): Promise<Map<string, SeverityRollup>> {
  const rollups = await getStoredPrimarySeverityRollups(connection, auditIds);
  const missing = auditIds.filter((auditId) => !rollups.has(auditId));
  for (const input of await loadSeverityPopulationInputs(connection, missing)) {
    const rollup = primarySeverityRollup({ pages: input.pages }, input.findings);
    rollups.set(input.auditId, rollup);
    if (input.findingsDigest !== undefined) {
      await storePrimarySeverityRollup(connection, input.auditId, input.findingsDigest, rollup);
    }
  }
  return rollups;
}

/** Test isolation only: the cache is module-level by design so the poll
 *  shares one window across requests. */
export function resetSeverityRollupCacheForTests(): void {
  cache.clear();
  cachedAuditIdKey = '';
}
