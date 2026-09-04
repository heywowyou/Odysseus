/**
 * Reads one artifact file local-first, falling back to the bucket only on a
 * local miss, issue #63. This is the one place that fallback logic exists;
 * every caller (the dashboard's report routes, `normalize`) goes through
 * it instead of a bare `fs.readFile`.
 *
 * Callers pass an already-built local path and bucket key - this function
 * does not assemble either, since existing call sites already have their
 * own path-join conventions (`buildAuditDir` plus a relative path) and
 * duplicating that here would be a second place to get it wrong.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ArtifactStore } from './artifact-store.js';

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

/**
 * Local read first. On any error other than "file does not exist" (a
 * permissions problem, a disk error), the error is rethrown rather than
 * masked as a bucket fallback - only a genuine local miss is what the
 * bucket exists to cover. On a local miss with no store configured (the
 * bucket is not provisioned, or credentials are unset - see
 * createConfiguredArtifactStore), the original ENOENT is rethrown so
 * callers see the same "not found on disk" outcome they always have.
 *
 * On a bucket hit, the bytes are written back to `localPath` as a cache so
 * the next read on this machine is local again; a failed cache write is
 * logged, never thrown, since a served-but-uncached read is still a
 * correct answer to the caller. On a bucket miss, throws a clear
 * not-found error naming both locations that were tried.
 */
export async function resolveArtifactFile(
  localPath: string,
  bucketKey: string,
  store: ArtifactStore | undefined,
): Promise<Buffer> {
  try {
    return await fs.readFile(localPath);
  } catch (error) {
    if (!isEnoent(error)) throw error;
    if (!store) throw error;

    const fromBucket = await store.get(bucketKey);
    if (fromBucket === null) {
      throw new Error(
        `artifact not found locally at "${localPath}" or in the bucket at key "${bucketKey}"`,
        { cause: error },
      );
    }

    try {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, fromBucket);
    } catch (cacheError) {
      console.error(
        `warning: fetched "${bucketKey}" from the artifact bucket but failed to cache it at ` +
          `"${localPath}": ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`,
      );
    }

    return fromBucket;
  }
}
