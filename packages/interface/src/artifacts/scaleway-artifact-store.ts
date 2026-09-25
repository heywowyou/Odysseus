/**
 * Scaleway Object Storage `ArtifactStore`, issue #63.
 *
 * A new, dedicated bucket, not the existing `odysseus-previews` one: a
 * preview is a 30-day-expiring public document with no operator value once
 * it lapses, while an audit artifact is the operator's own durable
 * evidence, kept indefinitely and never served publicly. Sharing one bucket
 * would mean either policy leaking onto the other's objects.
 *
 * Same signing approach as `scaleway-preview-publisher.ts` (`aws4fetch`'s
 * `sign()`, an injectable `fetchImpl`, a private bucket answering absence
 * with 403 or 404 depending on list permission), because both are plain S3
 * against the same provider - only the object shape and the bucket differ.
 */

import { createS3Bucket, type S3BucketOptions } from '../s3-bucket.js';
import type { ArtifactStore } from './artifact-store.js';

export type ScalewayArtifactStoreOptions = S3BucketOptions;

/** An artifact can be a multi-megabyte scan or report file; the shared
 *  30-second deadline is for small objects. */
const ARTIFACT_TIMEOUT_MS = 5 * 60_000;

export function createScalewayArtifactStore(options: ScalewayArtifactStoreOptions): ArtifactStore {
  const bucket = createS3Bucket({ timeoutMs: ARTIFACT_TIMEOUT_MS, ...options });
  const { objectUrl, send } = bucket;

  return {
    async get(key: string): Promise<Buffer | null> {
      const response = await send(objectUrl(key), { method: 'GET' });
      // 403 as well as 404: a private bucket answers "no such key" with
      // either, depending on whether the caller may list it.
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok) {
        throw new Error(`artifact object read failed with status ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    },

    list(prefix: string): Promise<string[]> {
      return bucket.listKeys(prefix, 'artifact object');
    },

    async delete(key: string): Promise<void> {
      const response = await send(objectUrl(key), { method: 'DELETE' });
      // S3 answers 204 for a deleted and for an absent key; 404 is accepted
      // too so a provider that reports absence still reads as done.
      if (response.status === 404) return;
      if (!response.ok) {
        throw new Error(`artifact object delete failed with status ${response.status}`);
      }
    },

    async put(key: string, bytes: Buffer): Promise<void> {
      const response = await send(objectUrl(key), { method: 'PUT', body: bytes });
      if (!response.ok) {
        // The key, never the bytes: an error string that quoted the body
        // would put a client's report content in a log line.
        throw new Error(`artifact object write failed with status ${response.status}`);
      }
    },
  };
}
