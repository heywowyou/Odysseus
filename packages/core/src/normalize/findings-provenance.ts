import { createHash } from 'node:crypto';
import { FINDINGS_SCHEMA_VERSION, type Finding } from '../types/findings.js';
import { NORMALIZATION_FINGERPRINT } from './normalization-fingerprint.js';

export { NORMALIZATION_FINGERPRINT } from './normalization-fingerprint.js';

export interface FindingsProvenance {
  findingsSchemaVersion: typeof FINDINGS_SCHEMA_VERSION;
  normalizationFingerprint: string;
  findingsDigest: string;
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function buildFindingsProvenance(findings: readonly Finding[]): FindingsProvenance {
  const canonical = JSON.stringify(canonicalize(findings));
  const findingsDigest = `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
  return {
    findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
    normalizationFingerprint: NORMALIZATION_FINGERPRINT,
    findingsDigest,
  };
}

export function assertFindingsProvenance(
  actual: FindingsProvenance | undefined,
  expected: FindingsProvenance,
  artifactLabel: string,
): void {
  if (actual === undefined) {
    throw new Error(
      `Report generation aborted: legacy ${artifactLabel} has no findings provenance. ` +
        'Run normalize, regenerate the structure and analyses, then regenerate the report.',
    );
  }
  if (actual.findingsSchemaVersion !== expected.findingsSchemaVersion) {
    throw new Error(
      `Report generation aborted: stale ${artifactLabel} uses findings schema version ` +
        `${actual.findingsSchemaVersion}; current findings use ${expected.findingsSchemaVersion}.`,
    );
  }
  if (actual.normalizationFingerprint !== expected.normalizationFingerprint) {
    throw new Error(
      `Report generation aborted: stale ${artifactLabel} uses normalization fingerprint ` +
        `${actual.normalizationFingerprint}; current findings use ${expected.normalizationFingerprint}. ` +
        'Run normalize and regenerate the analyses.',
    );
  }
  if (actual.findingsDigest !== expected.findingsDigest) {
    throw new Error(
      `Report generation aborted: stale ${artifactLabel} findings digest does not match ` +
        'the current findings.json. Run normalize and regenerate the analyses.',
    );
  }
}
