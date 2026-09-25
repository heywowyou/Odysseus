import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FINDINGS_SCHEMA_VERSION, type Finding } from '@odysseus/core';
import { createFindingModel } from './schemas/finding.schema.js';
import {
  getStoredPrimarySeverityRollups,
  loadSeverityPopulationInputs,
  storePrimarySeverityRollup,
} from './severity-rollup.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

// No dropDatabase here: persist-audit.test.ts already owns dropping the
// shared odysseus_test database in its afterAll. A second concurrent
// dropper races against other Docker-gated test files still mid-run
// against the same database.
const TEST_AUDIT_IDS = ['rollup-1', 'rollup-2', 'rollup-3', 'rollup-missing'];

/** Worker databases are reused between runs and never dropped, and every
 *  finding here gets a random findingId and dedupeKey, so nothing stops a
 *  second run inserting a second copy: the counts this file asserts grew by a
 *  factor of the number of runs. Uniqueness is what lets them accumulate, not
 *  what protects them. Clear before asserting as well as after, so a run
 *  aborted mid-suite does not leave the next one counting its leftovers. */
async function deleteTestFindings(): Promise<void> {
  if (!connection) return;
  await createFindingModel(connection).deleteMany({ auditId: { $in: TEST_AUDIT_IDS } });
  await connection.db!.collection('audits').deleteMany({ auditId: { $in: TEST_AUDIT_IDS } });
}

/** A bare audit row: these functions read only these fields. */
async function insertAudit(fields: Record<string, unknown> & { auditId: string }): Promise<void> {
  await connection!.db!.collection('audits').insertOne(fields);
}

beforeAll(deleteTestFindings);

afterAll(async () => {
  await deleteTestFindings();
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

describe.skipIf(!mongoAvailable)('primary severity rollups (issue #508)', () => {
  it('reads a stored rollup only while it matches the current findings digest', async () => {
    await insertAudit({
      auditId: 'rollup-1',
      findingsProvenance: { findingsDigest: 'd1' },
      primarySeverityRollup: {
        critical: 1,
        serious: 2,
        moderate: 0,
        minor: 1,
        findingsDigest: 'd1',
      },
    });
    await insertAudit({
      auditId: 'rollup-2',
      findingsProvenance: { findingsDigest: 'd2-new' },
      primarySeverityRollup: {
        critical: 9,
        serious: 9,
        moderate: 9,
        minor: 9,
        findingsDigest: 'd2',
      },
    });
    await insertAudit({ auditId: 'rollup-3', findingsProvenance: { findingsDigest: 'd3' } });

    const rollups = await getStoredPrimarySeverityRollups(connection!, [
      'rollup-1',
      'rollup-2',
      'rollup-3',
      'rollup-missing',
    ]);

    expect([...rollups.keys()]).toEqual(['rollup-1']);
    expect(rollups.get('rollup-1')).toEqual({ critical: 1, serious: 2, moderate: 0, minor: 1 });
  });

  it("loads each audit's pages and findings with only the fields the population reads", async () => {
    await createFindingModel(connection!).create([
      {
        ...buildFinding({
          auditId: 'rollup-3',
          severity: 'critical',
          elements: [
            { selector: 'iframe >>> button', snippet: '<button>', pageUrl: 'https://example.com/' },
          ],
        }),
        siteUrl: 'https://example.com/',
      },
    ]);

    const [input, missing] = await loadSeverityPopulationInputs(connection!, [
      'rollup-3',
      'rollup-missing',
    ]);

    expect(input).toMatchObject({ auditId: 'rollup-3', findingsDigest: 'd3', pages: [] });
    expect(input!.findings).toEqual([
      {
        severity: 'critical',
        pageUrls: ['https://example.com/'],
        elements: [{ selector: 'iframe >>> button' }],
      },
    ]);
    expect(missing).toEqual({ auditId: 'rollup-missing', pages: [], findings: [] });
  });

  it('stores a computed rollup only for the digest it was computed from, never over a stored one', async () => {
    const rollup = { critical: 0, serious: 1, moderate: 0, minor: 0 };
    await storePrimarySeverityRollup(connection!, 'rollup-3', 'stale-digest', rollup);
    expect((await getStoredPrimarySeverityRollups(connection!, ['rollup-3'])).size).toBe(0);

    await storePrimarySeverityRollup(connection!, 'rollup-3', 'd3', rollup);
    expect(
      (await getStoredPrimarySeverityRollups(connection!, ['rollup-3'])).get('rollup-3'),
    ).toEqual(rollup);

    await storePrimarySeverityRollup(connection!, 'rollup-1', 'd1', rollup);
    expect(
      (await getStoredPrimarySeverityRollups(connection!, ['rollup-1'])).get('rollup-1'),
    ).toEqual({
      critical: 1,
      serious: 2,
      moderate: 0,
      minor: 1,
    });
  });

  it('returns nothing for an empty auditIds array', async () => {
    expect((await getStoredPrimarySeverityRollups(connection!, [])).size).toBe(0);
    expect(await loadSeverityPopulationInputs(connection!, [])).toEqual([]);
  });
});
