import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  deleteAuditCascade,
  deleteFinishedScanJobsForAudit,
  listArchivedProspectsWithAudits,
} from './delete-audit.js';
import { createReportModel } from './schemas/report.schema.js';
import { MODEL_FACTORIES, probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

/** Raw driver inserts, not model.create: the cascade's contract is "every
 *  document naming this auditId across the cascaded collections goes away",
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

/** Every collection the cascade clears (issue #516: the four report-quality
 *  collections were never checked), by the count key it reports. */
const CASCADED_COLLECTIONS = {
  audits: 'audits',
  findings: 'findings',
  analyses: 'analyses',
  reports: 'reports',
  reportApprovals: 'reportApprovals',
  reportQualityLeases: 'reportQualityLeases',
  reportQualityRuns: 'reportQualityRuns',
  reportBundles: 'reportBundles',
  activeReportBundles: 'activeReportBundles',
} as const;

/** Audit-scoped collections the cascade deliberately leaves alone, and why. */
const NOT_CASCADED = new Map([
  ['jobs', 'finished scan jobs go through deleteFinishedScanJobsForAudit'],
  ['outreach_previews', 'a live preview is revoked by the outreach flows, object first'],
]);

function zeroCounts(): Record<keyof typeof CASCADED_COLLECTIONS, number> {
  return Object.fromEntries(Object.keys(CASCADED_COLLECTIONS).map((key) => [key, 0])) as never;
}

describe.skipIf(!mongoAvailable)('deleteAuditCascade', () => {
  it('covers every model with a top-level auditId, or names why not (issue #516)', () => {
    const cascaded = new Set<string>(Object.values(CASCADED_COLLECTIONS));
    for (const factory of MODEL_FACTORIES) {
      const model = factory(connection!);
      if (model.schema.path('auditId') === undefined) continue;
      const name = model.collection.collectionName;
      expect(cascaded.has(name) || NOT_CASCADED.has(name), name).toBe(true);
    }
    for (const name of cascaded) {
      expect(
        MODEL_FACTORIES.some((factory) => factory(connection!).collection.collectionName === name),
        name,
      ).toBe(true);
    }
  });

  it('removes every document naming the audit across all nine collections and leaves others alone', async () => {
    const db = connection!.db!;
    const auditId = `cascade-test-${Date.now()}`;
    const survivorId = `cascade-survivor-${Date.now()}`;
    const collections = Object.fromEntries(
      Object.entries(CASCADED_COLLECTIONS).map(([key, name]) => [key, db.collection(name)]),
    ) as unknown as Record<keyof typeof CASCADED_COLLECTIONS, MinimalCollection>;

    await insertRaw(collections.audits, {
      auditId,
      kind: 'audit',
      siteUrl: 'https://cascade.example/',
      startedAt: new Date(),
      finishedAt: new Date(),
    });
    await insertRaw(collections.findings, { auditId, findingId: 'f1' });
    await insertRaw(collections.findings, { auditId, findingId: 'f2' });
    for (const key of Object.keys(CASCADED_COLLECTIONS) as (keyof typeof CASCADED_COLLECTIONS)[]) {
      if (key === 'audits' || key === 'findings') continue;
      await insertRaw(collections[key], { auditId, marker: `${key}-1` });
    }

    // An unrelated audit sharing none of the cascade's target rows.
    await insertRaw(collections.audits, {
      auditId: survivorId,
      kind: 'audit',
      siteUrl: 'https://survivor.example/',
      startedAt: new Date(),
      finishedAt: new Date(),
    });
    await insertRaw(collections.findings, { auditId: survivorId, findingId: 's1' });
    await insertRaw(collections.activeReportBundles, { auditId: survivorId, marker: 'kept' });

    const counts = await deleteAuditCascade(connection!, auditId);
    expect(counts).toEqual({
      audits: 1,
      findings: 2,
      analyses: 1,
      reports: 1,
      reportApprovals: 1,
      reportQualityLeases: 1,
      reportQualityRuns: 1,
      reportBundles: 1,
      activeReportBundles: 1,
    });

    for (const [name, collection] of Object.entries(collections)) {
      expect(await countForAudit(collection, auditId), name).toBe(0);
    }
    expect(await countForAudit(collections.audits, survivorId)).toBe(1);
    expect(await countForAudit(collections.findings, survivorId)).toBe(1);
    expect(await countForAudit(collections.activeReportBundles, survivorId)).toBe(1);

    await Promise.all(
      Object.values(collections).map((collection) =>
        collection.deleteMany({ auditId: survivorId }),
      ),
    );
  });

  it('keeps the audit row as a retry anchor when a child collection delete fails', async () => {
    const db = connection!.db!;
    const auditId = `cascade-retry-${randomUUID()}`;
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
      siteUrl: 'https://cascade-retry.example/',
      startedAt: new Date(),
      finishedAt: new Date(),
    });
    await insertRaw(collections.findings, { auditId, findingId: 'f-retry' });
    await insertRaw(collections.analyses, { auditId, analysisId: 'a-retry', language: 'fr' });
    await insertRaw(collections.reports, { auditId, reportId: 'r-retry', language: 'fr' });
    await insertRaw(collections.reportApprovals, { auditId, approvalId: 'ap-retry' });

    const reportModel = createReportModel(connection!);
    const failedDelete = vi.spyOn(reportModel, 'deleteMany').mockImplementationOnce(
      () =>
        ({
          exec: async () => {
            throw new Error('simulated child-delete failure');
          },
        }) as never,
    );
    try {
      await expect(deleteAuditCascade(connection!, auditId)).rejects.toThrow(
        'simulated child-delete failure',
      );
    } finally {
      failedDelete.mockRestore();
    }

    expect(await countForAudit(collections.audits, auditId)).toBe(1);
    expect(await countForAudit(collections.findings, auditId)).toBe(0);
    expect(await countForAudit(collections.analyses, auditId)).toBe(0);
    expect(await countForAudit(collections.reports, auditId)).toBe(1);
    expect(await countForAudit(collections.reportApprovals, auditId)).toBe(1);

    await expect(deleteAuditCascade(connection!, auditId)).resolves.toEqual({
      ...zeroCounts(),
      audits: 1,
      reports: 1,
      reportApprovals: 1,
    });
    for (const [name, collection] of Object.entries(collections)) {
      expect(await countForAudit(collection, auditId), name).toBe(0);
    }
  });

  it('returns zero counts for an unknown auditId instead of throwing', async () => {
    const counts = await deleteAuditCascade(connection!, 'no-such-audit');
    expect(counts).toEqual(zeroCounts());
  });
});

