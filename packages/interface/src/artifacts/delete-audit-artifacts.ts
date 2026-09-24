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
  /** Names the audit's private report-quality candidates, which live under
   *  their own bucket prefix. `null` only for a bucket prefix that no stored
   *  audit owns (an orphan), which never had a quality run. */
  auditId: string | null;
}

/** Where `putPrivateCandidatePdf` stores one audit's quality-run candidates. */
export function reportQualityCandidatesPrefix(auditId: string): string {
  return `report-quality/candidates/${encodeURIComponent(auditId)}/`;
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
  const prefixes = [
    buildAuditArtifactBucketPrefix(hostname, audit.startedAt),
    ...(audit.auditId !== null ? [reportQualityCandidatesPrefix(audit.auditId)] : []),
  ];
  try {
    let remoteObjectsDeleted = 0;
    for (const prefix of prefixes) {
      remoteObjectsDeleted += await deletePrefix(options.store, prefix);
    }
    return { remoteObjectsDeleted };
  } catch (error) {
    throw new AuditArtifactDeletionError('remote', { cause: error });
  }
}

/** Deletes every object under `prefix` and returns how many there were. */
export async function deletePrefix(store: ArtifactStore, prefix: string): Promise<number> {
  const keys = (await store.list(prefix)).filter(
    // Defence in depth: never delete a key the listing should not have
    // returned for this prefix.
    (key) => key.startsWith(prefix),
  );
  for (const key of keys) await store.delete(key);
  const remaining = (await store.list(prefix)).length;
  if (remaining > 0) throw new Error(`${remaining} objects remain after deletion`);
  return keys.length;
}
