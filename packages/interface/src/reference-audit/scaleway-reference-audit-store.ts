import { createS3Bucket, type S3BucketOptions } from '../s3-bucket.js';
import type { ReferenceAuditObjectStore } from './reference-audit-publication.js';

export type ScalewayReferenceAuditStoreOptions = S3BucketOptions;

/** S3-compatible storage adapter. The credentials used by the publisher are
 * private; the public site has a separate read/write-restricted deployment
 * credential and never imports this module. */
export function createScalewayReferenceAuditStore(
  options: ScalewayReferenceAuditStoreOptions,
): ReferenceAuditObjectStore {
  const { objectUrl, send } = createS3Bucket(options);

  return {
    async putObject({ key, body, contentType }) {
      const response = await send(objectUrl(key), {
        method: 'PUT',
        body,
        headers: { 'content-type': contentType },
      });
      if (!response.ok) {
        throw new Error(`reference audit object write failed with status ${response.status}`);
      }
    },
    async readObject(key) {
      const response = await send(objectUrl(key), { method: 'GET' });
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok) {
        throw new Error(`reference audit object read failed with status ${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
