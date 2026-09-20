/** Site-local copy of the tiny public reference-object contract. The site is
 * deployed separately and must not import the private interface package. */

import { createHash } from 'node:crypto';
import { AwsClient } from 'aws4fetch';

export const REFERENCE_AUDIT_CURRENT_KEY = 'reference-audit/current.json';
const REFERENCE_AUDIT_PREFIX = 'reference-audit/';
const MANIFEST_SCHEMA_VERSION = 'reference-audit-v1';

export interface ReferenceAuditManifest {
  schemaVersion: 'reference-audit-v1';
  objectKey: `reference-audit/${string}.pdf`;
  pdfSha256: string;
  publishedAt: string;
  rendererBuild: string;
  reportTemplateVersion: number;
  dataVersion: string;
  anonymizerVersion: string;
  referenceReleaseVersion: string;
  pageCount: number;
  releaseStatus: 'approved';
}

export interface ReferenceAuditReader {
  readCurrent(): Promise<{ manifest: ReferenceAuditManifest; pdf: Uint8Array } | null>;
}

export class ReferenceAuditReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferenceAuditReadError';
  }
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function pdfKeyForDigest(pdfSha256: string): `reference-audit/${string}.pdf` {
  if (!/^[0-9a-f]{64}$/u.test(pdfSha256)) {
    throw new ReferenceAuditReadError('reference PDF digest is malformed');
  }
  return `${REFERENCE_AUDIT_PREFIX}${pdfSha256}.pdf`;
}

export function parseReferenceAuditManifest(value: unknown): ReferenceAuditManifest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReferenceAuditReadError('reference current manifest is not an object');
  }
  const candidate = value as Record<string, unknown>;
  const objectKey = candidate['objectKey'];
  const pdfSha256 = candidate['pdfSha256'];
  if (
    candidate['schemaVersion'] !== MANIFEST_SCHEMA_VERSION ||
    typeof objectKey !== 'string' ||
    typeof pdfSha256 !== 'string' ||
    objectKey !== pdfKeyForDigest(pdfSha256) ||
    typeof candidate['publishedAt'] !== 'string' ||
    Number.isNaN(new Date(candidate['publishedAt']).getTime()) ||
    typeof candidate['rendererBuild'] !== 'string' ||
    typeof candidate['reportTemplateVersion'] !== 'number' ||
    !Number.isInteger(candidate['reportTemplateVersion']) ||
    typeof candidate['dataVersion'] !== 'string' ||
    typeof candidate['anonymizerVersion'] !== 'string' ||
    typeof candidate['referenceReleaseVersion'] !== 'string' ||
    typeof candidate['pageCount'] !== 'number' ||
    !Number.isInteger(candidate['pageCount']) ||
    candidate['pageCount'] < 1 ||
    candidate['releaseStatus'] !== 'approved'
  ) {
    throw new ReferenceAuditReadError('reference current manifest failed validation');
  }
  return {
    schemaVersion: 'reference-audit-v1',
    objectKey: objectKey as ReferenceAuditManifest['objectKey'],
    pdfSha256,
    publishedAt: candidate['publishedAt'],
    rendererBuild: candidate['rendererBuild'],
    reportTemplateVersion: candidate['reportTemplateVersion'],
    dataVersion: candidate['dataVersion'],
    anonymizerVersion: candidate['anonymizerVersion'],
    referenceReleaseVersion: candidate['referenceReleaseVersion'],
    pageCount: candidate['pageCount'],
    releaseStatus: 'approved',
  };
}

export interface ReferenceAuditReaderConfig {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fetchImpl?: typeof globalThis.fetch;
}

export function createReferenceAuditReader(
  config: ReferenceAuditReaderConfig,
): ReferenceAuditReader {
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

  async function readObject(key: string): Promise<Uint8Array | null> {
    const response = await doFetch(await client.sign(objectUrl(key), { method: 'GET' }));
    if (response.status === 404 || response.status === 403) return null;
    if (!response.ok) throw new ReferenceAuditReadError(`reference object read failed with status ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  return {
    async readCurrent() {
      const manifestBytes = await readObject(REFERENCE_AUDIT_CURRENT_KEY);
      if (manifestBytes === null) return null;
      let manifest: ReferenceAuditManifest;
      try {
        manifest = parseReferenceAuditManifest(
          JSON.parse(new TextDecoder().decode(manifestBytes)) as unknown,
        );
      } catch (error) {
        if (error instanceof ReferenceAuditReadError) throw error;
        throw new ReferenceAuditReadError('reference current manifest is not valid JSON');
      }
      const pdf = await readObject(manifest.objectKey);
      if (pdf === null || digest(pdf) !== manifest.pdfSha256) {
        throw new ReferenceAuditReadError('approved reference PDF failed integrity verification');
      }
      return { manifest, pdf };
    },
  };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new ReferenceAuditReadError(`${name} is not set`);
  return value;
}

export function readerFromEnvironment(): ReferenceAuditReader {
  return createReferenceAuditReader({
    bucket: requiredEnvironment('REFERENCE_AUDIT_BUCKET_NAME'),
    endpoint: process.env['REFERENCE_AUDIT_BUCKET_ENDPOINT'] ?? 'https://s3.fr-par.scw.cloud',
    region: process.env['REFERENCE_AUDIT_BUCKET_REGION'] ?? 'fr-par',
    accessKeyId: requiredEnvironment('REFERENCE_AUDIT_BUCKET_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnvironment('REFERENCE_AUDIT_BUCKET_SECRET_KEY'),
  });
}
