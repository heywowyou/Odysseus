/**
 * Scaleway Object Storage `PreviewPublisher`, milestone 9c plan 009.
 *
 * Scaleway `fr-par` was chosen over Cloudflare R2 and Vercel Blob because this
 * bucket becomes a named recipient on the prospecting privacy page, and a
 * French host in a French region is the shortest truthful sentence to write
 * there. Nothing in this file is Scaleway-specific beyond the endpoint it is
 * pointed at: the API is plain S3, so moving to another S3-compatible provider
 * is a configuration change, which is the second reason the choice was made
 * that way.
 *
 * Signing goes through `aws4fetch`'s `sign()` rather than its `fetch()`, so the
 * transport stays injectable. That is not a testing convenience bolted on: it
 * is what lets the contract tests exercise this adapter - the signed request
 * shape, the key, the metadata round-trip - with no account, no credentials and
 * no network, which is the whole reason the production adapter could be written
 * and verified before anything was provisioned.
 *
 * The bucket is private. There is no public-read path, no pre-signed URL and no
 * listing: a pre-signed URL cannot span the 30-day public lifetime a preview
 * needs (SigV4 query signatures cap out well below it), so the public site
 * signs its own read on each visit instead.
 */

import { createS3Bucket, type S3BucketOptions } from '../s3-bucket.js';
import {
  PREVIEW_CONTENT_TYPE,
  PREVIEW_EXPIRY_METADATA_HEADER,
  type PreviewObject,
  type PreviewPublisher,
  type PutPreviewObjectInput,
} from './preview-publisher.js';

export type ScalewayPreviewPublisherOptions = S3BucketOptions;

export function createScalewayPreviewPublisher(
  options: ScalewayPreviewPublisherOptions,
): PreviewPublisher {
  const { objectUrl, send } = createS3Bucket(options);

  return {
    async put(input: PutPreviewObjectInput): Promise<void> {
      const response = await send(objectUrl(input.objectKey), {
        method: 'PUT',
        body: input.html,
        headers: {
          'content-type': PREVIEW_CONTENT_TYPE,
          [PREVIEW_EXPIRY_METADATA_HEADER]: input.publicExpiresAt.toISOString(),
        },
      });
      if (!response.ok) {
        // The key, never the body: an error string that quoted the document
        // would put a hotel's evidence in a log line.
        throw new Error(`preview object write failed with status ${response.status}`);
      }
    },

    async get(objectKey: string): Promise<PreviewObject | null> {
      const response = await send(objectUrl(objectKey), { method: 'GET' });
      // 403 as well as 404: a private bucket answers "no such key" with either,
      // depending on whether the caller may list it, and both mean the same
      // thing to us.
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok) {
        throw new Error(`preview object read failed with status ${response.status}`);
      }
      const rawExpiry = response.headers.get(PREVIEW_EXPIRY_METADATA_HEADER);
      if (rawExpiry === null) {
        throw new Error('preview object is missing its public expiry metadata');
      }
      const publicExpiresAt = new Date(rawExpiry);
      if (Number.isNaN(publicExpiresAt.getTime())) {
        throw new Error('preview object public expiry metadata is not a date');
      }
      return { html: await response.text(), publicExpiresAt };
    },

    async delete(objectKey: string): Promise<void> {
      const response = await send(objectUrl(objectKey), { method: 'DELETE' });
      // 204 is the success; 404 means a lifecycle rule or an earlier revoke
      // already did it, which is the same outcome and must not throw.
      if (!response.ok && response.status !== 404) {
        throw new Error(`preview object delete failed with status ${response.status}`);
      }
    },
  };
}
