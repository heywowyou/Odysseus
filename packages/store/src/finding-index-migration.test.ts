import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dropObsoleteFindingIndexes } from './finding-index-migration.js';
import { createFindingModel } from './schemas/finding.schema.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('finding_index_migration'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

beforeEach(async () => {
  if (available) await connection!.dropDatabase();
});

describe.skipIf(!available)('dropObsoleteFindingIndexes (issue #549)', () => {
  it('does nothing before the findings collection exists', async () => {
    await expect(dropObsoleteFindingIndexes(connection!)).resolves.toEqual([]);
  });

  it('drops the legacy auditId and siteUrl/dedupeKey indexes once and keeps the upsert index', async () => {
    const findings = connection!.db!.collection('findings');
    await findings.createIndex({ auditId: 1 });
    await findings.createIndex({ siteUrl: 1, dedupeKey: 1 });
    await createFindingModel(connection!).syncIndexes();
    // syncIndexes already drops undeclared indexes; recreate them as a
    // deployment that only ever ran autoIndex still holds them.
    await findings.createIndex({ auditId: 1 });
    await findings.createIndex({ siteUrl: 1, dedupeKey: 1 });

    expect(await dropObsoleteFindingIndexes(connection!)).toEqual([
      'auditId_1',
      'siteUrl_1_dedupeKey_1',
    ]);
    expect(await dropObsoleteFindingIndexes(connection!)).toEqual([]);
    const names = (await findings.listIndexes().toArray()).map((index) => index['name']);
    expect(names.sort()).toEqual(['_id_', 'auditId_1_dedupeKey_1', 'auditId_1_severity_1']);
  });

  it('answers the persist upsert filter from one index entry', async () => {
    const Finding = createFindingModel(connection!);
    await Finding.syncIndexes();
    const findings = connection!.db!.collection('findings');
    await findings.insertMany(
      Array.from({ length: 50 }, (_, i) => ({
        auditId: 'a1',
        dedupeKey: `k${i}`,
        severity: 'minor',
      })),
    );
    const explain = (await findings
      .find({ auditId: 'a1', dedupeKey: 'k7' })
      .explain('executionStats')) as { executionStats: { totalDocsExamined: number } };
    expect(explain.executionStats.totalDocsExamined).toBe(1);
  });
});
