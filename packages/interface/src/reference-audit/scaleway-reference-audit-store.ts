import { AwsClient } from 'aws4fetch';
import type { ReferenceAuditObjectStore } from './reference-audit-publication.js';

export interface ScalewayReferenceAuditStoreOptions {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fetchImpl?: typeof globalThis.fetch;
}

/** S3-compatible storage adapter. The credentials used by the publisher are
 * private; the public site has a separate read/write-restricted deployment
 * credential and never imports this module. */
export function createScalewayReferenceAuditStore(
  options: ScalewayReferenceAuditStoreOptions,
): ReferenceAuditObjectStore {
  const client = new AwsClient({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    service: 's3',
    region: options.region,
  });
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  const endpoint = new URL(options.endpoint);
  const origin = `${endpoint.protocol}//${options.bucket}.${endpoint.host}`;
  const objectUrl = (key: string): string =>
    `${origin}/${key.split('/').map(encodeURIComponent).join('/')}`;

  return {
    async putObject({ key, body, contentType }) {
      const response = await doFetch(
        await client.sign(objectUrl(key), {
          method: 'PUT',
          body,
          headers: { 'content-type': contentType },
        }),
      );
      if (!response.ok) {
        throw new Error(`reference audit object write failed with status ${response.status}`);
      }
    },
    async readObject(key) {
      const response = await doFetch(await client.sign(objectUrl(key), { method: 'GET' }));
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok) {
        throw new Error(`reference audit object read failed with status ${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
