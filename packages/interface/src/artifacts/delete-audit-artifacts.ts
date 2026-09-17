/**
 * Issue #384: removing one audit's stored evidence everywhere it lives -
 * the local artifacts directory and, when the bucket is configured, every
 * object under that audit's own bucket prefix.
 *
 * Callers run this BEFORE the database cascade. A storage failure then
 * leaves the audit rows in place, so the deletion stays visible and can be
 * retried; the reverse order would drop the only record naming the orphaned
 * objects. Both halves are idempotent (a missing directory or object counts
 * as removed), so a retry after a partial failure completes cleanly.
 */

import fs from 'node:fs/promises';
import { buildAuditArtifactBucketPrefix, buildAuditDir } from '@odysseus/scanner';
import type { ArtifactStore } from './artifact-store.js';

export interface AuditArtifactLocation {
  siteUrl: string;
  startedAt: Date;
}

export interface AuditArtifactDeletion {
  /** Objects removed from the bucket; `null` when no bucket is configured,
   *  so nothing was ever uploaded there to remove. */
  remoteObjectsDeleted: number | null;
}

/** Thrown when either storage half could not be confirmed removed. The
 *  message names the half only: never a key, a bucket name or provider
 *  detail. */
export class AuditArtifactDeletionError extends Error {
  constructor(
    readonly half: 'local' | 'remote',
    options?: { cause?: unknown },
  ) {
    super(`audit artifacts could not be removed from ${half} storage`, options);
    this.name = 'AuditArtifactDeletionError';
  }
}

export async function deleteAuditArtifacts(
  audit: AuditArtifactLocation,
  options: { artifactsRoot: string; store: ArtifactStore | undefined },
): Promise<AuditArtifactDeletion> {
  const hostname = new URL(audit.siteUrl).hostname;
  try {
    // force: artifacts may already be gone (retention sweep, a previous
    // partial deletion, or audits that never left an older machine).
    await fs.rm(buildAuditDir(options.artifactsRoot, hostname, audit.startedAt), {
      recursive: true,
      force: true,
    });
  } catch (error) {
    throw new AuditArtifactDeletionError('local', { cause: error });
  }

  if (options.store === undefined) return { remoteObjectsDeleted: null };
  const prefix = buildAuditArtifactBucketPrefix(hostname, audit.startedAt);
  try {
    const keys = await options.store.list(prefix);
    for (const key of keys) {
      // Defence in depth: never delete a key the listing should not have
      // returned for this prefix.
      if (!key.startsWith(prefix)) continue;
      await options.store.delete(key);
    }
    const remaining = (await options.store.list(prefix)).length;
    if (remaining > 0) throw new Error(`${remaining} objects remain after deletion`);
    return { remoteObjectsDeleted: keys.filter((key) => key.startsWith(prefix)).length };
  } catch (error) {
    throw new AuditArtifactDeletionError('remote', { cause: error });
  }
}
