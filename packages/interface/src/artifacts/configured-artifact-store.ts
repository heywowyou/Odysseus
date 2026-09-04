/**
 * The one place artifact-bucket configuration meets the store adapter,
 * issue #63. Mirrors configured-preview-publisher.ts's own seam.
 *
 * Returns `undefined` when the bucket is not configured, rather than
 * throwing: the real bucket is not provisioned as of this issue (see the
 * plan's "not in scope" list), and every existing deployment and every
 * developer machine must keep working exactly as before with no bucket
 * credentials set at all. Once `ODYSSEUS_ARTIFACTS_BUCKET_*` is set,
 * callers get a real store and sync/fallback are live; until then, upload
 * hooks skip and reads fall back to "not found" exactly as they did before
 * this issue, per resolveArtifactFile's own doc comment.
 */

import {
  getArtifactsBucketAccessKeyId,
  getArtifactsBucketEndpoint,
  getArtifactsBucketName,
  getArtifactsBucketRegion,
  getArtifactsBucketSecretAccessKey,
  isArtifactsBucketConfigured,
} from '../config.js';
import type { ArtifactStore } from './artifact-store.js';
import { createScalewayArtifactStore } from './scaleway-artifact-store.js';

export function createConfiguredArtifactStore(): ArtifactStore | undefined {
  if (!isArtifactsBucketConfigured()) return undefined;
  return createScalewayArtifactStore({
    bucket: getArtifactsBucketName(),
    endpoint: getArtifactsBucketEndpoint(),
    region: getArtifactsBucketRegion(),
    accessKeyId: getArtifactsBucketAccessKeyId(),
    secretAccessKey: getArtifactsBucketSecretAccessKey(),
  });
}
