import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { clearAuditGradeOverride, getAuditGradeOverride, setAuditGradeOverride } from './audits.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

async function insertAudit(auditId: string): Promise<void> {
  await connection!.db!.collection('audits').insertOne({
    auditId,
    kind: 'audit',
    siteUrl: 'https://grade-override.example/',
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

describe.skipIf(!mongoAvailable)('audit grade override persistence', () => {
  it('sets and replaces one reviewed override with the current operator stamp', async () => {
    const auditId = `grade-override-${randomUUID()}`;
    const audits = connection!.db!.collection('audits');
    await insertAudit(auditId);
    try {
      await expect(getAuditGradeOverride(connection!, auditId)).resolves.toBeUndefined();

      const first = await setAuditGradeOverride(connection!, auditId, {
        grade: 'D',
        reason: 'The audit requires substantial remediation.',
      });
      expect(first).toMatchObject({
        grade: 'D',
        reason: 'The audit requires substantial remediation.',
        reviewedBy: 'operator',
      });
      expect(first.reviewedAt).toBeInstanceOf(Date);

      const replacement = await setAuditGradeOverride(connection!, auditId, {
        grade: 'B',
        reason: 'The material risks are now contained.',
      });
      expect(replacement).toMatchObject({
        grade: 'B',
        reason: 'The material risks are now contained.',
        reviewedBy: 'operator',
      });
      expect(replacement.reviewedAt).toBeInstanceOf(Date);
      await expect(getAuditGradeOverride(connection!, auditId)).resolves.toEqual(replacement);
    } finally {
      await audits.deleteOne({ auditId });
    }
  });

  it('clears the override instead of persisting an empty record', async () => {
    const auditId = `grade-override-clear-${randomUUID()}`;
    const audits = connection!.db!.collection('audits');
    await insertAudit(auditId);
    try {
      await setAuditGradeOverride(connection!, auditId, {
        grade: 'C',
        reason: 'Operator-reviewed grade.',
      });

      await clearAuditGradeOverride(connection!, auditId);

      await expect(getAuditGradeOverride(connection!, auditId)).resolves.toBeUndefined();
      const audit = await audits.findOne({ auditId });
      expect(audit).not.toHaveProperty('gradeOverride');
    } finally {
      await audits.deleteOne({ auditId });
    }
  });

  it('reports a missing audit when setting or clearing an override', async () => {
    const auditId = `missing-grade-override-${randomUUID()}`;

    await expect(
      setAuditGradeOverride(connection!, auditId, { grade: 'A', reason: 'No audit exists.' }),
    ).rejects.toThrow(`odysseus: audit ${auditId} not found`);
    await expect(clearAuditGradeOverride(connection!, auditId)).rejects.toThrow(
      `odysseus: audit ${auditId} not found`,
    );
  });
});
