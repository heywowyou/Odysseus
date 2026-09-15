/**
 * The one place provider configuration meets the provider adapter, milestone 9c
 * plan 009. Callers ask for a publisher and get one; they never see a bucket
 * name, an endpoint or a key, which is what the port's docblock means by the
 * seam being real rather than decorative.
 */

import {
  getPreviewBucketAccessKeyId,
  getPreviewBucketEndpoint,
  getPreviewBucketName,
  getPreviewBucketRegion,
  getPreviewBucketSecretKey,
} from '../config.js';
import type { PreviewPublisher } from './preview-publisher.js';
import { createScalewayOptOutBucket, type OptOutBucket } from './opt-out-bucket.js';
import { createScalewayPreviewPublisher } from './scaleway-preview-publisher.js';

export function createConfiguredPreviewPublisher(): PreviewPublisher {
  return createScalewayPreviewPublisher({
    bucket: getPreviewBucketName(),
    endpoint: getPreviewBucketEndpoint(),
    region: getPreviewBucketRegion(),
    accessKeyId: getPreviewBucketAccessKeyId(),
    secretAccessKey: getPreviewBucketSecretKey(),
  });
}

/** The opt-out drop box lives in the same private bucket as previews. */
export function createConfiguredOptOutBucket(): OptOutBucket {
  return createScalewayOptOutBucket({
    bucket: getPreviewBucketName(),
    endpoint: getPreviewBucketEndpoint(),
    region: getPreviewBucketRegion(),
    accessKeyId: getPreviewBucketAccessKeyId(),
    secretAccessKey: getPreviewBucketSecretKey(),
  });
}
