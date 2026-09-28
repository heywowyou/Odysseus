/**
 * Reading one preview object from the private bucket, milestone 9c plan 009.
 *
 * The bucket is private, so this signs its own request on every visit. A
 * pre-signed URL was the obvious alternative and does not work: a SigV4 query
 * signature cannot span the thirty days a preview is promised, so a link that
 * outlived its signature would break early and unpredictably.
 *
 * Read-only by construction. There is no put and no delete here, and the
 * credentials this runs with are scoped the same way by bucket policy
 * (GetObject on previews/*, opt-out-links/* and reference-audit/*,
 * deploy/runbook.md section 4): publication and revocation are the private
 * side's job, and the public site never needs to change what it serves.
 */

import { AwsClient } from 'aws4fetch';

export const PREVIEW_EXPIRY_METADATA_HEADER = 'x-amz-meta-public-expires-at';

export interface PreviewObject {
  html: string;
  publicExpiresAt: Date;
}

export interface PreviewReaderConfig {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fetchImpl?: typeof globalThis.fetch;
}

export interface PreviewReader {
  read(objectKey: string): Promise<PreviewObject | null>;
}

export function createPreviewReader(config: PreviewReaderConfig): PreviewReader {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: config.region,
  });
  const doFetch = config.fetchImpl ?? globalThis.fetch;
  const endpoint = new URL(config.endpoint);
  const origin = `${endpoint.protocol}//${config.bucket}.${endpoint.host}`;

  return {
    async read(objectKey: string): Promise<PreviewObject | null> {
      const encoded = objectKey.split('/').map(encodeURIComponent).join('/');
      const signed = await client.sign(`${origin}/${encoded}`, { method: 'GET' });
      const response = await doFetch(signed);

      // 403 as well as 404: a private bucket answers "no such key" with either,
      // and both mean the same thing to a visitor.
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok) {
        throw new Error(`preview object read failed with status ${response.status}`);
      }

      const rawExpiry = response.headers.get(PREVIEW_EXPIRY_METADATA_HEADER);
      if (rawExpiry === null) return null;
      const publicExpiresAt = new Date(rawExpiry);
      if (Number.isNaN(publicExpiresAt.getTime())) return null;

      return { html: await response.text(), publicExpiresAt };
    },
  };
}

/** Configuration comes from the environment at request time, never from the
 *  URL. Missing configuration throws, and the route turns that into a 500
 *  rather than a 404: an unreachable bucket is our failure, and answering "no
 *  such preview" would hide it from us and mislead the recipient. */
export function readerFromEnvironment(): PreviewReader {
  const required = (name: string): string => {
    const value = process.env[name];
    if (value === undefined || value === '') {
      throw new Error(`${name} is not set`);
    }
    return value;
  };
  return createPreviewReader({
    bucket: required('PREVIEW_BUCKET_NAME'),
    endpoint: process.env['PREVIEW_BUCKET_ENDPOINT'] ?? 'https://s3.fr-par.scw.cloud',
    region: process.env['PREVIEW_BUCKET_REGION'] ?? 'fr-par',
    accessKeyId: required('PREVIEW_BUCKET_ACCESS_KEY_ID'),
    secretAccessKey: required('PREVIEW_BUCKET_SECRET_KEY'),
  });
}
