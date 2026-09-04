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

import { AwsClient } from 'aws4fetch';
import type { ArtifactStore } from './artifact-store.js';

export interface ScalewayArtifactStoreOptions {
  bucket: string;
  /** Region endpoint origin, e.g. `https://s3.fr-par.scw.cloud`. The bucket is
   *  addressed virtual-host style beneath it. */
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Injected so the adapter is testable without credentials or a network.
   *  Defaults to the runtime's own `fetch`. */
  fetchImpl?: typeof globalThis.fetch;
}

export function createScalewayArtifactStore(options: ScalewayArtifactStoreOptions): ArtifactStore {
  const client = new AwsClient({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    service: 's3',
    region: options.region,
  });
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  const endpoint = new URL(options.endpoint);
  const origin = `${endpoint.protocol}//${options.bucket}.${endpoint.host}`;

  function objectUrl(key: string): string {
    // Each path segment encoded separately: the key's own `/` is a
    // delimiter, not data, and must survive as one.
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    return `${origin}/${encoded}`;
  }

  async function send(url: string, init: RequestInit): Promise<Response> {
    const signed = await client.sign(url, init);
    return doFetch(signed);
  }

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
