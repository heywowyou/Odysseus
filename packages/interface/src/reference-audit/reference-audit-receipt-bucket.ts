import { createS3Bucket, type S3BucketOptions } from '../s3-bucket.js';

export const REFERENCE_AUDIT_RECEIPT_PREFIX = 'reference-audit-receipts/';

export interface ReferenceAuditReceiptBucket {
  getJson(key: string): Promise<unknown>;
  /** Keys under `prefix`, at most `maxKeys` when given. */
  list(prefix: string, maxKeys?: number): Promise<string[]>;
  delete(key: string): Promise<void>;
}

export type ScalewayReferenceAuditReceiptBucketOptions = S3BucketOptions;

export function createScalewayReferenceAuditReceiptBucket(
  options: ScalewayReferenceAuditReceiptBucketOptions,
): ReferenceAuditReceiptBucket {
  const bucket = createS3Bucket(options);
  const { objectUrl, send } = bucket;

  return {
    async getJson(key) {
      const response = await send(objectUrl(key), { method: 'GET' });
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok)
        throw new Error(`reference receipt read failed with status ${response.status}`);
      return JSON.parse(await response.text()) as unknown;
    },
    list(prefix, maxKeys) {
      return bucket.listKeys(prefix, 'reference receipt', maxKeys);
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
