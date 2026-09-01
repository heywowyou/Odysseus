import { afterAll, describe, expect, it } from 'vitest';
import { deleteAuditCascade } from './delete-audit.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

/** Raw driver inserts, not model.create: the cascade's contract is "every
 *  document naming this auditId across the five collections goes away",
 *  which does not depend on the documents passing Mongoose validation, and
 *  building a fully valid manifest fixture here would only duplicate
 *  persist-audit.test.ts's. The structural collection type avoids importing
 *  the underlying mongodb driver's namespace for one test file. */
interface MinimalCollection {
  insertOne(doc: unknown): Promise<unknown>;
  countDocuments(filter: Record<string, unknown>): Promise<number>;
  deleteMany(filter: Record<string, unknown>): Promise<unknown>;
}

async function insertRaw(
  collection: MinimalCollection,
  doc: Record<string, unknown>,
): Promise<void> {
  await collection.insertOne(doc as never);
}

async function countForAudit(collection: MinimalCollection, auditId: string): Promise<number> {
  return collection.countDocuments({ auditId });
}

describe.skipIf(!mongoAvailable)('deleteAuditCascade', () => {
  it('removes every document naming the audit across all five collections and leaves others alone', async () => {
    const db = connection!.db!;
    const auditId = `cascade-test-${Date.now()}`;
    const survivorId = `cascade-survivor-${Date.now()}`;
    const collections = {
      audits: db.collection('audits'),
      findings: db.collection('findings'),
      analyses: db.collection('analyses'),
      reports: db.collection('reports'),
      reportApprovals: db.collection('reportApprovals'),
    };

    await insertRaw(collections.audits, {
      auditId,
      kind: 'audit',
      siteUrl: 'https://cascade.example/',
      startedAt: new Date(),
      finishedAt: new Date(),
    });
    await insertRaw(collections.findings, { auditId, findingId: 'f1' });
    await insertRaw(collections.findings, { auditId, findingId: 'f2' });
    await insertRaw(collections.analyses, { auditId, analysisId: 'a1', language: 'fr' });
    await insertRaw(collections.reports, { auditId, reportId: 'r1', language: 'fr' });
    await insertRaw(collections.reportApprovals, { auditId, approvalId: 'ap1' });

    // An unrelated audit sharing none of the cascade's target rows.
    await insertRaw(collections.audits, {
      auditId: survivorId,
      kind: 'audit',
      siteUrl: 'https://survivor.example/',
      startedAt: new Date(),
      finishedAt: new Date(),
    });
    await insertRaw(collections.findings, { auditId: survivorId, findingId: 's1' });

    const counts = await deleteAuditCascade(connection!, auditId);
    expect(counts).toEqual({
      audits: 1,
      findings: 2,
      analyses: 1,
      reports: 1,
      reportApprovals: 1,
    });

    for (const [name, collection] of Object.entries(collections)) {
      expect(await countForAudit(collection, auditId), name).toBe(0);
    }
    expect(await countForAudit(collections.audits, survivorId)).toBe(1);
    expect(await countForAudit(collections.findings, survivorId)).toBe(1);

    await Promise.all(
      Object.values(collections).map((collection) =>
        collection.deleteMany({ auditId: survivorId }),
      ),
    );
  });

  it('returns zero counts for an unknown auditId instead of throwing', async () => {
    const counts = await deleteAuditCascade(connection!, 'no-such-audit');
    expect(counts).toEqual({
      audits: 0,
      findings: 0,
      analyses: 0,
      reports: 0,
      reportApprovals: 0,
    });
  });
});
