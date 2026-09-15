/**
 * The public half of the opt-out drop box.
 *
 * Deliberate copy of the key derivation and object shapes in
 * `packages/interface/src/outreach/opt-out-bucket.ts`, for the same reason
 * `preview-object.ts` copies the preview token code: the site must not import
 * a private package. Both copies are asserted against
 * `fixtures/outreach-preview-keys.json`.
 *
 * The site does two things here and nothing else: read the address a link
 * token points at (to prefill the form), and drop a request object. It never
 * lists, deletes or reads requests; the private server does that.
 */

import { randomUUID } from 'node:crypto';
import { AwsClient } from 'aws4fetch';
import { hashPreviewToken, isValidPreviewToken } from './preview-object';

const OPT_OUT_LINK_PREFIX = 'opt-out-links/';
const OPT_OUT_REQUEST_PREFIX = 'opt-out-requests/';

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u;

export function isPlausibleEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

export function optOutLinkKeyForToken(token: string): string | null {
  if (!isValidPreviewToken(token)) return null;
  return `${OPT_OUT_LINK_PREFIX}${hashPreviewToken(token)}.json`;
}

function optOutRequestKey(now: Date): string {
  return `${OPT_OUT_REQUEST_PREFIX}${now.getTime()}-${randomUUID()}.json`;
}

export interface OptOutStore {
  /** The address behind a link token, or null for anything unknown,
   *  malformed or expired. */
  addressForToken(token: string): Promise<string | null>;
  submit(request: { address: string; token?: string }): Promise<void>;
}

export interface OptOutStoreConfig {
  bucket: string;
  endpoint: string;
  region: string;
  readAccessKeyId: string;
  readSecretAccessKey: string;
  writeAccessKeyId: string;
  writeSecretAccessKey: string;
  fetchImpl?: typeof globalThis.fetch;
  now?: () => Date;
}

export function createOptOutStore(config: OptOutStoreConfig): OptOutStore {
  const reader = new AwsClient({
    accessKeyId: config.readAccessKeyId,
    secretAccessKey: config.readSecretAccessKey,
    service: 's3',
    region: config.region,
  });
  const writer = new AwsClient({
    accessKeyId: config.writeAccessKeyId,
    secretAccessKey: config.writeSecretAccessKey,
    service: 's3',
    region: config.region,
  });
  const doFetch = config.fetchImpl ?? globalThis.fetch;
  const now = config.now ?? (() => new Date());
  const endpoint = new URL(config.endpoint);
  const objectUrl = (key: string): string =>
    `${endpoint.protocol}//${config.bucket}.${endpoint.host}/${key
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;

  return {
    async addressForToken(token) {
      const key = optOutLinkKeyForToken(token);
      if (key === null) return null;
      try {
        const response = await doFetch(await reader.sign(objectUrl(key), { method: 'GET' }));
        if (!response.ok) return null;
        const value = (await response.json()) as { address?: unknown; expiresAt?: unknown };
        if (typeof value.address !== 'string' || typeof value.expiresAt !== 'string') return null;
        if (new Date(value.expiresAt).getTime() <= now().getTime()) return null;
        return value.address;
      } catch {
        // Prefill is a convenience: the visitor can always type the address.
        return null;
      }
    },

    async submit(request) {
      const body = {
        address: request.address,
        ...(request.token !== undefined && isValidPreviewToken(request.token)
          ? { token: request.token }
          : {}),
        receivedAt: now().toISOString(),
      };
      const signed = await writer.sign(objectUrl(optOutRequestKey(now())), {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      });
      const response = await doFetch(signed);
      if (!response.ok) {
        throw new Error(`opt-out request write failed with status ${response.status}`);
      }
    },
  };
}

/** Read access reuses the preview reader's key. Writes use a separate key
 *  meant to be scoped to `opt-out-requests/` only. */
export function optOutStoreFromEnvironment(): OptOutStore {
  const required = (name: string): string => {
    const value = process.env[name];
    if (value === undefined || value === '') throw new Error(`${name} is not set`);
    return value;
  };
  return createOptOutStore({
    bucket: required('PREVIEW_BUCKET_NAME'),
    endpoint: process.env['PREVIEW_BUCKET_ENDPOINT'] ?? 'https://s3.fr-par.scw.cloud',
    region: process.env['PREVIEW_BUCKET_REGION'] ?? 'fr-par',
    readAccessKeyId: required('PREVIEW_BUCKET_ACCESS_KEY_ID'),
    readSecretAccessKey: required('PREVIEW_BUCKET_SECRET_KEY'),
    writeAccessKeyId: required('OPT_OUT_BUCKET_ACCESS_KEY_ID'),
    writeSecretAccessKey: required('OPT_OUT_BUCKET_SECRET_KEY'),
  });
}
