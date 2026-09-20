import { AwsClient } from 'aws4fetch';

export const REFERENCE_AUDIT_RECEIPT_PREFIX = 'reference-audit-receipts/';

export interface ReferenceAuditReceiptBucket {
  getJson(key: string): Promise<unknown>;
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

export interface ScalewayReferenceAuditReceiptBucketOptions {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fetchImpl?: typeof globalThis.fetch;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

export function createScalewayReferenceAuditReceiptBucket(
  options: ScalewayReferenceAuditReceiptBucketOptions,
): ReferenceAuditReceiptBucket {
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
  const send = async (url: string, init: RequestInit): Promise<Response> =>
    doFetch(await client.sign(url, init));

  return {
    async getJson(key) {
      const response = await send(objectUrl(key), { method: 'GET' });
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok)
        throw new Error(`reference receipt read failed with status ${response.status}`);
      return JSON.parse(await response.text()) as unknown;
    },
    async list(prefix) {
      const response = await send(`${origin}/?list-type=2&prefix=${encodeURIComponent(prefix)}`, {
        method: 'GET',
      });
      if (!response.ok)
        throw new Error(`reference receipt listing failed with status ${response.status}`);
      return [...(await response.text()).matchAll(/<Key>([^<]*)<\/Key>/gu)].map((match) =>
        decodeXml(match[1]!),
      );
    },
    async delete(key) {
      const response = await send(objectUrl(key), { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        throw new Error(`reference receipt delete failed with status ${response.status}`);
      }
    },
  };
}

export interface InMemoryReferenceAuditReceiptBucket extends ReferenceAuditReceiptBucket {
  putJson(key: string, value: unknown): Promise<void>;
  keys(): string[];
}

export function createInMemoryReferenceAuditReceiptBucket(): InMemoryReferenceAuditReceiptBucket {
  const objects = new Map<string, string>();
  return {
    putJson(key, value) {
      objects.set(key, JSON.stringify(value));
      return Promise.resolve();
    },
    getJson(key) {
      const value = objects.get(key);
      return Promise.resolve(value === undefined ? null : (JSON.parse(value) as unknown));
    },
    list(prefix) {
      return Promise.resolve([...objects.keys()].filter((key) => key.startsWith(prefix)));
    },
    delete(key) {
      objects.delete(key);
      return Promise.resolve();
    },
    keys: () => [...objects.keys()],
  };
}
