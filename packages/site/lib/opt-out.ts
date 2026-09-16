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

/** True when a form post comes from this site's own page. Browsers send
 *  Origin on every cross-site form post, so a mismatch is another site
 *  posting on a visitor's behalf; a missing header (old clients, curl) is
 *  let through, since an opt-out never needs proof of identity. */
export function isSameOriginPost(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/** Submissions one client may make per window before further posts are
 *  dropped. Generous for a person, tight for a script flooding the drop box.
 *  Per serverless instance, so a bound on bursts rather than a global quota. */
export const OPT_OUT_SUBMISSIONS_PER_WINDOW = 5;
export const OPT_OUT_WINDOW_MS = 10 * 60 * 1000;
const MAX_TRACKED_CLIENTS = 5_000;

export function createSubmissionLimiter(now: () => number = Date.now) {
  const windows = new Map<string, { startedAt: number; count: number }>();
  return {
    /** Counts one submission and says whether it is within the limit. */
    allow(client: string): boolean {
      const at = now();
      const current = windows.get(client);
      if (current === undefined || at - current.startedAt >= OPT_OUT_WINDOW_MS) {
        if (windows.size >= MAX_TRACKED_CLIENTS) windows.clear();
        windows.set(client, { startedAt: at, count: 1 });
        return true;
      }
      current.count += 1;
      return current.count <= OPT_OUT_SUBMISSIONS_PER_WINDOW;
    },
  };
}

/** The client address Vercel's edge put first in x-forwarded-for. */
export function clientAddressOf(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
