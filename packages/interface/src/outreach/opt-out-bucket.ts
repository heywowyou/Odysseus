/**
 * The opt-out drop box: the only channel from the public site into the
 * private blacklist.
 *
 * The public site cannot reach Mongo, and the private server does not listen
 * on the internet. Both can reach the preview bucket, so a one-click opt-out
 * travels through it in two small JSON objects:
 *
 * - `opt-out-links/<sha256(token)>.json` is written here when a first email is
 *   drafted. It holds the recipient address, so the public page can prefill
 *   the form from the token in the email's link. Keyed by hash, like previews,
 *   so a bucket listing never yields a working link.
 * - `opt-out-requests/<id>.json` is written by the public site when a visitor
 *   submits the form, and consumed and deleted here by the poller.
 *
 * `packages/site/lib/opt-out.ts` holds the deliberate copy of the key
 * derivation and the object shapes; both sides assert them against
 * `fixtures/outreach-preview-keys.json`.
 */

import { randomUUID } from 'node:crypto';
import { createS3Bucket, type S3BucketOptions } from '../s3-bucket.js';
import { createPreviewToken, hashPreviewToken } from './preview-token.js';

const OPT_OUT_LINK_PREFIX = 'opt-out-links/';
export const OPT_OUT_REQUEST_PREFIX = 'opt-out-requests/';

/** A link keeps prefilling for a year. Past that the page still works; the
 *  visitor types the address themselves. */
const OPT_OUT_LINK_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

interface OptOutLinkObject {
  address: string;
  expiresAt: string;
}

export interface OptOutBucket {
  putJson(key: string, value: unknown): Promise<void>;
  getJson(key: string): Promise<unknown>;
  /** Keys under a prefix, first page only; the poller runs again soon. */
  /** Keys under `prefix`, at most `maxKeys` when given. */
  list(prefix: string, maxKeys?: number): Promise<string[]>;
  /** Idempotent, like preview deletion. */
  delete(key: string): Promise<void>;
}

export function deriveOptOutLinkKey(tokenHash: string): string {
  if (!/^[0-9a-f]{64}$/u.test(tokenHash)) {
    throw new Error('opt-out token hash is malformed');
  }
  return `${OPT_OUT_LINK_PREFIX}${tokenHash}.json`;
}

function optOutUrl(publicBaseUrl: string, token?: string): string {
  const base = `${publicBaseUrl.replace(/\/+$/u, '')}/desinscription`;
  return token === undefined ? base : `${base}?t=${token}`;
}

/** The token and URL are pure; the object is written separately, and only
 *  once the draft is really going to the mailbox. */
export function createOptOutLink(publicBaseUrl: string): { token: string; url: string } {
  const token = createPreviewToken();
  return { token, url: optOutUrl(publicBaseUrl, token) };
}

export async function storeOptOutLink(
  bucket: OptOutBucket,
  token: string,
  address: string,
  now = new Date(),
): Promise<void> {
  const value: OptOutLinkObject = {
    address,
    expiresAt: new Date(now.getTime() + OPT_OUT_LINK_LIFETIME_MS).toISOString(),
  };
  await bucket.putJson(deriveOptOutLinkKey(hashPreviewToken(token)), value);
}

export type ScalewayOptOutBucketOptions = S3BucketOptions;

export function createScalewayOptOutBucket(options: ScalewayOptOutBucketOptions): OptOutBucket {
  const bucket = createS3Bucket(options);
  const { objectUrl, send } = bucket;

  return {
    async putJson(key, value) {
      const response = await send(objectUrl(key), {
        method: 'PUT',
        body: JSON.stringify(value),
        headers: { 'content-type': 'application/json' },
      });
      if (!response.ok)
        throw new Error(`opt-out object write failed with status ${response.status}`);
    },
    async getJson(key) {
      const response = await send(objectUrl(key), { method: 'GET' });
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok)
        throw new Error(`opt-out object read failed with status ${response.status}`);
      return JSON.parse(await response.text()) as unknown;
    },
    list(prefix, maxKeys) {
      return bucket.listKeys(prefix, 'opt-out', maxKeys);
    },
    async delete(key) {
      const response = await send(objectUrl(key), { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        throw new Error(`opt-out object delete failed with status ${response.status}`);
      }
    },
  };
}

export interface InMemoryOptOutBucket extends OptOutBucket {
  keys(): string[];
}

export function createInMemoryOptOutBucket(): InMemoryOptOutBucket {
  const objects = new Map<string, string>();
  return {
    putJson(key, value) {
      objects.set(key, JSON.stringify(value));
      return Promise.resolve();
    },
    getJson(key) {
      const stored = objects.get(key);
      return Promise.resolve(stored === undefined ? null : (JSON.parse(stored) as unknown));
    },
    list(prefix, maxKeys) {
      const keys = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
      return Promise.resolve(maxKeys === undefined ? keys : keys.slice(0, maxKeys));
    },
    delete(key) {
      objects.delete(key);
      return Promise.resolve();
    },
    keys: () => [...objects.keys()],
  };
}

/** Test helper mirroring what the public site writes. */
export function optOutRequestKey(now = new Date()): string {
  return `${OPT_OUT_REQUEST_PREFIX}${now.getTime()}-${randomUUID()}.json`;
}
