import { createHash } from 'node:crypto';
import type { Sha256Digest } from '@odysseus/core';

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
}
export function bytesDigest(value: Buffer | Uint8Array): Sha256Digest {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
export function reportQualityDigest(value: unknown): Sha256Digest {
  return bytesDigest(Buffer.from(canonicalJson(value), 'utf8'));
}