describe.skipIf(!mongoAvailable)('archive retention helpers (issue #381)', () => {
  it('deletes only finished single-site scan jobs for the audit', async () => {
    const db = connection!.db!;
    const jobs = db.collection('jobs');
    const auditId = `retention-audit-${Date.now()}`;
    const tag = `retention-job-${Date.now()}`;
    await jobs.insertOne({ jobId: `${tag}-done`, type: 'full-audit', status: 'complete', auditId });
    await jobs.insertOne({
      jobId: `${tag}-input`,
      type: 'full-audit',
      status: 'needs-input',
      auditId,
    });
    await jobs.insertOne({
      jobId: `${tag}-running`,
      type: 'full-audit',
      status: 'running',
      auditId,
    });
    await jobs.insertOne({
      jobId: `${tag}-batch`,
      type: 'prospecting',
      status: 'complete',
      auditId,
    });
    await jobs.insertOne({
      jobId: `${tag}-other`,
      type: 'full-audit',
      status: 'complete',
      auditId: `${auditId}-other`,
    });

    expect(await deleteFinishedScanJobsForAudit(connection!, auditId)).toBe(2);
    const left = await jobs
      .find({ jobId: { $regex: `^${tag}` } })
      .map((job) => job['jobId'] as string)
      .toArray();
    expect(left.sort()).toEqual([`${tag}-batch`, `${tag}-other`, `${tag}-running`]);
    await jobs.deleteMany({ jobId: { $regex: `^${tag}` } });
  });

  it('lists archived prospects that still own audits', async () => {
    const db = connection!.db!;
    const tag = `retention-prospect-${Date.now()}`;
    const prospects = db.collection('prospects');
    const audits = db.collection('audits');
    await prospects.insertOne({
      prospectId: `${tag}-a`,
      name: 'Archived with audits',
      archivedAt: new Date(),
    });
    await prospects.insertOne({
      prospectId: `${tag}-b`,
      name: 'Archived, purged',
      archivedAt: new Date(),
    });
    await prospects.insertOne({ prospectId: `${tag}-c`, name: 'Active with audits' });
    for (const [prospectId, n] of [
      [`${tag}-a`, 2],
      [`${tag}-c`, 1],
    ] as const) {
      for (let i = 0; i < n; i += 1) {
        await audits.insertOne({
          auditId: `${prospectId}-${i}`,
          prospectId,
          siteUrl: 'https://x.example/',
        });
      }
    }

    const rows = (await listArchivedProspectsWithAudits(connection!)).filter((row) =>
      row.prospectId.startsWith(tag),
    );
    expect(rows).toEqual([{ prospectId: `${tag}-a`, name: 'Archived with audits', audits: 2 }]);
    await prospects.deleteMany({ prospectId: { $regex: `^${tag}` } });
    await audits.deleteMany({ prospectId: { $regex: `^${tag}` } });
  });
});
