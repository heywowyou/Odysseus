import { FINDINGS_SCHEMA_VERSION, type Finding } from '../types/findings.js';
import type { FindingsProvenance } from '../normalize/findings-provenance.js';

/**
 * Minimal deterministic builders for the report-preparation tests. These
 * are stand-ins, not real-scan fixtures: the preparation policy is pure
 * over the findings shape.
 */

let nextFindingId = 0;

export function buildFinding(
  overrides: Partial<Finding> & Pick<Finding, 'source' | 'category' | 'severity'>,
): Finding {
  nextFindingId += 1;
  return {
    findingId: `finding-${nextFindingId}`,
    auditId: 'audit-1',
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    ruleId: 'rule-example',
    wcagCriteria: [],
    title: 'Example finding',
    description: 'Example description',
    pageUrls: ['https://site.example/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: `dedupe-${nextFindingId}`,
    firstSeenAt: new Date('2026-09-01T00:00:00Z'),
    lastSeenAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

export function buildProvenance(digest: string): FindingsProvenance {
  return {
    findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
    normalizationFingerprint: 'fp-test',
    findingsDigest: digest,
  };
}
