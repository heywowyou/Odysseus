import { afterAll, describe, expect, it } from 'vitest';
import { FINDINGS_SCHEMA_VERSION, type Finding } from '@odysseus/core';
import { createFindingModel } from './schemas/finding.schema.js';
import { getSeverityRollup, getSeverityRollups } from './severity-rollup.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

// No dropDatabase here: persist-audit.test.ts already owns dropping the
// shared odysseus_test database in its afterAll. A second concurrent
// dropper races against other Docker-gated test files still mid-run
// against the same database. Unique auditId/dedupeKey values per test
// keep this file's assertions valid without exclusive DB ownership.
afterAll(async () => {
  if (connection) await connection.close();
});

function buildFinding(overrides: Partial<Finding> & { auditId: string }): Finding {
  return {
    findingId: `f-${Math.random()}`,
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria: ['1.4.3'],
    title: 'Color contrast',
    description: 'Insufficient color contrast',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: `d-${Math.random()}`,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    ...overrides,
  };
}

describe.skipIf(!mongoAvailable)('severity rollup', () => {
  it('counts findings by severity for a single audit', async () => {
    const FindingModel = createFindingModel(connection!);
    await FindingModel.create([
      { ...buildFinding({ auditId: 'rollup-1', severity: 'critical' }), siteUrl: 'https://example.com/' },
      { ...buildFinding({ auditId: 'rollup-1', severity: 'serious' }), siteUrl: 'https://example.com/' },
      { ...buildFinding({ auditId: 'rollup-1', severity: 'serious' }), siteUrl: 'https://example.com/' },
      { ...buildFinding({ auditId: 'rollup-1', severity: 'minor' }), siteUrl: 'https://example.com/' },
    ]);

    const rollup = await getSeverityRollup(connection!, 'rollup-1');
    expect(rollup).toEqual({ critical: 1, serious: 2, moderate: 0, minor: 1 });
  });

  it('returns an all-zero rollup for an audit with no findings', async () => {
    const rollup = await getSeverityRollup(connection!, 'rollup-nonexistent');
    expect(rollup).toEqual({ critical: 0, serious: 0, moderate: 0, minor: 0 });
  });

  it('batches multiple auditIds into one query', async () => {
    const FindingModel = createFindingModel(connection!);
    await FindingModel.create([
      { ...buildFinding({ auditId: 'rollup-2', severity: 'moderate' }), siteUrl: 'https://example.com/' },
      { ...buildFinding({ auditId: 'rollup-3', severity: 'critical' }), siteUrl: 'https://example.com/' },
    ]);

    const rollups = await getSeverityRollups(connection!, ['rollup-2', 'rollup-3', 'rollup-missing']);
    expect(rollups.get('rollup-2')).toEqual({ critical: 0, serious: 0, moderate: 1, minor: 0 });
    expect(rollups.get('rollup-3')).toEqual({ critical: 1, serious: 0, moderate: 0, minor: 0 });
    expect(rollups.get('rollup-missing')).toEqual({ critical: 0, serious: 0, moderate: 0, minor: 0 });
  });

  it('returns an empty map for an empty auditIds array without querying', async () => {
    const rollups = await getSeverityRollups(connection!, []);
    expect(rollups.size).toBe(0);
  });
});
