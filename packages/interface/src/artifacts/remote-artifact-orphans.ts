/**
 * Issue #384: bucket objects left behind by audits deleted before remote
 * deletion existed. Ownership is proven only from the audit prefix naming
 * this package itself produces (`<hostname>/<YYYY-MM-DDTHH-MM-SSZ>/...`):
 *
 * - a prefix whose hostname and timestamp match a stored audit is owned and
 *   never touched;
 * - a prefix with that exact shape and no matching audit is an orphan;
 * - any key that does not have that shape is reported as unidentified and
 *   never deleted, however old it looks;
 * - a prefix younger than `minAgeMs` is skipped, since a running audit may
 *   upload before its row is visible.
 *
 * Discovery never deletes. `odysseus artifacts orphans` prints this report
 * and deletes orphans only with an explicit `--delete`.
 */

import { buildAuditTimestampDir, parseAuditTimestampDir } from '@odysseus/scanner';
import type { ArtifactStore } from './artifact-store.js';

export interface RemoteArtifactOrphanReport {
  orphans: { prefix: string; hostname: string; startedAt: Date; objects: number }[];
  owned: number;
  tooRecent: number;
  unidentifiedKeys: string[];
}

export const DEFAULT_ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export async function findRemoteArtifactOrphans(
  store: ArtifactStore,
  audits: readonly { siteUrl: string; startedAt: Date }[],
  options: { now?: Date; minAgeMs?: number } = {},
): Promise<RemoteArtifactOrphanReport> {
  const now = options.now ?? new Date();
  const minAgeMs = options.minAgeMs ?? DEFAULT_ORPHAN_MIN_AGE_MS;
  const ownedPrefixes = new Set<string>();
  for (const audit of audits) {
    try {
      ownedPrefixes.add(
        `${new URL(audit.siteUrl).hostname}/${buildAuditTimestampDir(audit.startedAt)}/`,
      );
    } catch {
      // An audit row with an unparseable siteUrl owns nothing provable; it
      // cannot make another prefix look orphaned either.
    }
  }

  const byPrefix = new Map<string, { hostname: string; startedAt: Date; objects: number }>();
  const unidentifiedKeys: string[] = [];
  for (const key of await store.list('')) {
    const [hostname, timestampDir, ...rest] = key.split('/');
    let startedAt: Date | undefined;
    try {
      if (hostname && /[a-z0-9]/iu.test(hostname) && timestampDir && rest.length > 0) {
        startedAt = parseAuditTimestampDir(timestampDir);
      }
    } catch {
      startedAt = undefined;
    }
    if (startedAt === undefined) {
      unidentifiedKeys.push(key);
      continue;
    }
    const prefix = `${hostname}/${timestampDir}/`;
    const entry = byPrefix.get(prefix) ?? { hostname: hostname!, startedAt, objects: 0 };
    entry.objects += 1;
    byPrefix.set(prefix, entry);
  }

  const report: RemoteArtifactOrphanReport = {
    orphans: [],
    owned: 0,
    tooRecent: 0,
    unidentifiedKeys,
  };
  for (const [prefix, entry] of [...byPrefix.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (ownedPrefixes.has(prefix)) report.owned += 1;
    else if (now.getTime() - entry.startedAt.getTime() < minAgeMs) report.tooRecent += 1;
    else report.orphans.push({ prefix, ...entry });
  }
  return report;
}
