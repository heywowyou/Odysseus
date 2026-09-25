/**
 * Versioned publication contract for the permanent reference report.
 *
 * The current pointer is deliberately tiny and contains no source audit,
 * prospect or hostname. PDF objects are immutable; replacing the pointer is
 * the only operation that changes what the public site serves.
 */

import { createHash } from 'node:crypto';

export const REFERENCE_AUDIT_CURRENT_KEY = 'reference-audit/current.json';
const REFERENCE_AUDIT_PDF_PREFIX = 'reference-audit/';
const REFERENCE_AUDIT_MANIFEST_SCHEMA_VERSION = 'reference-audit-v1' as const;

export interface ReferenceAuditCurrentManifest {
  schemaVersion: typeof REFERENCE_AUDIT_MANIFEST_SCHEMA_VERSION;
  objectKey: `${typeof REFERENCE_AUDIT_PDF_PREFIX}${string}.pdf`;
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

export interface ReferenceAuditObjectStore {
  putObject(input: { key: string; body: Uint8Array; contentType: string }): Promise<void>;
  readObject(key: string): Promise<Uint8Array | null>;
}

export interface PublishReferenceAuditInput {
  pdf: Uint8Array;
  pageCount: number;
  rendererBuild: string;
  reportTemplateVersion: number;
  dataVersion: string;
  anonymizerVersion: string;
  referenceReleaseVersion: string;
  publishedAt?: Date;
}

export interface PublishReferenceAuditResult {
  manifest: ReferenceAuditCurrentManifest;
  previousManifest: ReferenceAuditCurrentManifest | null;
}

export class ReferenceAuditPublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferenceAuditPublicationError';
  }
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/u.test(value);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function referenceAuditPdfKey(
  pdfSha256: string,
): `${typeof REFERENCE_AUDIT_PDF_PREFIX}${string}.pdf` {
  if (!isSha256(pdfSha256))
    throw new ReferenceAuditPublicationError('reference PDF digest is malformed');
  return `${REFERENCE_AUDIT_PDF_PREFIX}${pdfSha256}.pdf`;
}

function parseReferenceAuditManifest(value: unknown): ReferenceAuditCurrentManifest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReferenceAuditPublicationError('reference current manifest is not an object');
  }
  const candidate = value as Record<string, unknown>;
  const objectKey = candidate['objectKey'];
  const pdfSha256 = candidate['pdfSha256'];
  if (
    candidate['schemaVersion'] !== REFERENCE_AUDIT_MANIFEST_SCHEMA_VERSION ||
    typeof objectKey !== 'string' ||
    typeof pdfSha256 !== 'string' ||
    !isSha256(pdfSha256) ||
    objectKey !== referenceAuditPdfKey(pdfSha256) ||
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
    throw new ReferenceAuditPublicationError('reference current manifest failed validation');
  }
  return {
    schemaVersion: REFERENCE_AUDIT_MANIFEST_SCHEMA_VERSION,
    objectKey: objectKey as ReferenceAuditCurrentManifest['objectKey'],
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

async function readCurrent(
  store: ReferenceAuditObjectStore,
): Promise<ReferenceAuditCurrentManifest | null> {
  const raw = await store.readObject(REFERENCE_AUDIT_CURRENT_KEY);
  if (raw === null) return null;
  try {
    return parseReferenceAuditManifest(JSON.parse(new TextDecoder().decode(raw)) as unknown);
  } catch (error) {
    if (error instanceof ReferenceAuditPublicationError) throw error;
    throw new ReferenceAuditPublicationError('reference current manifest is not valid JSON');
  }
}

async function verifyPdf(
  store: ReferenceAuditObjectStore,
  manifest: ReferenceAuditCurrentManifest,
): Promise<void> {
  const stored = await store.readObject(manifest.objectKey);
  if (stored === null) throw new ReferenceAuditPublicationError('reference PDF is missing');
  if (sha256(stored) !== manifest.pdfSha256) {
    throw new ReferenceAuditPublicationError('reference PDF readback digest does not match');
  }
}

export async function readCurrentReferenceAudit(
  store: ReferenceAuditObjectStore,
): Promise<{ manifest: ReferenceAuditCurrentManifest; pdf: Uint8Array } | null> {
  const manifest = await readCurrent(store);
  if (manifest === null) return null;
  const pdf = await store.readObject(manifest.objectKey);
  if (pdf === null || sha256(pdf) !== manifest.pdfSha256) {
    throw new ReferenceAuditPublicationError(
      'approved reference PDF failed integrity verification',
    );
  }
  return { manifest, pdf: copyBytes(pdf) };
}

export async function publishReferenceAudit(
  store: ReferenceAuditObjectStore,
  input: PublishReferenceAuditInput,
): Promise<PublishReferenceAuditResult> {
  if (input.pdf.byteLength === 0) {
    throw new ReferenceAuditPublicationError('reference PDF is empty');
  }
  if (!Number.isInteger(input.pageCount) || input.pageCount < 1) {
    throw new ReferenceAuditPublicationError('reference PDF page count is invalid');
  }
  const digest = sha256(input.pdf);
  const objectKey = referenceAuditPdfKey(digest);
  const previousManifest = await readCurrent(store);
  await store.putObject({
    key: objectKey,
    body: copyBytes(input.pdf),
    contentType: 'application/pdf',
  });
  const candidate: ReferenceAuditCurrentManifest = {
    schemaVersion: REFERENCE_AUDIT_MANIFEST_SCHEMA_VERSION,
    objectKey,
    pdfSha256: digest,
    publishedAt: (input.publishedAt ?? new Date()).toISOString(),
    rendererBuild: input.rendererBuild,
    reportTemplateVersion: input.reportTemplateVersion,
    dataVersion: input.dataVersion,
    anonymizerVersion: input.anonymizerVersion,
    referenceReleaseVersion: input.referenceReleaseVersion,
    pageCount: input.pageCount,
    releaseStatus: 'approved',
  };
  parseReferenceAuditManifest(candidate);
  await verifyPdf(store, candidate);
  await store.putObject({
    key: REFERENCE_AUDIT_CURRENT_KEY,
    body: new TextEncoder().encode(JSON.stringify(candidate)),
    contentType: 'application/json; charset=utf-8',
  });
  const current = await readCurrent(store);
  if (current?.pdfSha256 !== candidate.pdfSha256) {
    throw new ReferenceAuditPublicationError('reference current pointer readback failed');
  }
  return { manifest: candidate, previousManifest };
}

/** Restore a previously approved immutable object without changing its
 *  original release metadata. The object is verified before the pointer moves. */
export async function rollbackReferenceAudit(
  store: ReferenceAuditObjectStore,
  manifest: ReferenceAuditCurrentManifest,
): Promise<void> {
  parseReferenceAuditManifest(manifest);
  await verifyPdf(store, manifest);
  await store.putObject({
    key: REFERENCE_AUDIT_CURRENT_KEY,
    body: new TextEncoder().encode(JSON.stringify(manifest)),
    contentType: 'application/json; charset=utf-8',
  });
}

export interface InMemoryReferenceAuditObjectStore extends ReferenceAuditObjectStore {
  keys(): string[];
}

export function createInMemoryReferenceAuditObjectStore(): InMemoryReferenceAuditObjectStore {
  const objects = new Map<string, Uint8Array>();
  return {
    putObject({ key, body }) {
      objects.set(key, copyBytes(body));
      return Promise.resolve();
    },
    readObject(key) {
      const body = objects.get(key);
      return Promise.resolve(body === undefined ? null : copyBytes(body));
    },
    keys: () => [...objects.keys()],
  };
}
