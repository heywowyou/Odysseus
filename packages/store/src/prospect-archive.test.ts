import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  addDirectoryEntriesToProspects,
  archiveProspect,
  countActiveProspectDeletionJobs,
  countProspectDeletionImpact,
  createProspectHub,
  deleteProspectPermanently,
  getProspectHub,
  listDirectory,
  listProspectEvents,
  listProspects,
  listProspectTodo,
  restoreProspect,
  upsertDirectoryEntries,
} from './prospect-hub.js';
import { createAuditModel } from './schemas/audit.schema.js';
import { createDirectoryEntryModel } from './schemas/directory-entry.schema.js';
import { createFindingModel } from './schemas/finding.schema.js';
import { createJobModel } from './schemas/job.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { createReportApprovalModel } from './schemas/report-approval.schema.js';
import { createReportModel } from './schemas/report.schema.js';
import { addSuppressionEntry, isSuppressed } from './suppression.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
});

function directoryEntry(directoryId: string, domain: string) {
  const now = new Date('2026-09-01T00:00:00.000Z');
  return {
    directoryId,
    sector: 'hotel',
    name: `Hôtel ${directoryId}`,
    websiteUrl: `https://${domain}/`,
    registrableDomain: domain,
    websiteKind: 'own' as const,
    stars: 3,
    sourceRefs: [{ source: 'atout-france', sourceId: directoryId }],
    createdAt: now,
    updatedAt: now,
  };
}

/** A prospect carrying one of everything archive must leave in place. */
async function prospectWithHistory(domain: string) {
  const prospect = await createProspectHub(connection!, {
    sector: 'hotel',
    name: `Archive fixture ${domain}`,
    websites: [
      { url: `https://${domain}/`, registrableDomain: domain, kind: 'own', primary: true },
    ],
    emails: [{ address: `contact@${domain}`, origin: 'operator' }],
    notes: 'Rappeler après la saison.',
    tradingName: 'Enrichi par l’opérateur',
  });
  const auditId = randomUUID();
  await createAuditModel(connection!).collection.insertOne({
    auditId,
    prospectId: prospect.prospectId,
  });
  await createFindingModel(connection!).collection.insertOne({ auditId, findingId: randomUUID() });
  await createReportModel(connection!).collection.insertOne({ auditId, reportId: randomUUID() });
  await createOutreachThreadModel(connection!).collection.insertOne({
    threadId: randomUUID(),
    prospectId: prospect.prospectId,
  });
  return { prospect, auditId };
}

