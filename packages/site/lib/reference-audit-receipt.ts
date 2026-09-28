import { createHash } from 'node:crypto';
import { AwsClient } from 'aws4fetch';

const REFERENCE_AUDIT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const REFERENCE_AUDIT_RECEIPT_PREFIX = 'reference-audit-receipts/';

export interface ReferenceAuditReceipt {
  tokenHash: string;
  requestedAt: string;
  referenceVersion: string;
}

export interface ReferenceAuditReceiptWriter {
  write(receipt: ReferenceAuditReceipt): Promise<void>;
}

export function isValidReferenceAuditToken(token: string): boolean {
  return REFERENCE_AUDIT_TOKEN_PATTERN.test(token);
}

export function hashReferenceAuditToken(token: string): string {
  if (!isValidReferenceAuditToken(token)) throw new Error('reference audit token is malformed');
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Issue #551: one object per token and UTC day, so a repeated or scripted
 *  visit with the same link overwrites its receipt instead of adding one. */
export function referenceAuditReceiptKey(receipt: ReferenceAuditReceipt): string {
  const day = receipt.requestedAt.slice(0, 10);
  return `${REFERENCE_AUDIT_RECEIPT_PREFIX}${day}/${receipt.tokenHash}.json`;
}

function validateReferenceAuditReceipt(value: unknown): ReferenceAuditReceipt {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('reference audit receipt is not an object');
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate['tokenHash'] !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(candidate['tokenHash']) ||
    typeof candidate['requestedAt'] !== 'string' ||
    Number.isNaN(new Date(candidate['requestedAt']).getTime()) ||
    typeof candidate['referenceVersion'] !== 'string' ||
    candidate['referenceVersion'].length < 1 ||
    candidate['referenceVersion'].length > 120
  ) {
    throw new Error('reference audit receipt failed validation');
  }
  return {
    tokenHash: candidate['tokenHash'],
    requestedAt: candidate['requestedAt'],
    referenceVersion: candidate['referenceVersion'],
  };
}

interface ReferenceAuditReceiptWriterConfig {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fetchImpl?: typeof globalThis.fetch;
}

function createReferenceAuditReceiptWriter(
  config: ReferenceAuditReceiptWriterConfig,
): ReferenceAuditReceiptWriter {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: config.region,
  });
  const doFetch = config.fetchImpl ?? globalThis.fetch;
  const endpoint = new URL(config.endpoint);
  const origin = `${endpoint.protocol}//${config.bucket}.${endpoint.host}`;
  const objectUrl = (key: string): string =>
    `${origin}/${key.split('/').map(encodeURIComponent).join('/')}`;

  return {
    async write(receipt) {
      const safe = validateReferenceAuditReceipt(receipt);
      const key = referenceAuditReceiptKey(safe);
      const response = await doFetch(
        await client.sign(objectUrl(key), {
          method: 'PUT',
          body: JSON.stringify(safe),
          headers: { 'content-type': 'application/json' },
        }),
      );
      if (!response.ok)
        throw new Error(`reference receipt write failed with status ${response.status}`);
    },
  };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set`);
  return value;
}

export function writerFromEnvironment(): ReferenceAuditReceiptWriter {
  return createReferenceAuditReceiptWriter({
    bucket: requiredEnvironment('REFERENCE_AUDIT_RECEIPT_BUCKET_NAME'),
    endpoint:
      process.env['REFERENCE_AUDIT_RECEIPT_BUCKET_ENDPOINT'] ?? 'https://s3.fr-par.scw.cloud',
    region: process.env['REFERENCE_AUDIT_RECEIPT_BUCKET_REGION'] ?? 'fr-par',
    accessKeyId: requiredEnvironment('REFERENCE_AUDIT_RECEIPT_BUCKET_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnvironment('REFERENCE_AUDIT_RECEIPT_BUCKET_SECRET_KEY'),
  });
}
