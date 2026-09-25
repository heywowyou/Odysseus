import { createHash } from 'node:crypto';
import { FINDINGS_SCHEMA_VERSION, type Finding } from '../types/findings.js';
import { NORMALIZATION_FINGERPRINT } from './normalization-fingerprint.js';

export { NORMALIZATION_FINGERPRINT } from './normalization-fingerprint.js';

export interface FindingsProvenance {
  findingsSchemaVersion: typeof FINDINGS_SCHEMA_VERSION;
  normalizationFingerprint: string;
  findingsDigest: string;
}

/** Object keys in plain UTF-16 code-unit order (issue #504). `localeCompare`
 *  uses ICU collation, which orders the punctuation and case in URL keys
 *  (`rawEvidence.perPage`) differently from code units and can change between
 *  Node or ICU versions; a digest must never depend on the machine. */
function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** The value in the one shape JSON.stringify serializes identically for
 *  equal findings. Exported for its tests. */
export function canonicalizeForFindingsDigest(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalizeForFindingsDigest);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => compareKeys(left, right))
        .map(([key, child]) => [key, canonicalizeForFindingsDigest(child)]),
    );
  }
  return value;
}

export function buildFindingsProvenance(findings: readonly Finding[]): FindingsProvenance {
  const canonical = JSON.stringify(canonicalizeForFindingsDigest(findings));
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