describe.skipIf(!mongoAvailable)('prospect archive lifecycle', () => {
  it('archives without touching any attached record, and restores on the same prospectId', async () => {
    const { prospect, auditId } = await prospectWithHistory('archive-keeps.example');

    const archived = await archiveProspect(connection!, prospect.prospectId);
    expect(archived?.changed).toBe(true);
    const stored = await getProspectHub(connection!, prospect.prospectId);
    expect(stored?.archivedAt).toBeInstanceOf(Date);
    expect(stored).toMatchObject({
      name: prospect.name,
      status: prospect.status,
      notes: 'Rappeler après la saison.',
      tradingName: 'Enrichi par l’opérateur',
      emails: prospect.emails,
      fieldOrigins: prospect.fieldOrigins,
    });
    expect(await createAuditModel(connection!).countDocuments({ auditId })).toBe(1);
    expect(await createFindingModel(connection!).countDocuments({ auditId })).toBe(1);
    expect(await createReportModel(connection!).countDocuments({ auditId })).toBe(1);
    expect(
      await createOutreachThreadModel(connection!).countDocuments({
        prospectId: prospect.prospectId,
      }),
    ).toBe(1);

    const restored = await restoreProspect(connection!, prospect.prospectId);
    expect(restored?.changed).toBe(true);
    expect(restored?.prospect.prospectId).toBe(prospect.prospectId);
    expect(restored?.prospect.archivedAt).toBeUndefined();
    const events = await listProspectEvents(connection!, prospect.prospectId);
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['prospect-archived', 'prospect-restored']),
    );
  });

  it('is idempotent: a repeated archive or restore changes nothing and records no event', async () => {
    const prospect = await createProspectHub(connection!, { sector: 'hotel', name: 'Idempotent' });
    expect((await restoreProspect(connection!, prospect.prospectId))?.changed).toBe(false);
    expect((await archiveProspect(connection!, prospect.prospectId))?.changed).toBe(true);
    expect((await archiveProspect(connection!, prospect.prospectId))?.changed).toBe(false);
    const archivedEvents = (await listProspectEvents(connection!, prospect.prospectId)).filter(
      (event) => event.type === 'prospect-archived',
    );
    expect(archivedEvents).toHaveLength(1);
    expect(await archiveProspect(connection!, randomUUID())).toBeNull();
  });

  it('separates active and archived lists and keeps archived prospects out of work', async () => {
    const { prospect } = await prospectWithHistory('archive-lists.example');
    await archiveProspect(connection!, prospect.prospectId);

    const active = await listProspects(connection!, { q: 'archive-lists', pageSize: 100 });
    expect(active.rows.map((row) => row.prospectId)).not.toContain(prospect.prospectId);
    expect(active.archivedCount).toBe(1);
    const archive = await listProspects(connection!, {
      q: 'archive-lists',
      archived: true,
      pageSize: 100,
    });
    expect(archive.rows.map((row) => row.prospectId)).toEqual([prospect.prospectId]);
    const todo = await listProspectTodo(connection!);
    expect(todo.map((row) => row.prospectId)).not.toContain(prospect.prospectId);
  });

  it('keeps the directory link through archive and source refresh, and never re-adds the entry', async () => {
    const directoryId = `dir-${randomUUID()}`;
    await upsertDirectoryEntries(connection!, [directoryEntry(directoryId, 'dir-link.example')]);
    const [created] = await addDirectoryEntriesToProspects(connection!, [directoryId]);
    expect(created).toBeDefined();
    const [creation] = await listProspectEvents(connection!, created!.prospectId);
    expect(creation?.type).toBe('prospect-created');
    expect(creation?.payload).toMatchObject({ origin: 'directory', source: 'atout-france' });
    await archiveProspect(connection!, created!.prospectId);

    await upsertDirectoryEntries(connection!, [
      { ...directoryEntry(directoryId, 'dir-link.example'), name: 'Nom rafraîchi' },
    ]);
    const entry = await createDirectoryEntryModel(connection!).findOne({ directoryId }).lean();
    expect(entry?.prospectId).toBe(created!.prospectId);
    expect(entry?.name).toBe('Nom rafraîchi');

    const listed = await listDirectory(connection!, { q: 'Nom rafraîchi' });
    expect(listed.rows.find((row) => row.directoryId === directoryId)?.prospectState).toBe(
      'archived',
    );
    expect(await addDirectoryEntriesToProspects(connection!, [directoryId])).toEqual([]);

    await restoreProspect(connection!, created!.prospectId);
    const relisted = await listDirectory(connection!, { q: 'Nom rafraîchi' });
    expect(relisted.rows.find((row) => row.directoryId === directoryId)?.prospectState).toBe(
      'active',
    );
  });

  it('creates exactly one prospect when the same entry is added concurrently', async () => {
    const directoryId = `dir-${randomUUID()}`;
    await upsertDirectoryEntries(connection!, [directoryEntry(directoryId, 'dir-race.example')]);
    const results = await Promise.all([
      addDirectoryEntriesToProspects(connection!, [directoryId]),
      addDirectoryEntriesToProspects(connection!, [directoryId]),
      addDirectoryEntriesToProspects(connection!, [directoryId]),
    ]);
    const createdIds = results.flat().map((prospect) => prospect.prospectId);
    expect(createdIds).toHaveLength(1);
    const entry = await createDirectoryEntryModel(connection!).findOne({ directoryId }).lean();
    expect(entry?.prospectId).toBe(createdIds[0]);
  });

  it('counts the permanent-delete impact, then still cascades, unlinks, and keeps suppression', async () => {
    const directoryId = `dir-${randomUUID()}`;
    await upsertDirectoryEntries(connection!, [directoryEntry(directoryId, 'dir-delete.example')]);
    const [linked] = await addDirectoryEntriesToProspects(connection!, [directoryId]);
    const auditId = randomUUID();
    await createAuditModel(connection!).collection.insertOne({
      auditId,
      prospectId: linked!.prospectId,
    });
    await createFindingModel(connection!).collection.insertOne({
      auditId,
      findingId: randomUUID(),
    });
    await addSuppressionEntry(connection!, {
      domain: 'dir-delete.example',
      reasonCode: 'objection',
      reason: 'Demande de retrait',
    });
    await archiveProspect(connection!, linked!.prospectId);

    const impact = await countProspectDeletionImpact(connection!, linked!.prospectId);
    expect(impact).toMatchObject({ audits: 1, findings: 1 });
    expect(impact!.events).toBeGreaterThanOrEqual(1);
    // Counting removed nothing.
    expect(await createAuditModel(connection!).countDocuments({ auditId })).toBe(1);

    await deleteProspectPermanently(connection!, linked!.prospectId);
    expect(await getProspectHub(connection!, linked!.prospectId)).toBeNull();
    expect(await createAuditModel(connection!).countDocuments({ auditId })).toBe(0);
    expect(await createFindingModel(connection!).countDocuments({ auditId })).toBe(0);
    const entry = await createDirectoryEntryModel(connection!).findOne({ directoryId }).lean();
    expect(entry?.prospectId).toBeUndefined();
    expect(await isSuppressed(connection!, 'dir-delete.example')).toBe(true);
  });

  it('counts exactly what the cascade removes, including approvals and jobs linked by audit', async () => {
    const directoryId = `dir-${randomUUID()}`;
    await upsertDirectoryEntries(connection!, [directoryEntry(directoryId, 'dir-scope.example')]);
    const [linked] = await addDirectoryEntriesToProspects(connection!, [directoryId]);
    const prospectId = linked!.prospectId;
    const auditId = randomUUID();
    const otherAuditId = randomUUID();
    await createAuditModel(connection!).collection.insertOne({ auditId, prospectId });
    await createReportApprovalModel(connection!).collection.insertOne({ auditId });
    const Jobs = createJobModel(connection!).collection;
    await Jobs.insertMany([
      { jobId: randomUUID(), status: 'done', options: { prospectId } },
      { jobId: randomUUID(), status: 'done', auditId },
      { jobId: randomUUID(), status: 'done', auditIds: [otherAuditId, auditId] },
      { jobId: randomUUID(), status: 'done', auditId: otherAuditId },
    ]);

    expect(await countActiveProspectDeletionJobs(connection!, prospectId)).toBe(0);
    // Issue #383: a job stopped for operator input can recreate nothing.
    await Jobs.insertOne({ jobId: randomUUID(), status: 'needs-input', auditId });
    expect(await countActiveProspectDeletionJobs(connection!, prospectId)).toBe(0);
    await Jobs.deleteOne({ status: 'needs-input', auditId });
    await Jobs.insertOne({ jobId: randomUUID(), status: 'running', auditId });
    expect(await countActiveProspectDeletionJobs(connection!, prospectId)).toBe(1);
    await Jobs.deleteOne({ status: 'running', auditId });

    const impact = await countProspectDeletionImpact(connection!, prospectId);
    expect(impact).toMatchObject({ reportApprovals: 1, jobs: 3, directoryEntries: 1 });
    const deleted = await deleteProspectPermanently(connection!, prospectId);
    const { prospects, ...removed } = deleted!;
    expect(prospects).toBe(1);
    expect(removed).toEqual(impact);
    expect(await Jobs.countDocuments({ auditId: otherAuditId })).toBe(1);
  });

  it('leaves the prospect in place when a cascade step fails, so a retry finishes it', async () => {
    const prospect = await createProspectHub(connection!, {
      sector: 'hotel',
      name: 'Cascade Retry',
      websites: [
        {
          url: 'https://cascade-retry.example/',
          registrableDomain: 'cascade-retry.example',
          kind: 'own',
          primary: true,
        },
      ],
    });
    const Jobs = createJobModel(connection!);
    await Jobs.collection.insertOne({
      jobId: randomUUID(),
      status: 'done',
      options: { prospectId: prospect.prospectId },
    });
    const originalDeleteMany = Jobs.deleteMany;
    Jobs.deleteMany = (() => {
      throw new Error('job delete failed');
    }) as never;
    try {
      await expect(deleteProspectPermanently(connection!, prospect.prospectId)).rejects.toThrow(
        'job delete failed',
      );
    } finally {
      Jobs.deleteMany = originalDeleteMany;
    }
    expect(await getProspectHub(connection!, prospect.prospectId)).not.toBeNull();

    const retried = await deleteProspectPermanently(connection!, prospect.prospectId);
    expect(retried).toMatchObject({ prospects: 1, jobs: 1 });
  });
});
