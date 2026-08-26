/**
 * Persists a completed audit: upserts the audit document by auditId, then
 * replaces its finding set through keyed upserts and obsolete-row cleanup.
 * Replacing rather than inserting means a retried `audit` invocation (same
 * auditId) is idempotent and cannot retain findings absent from the retry.
 */

import type { Connection } from 'mongoose';
import type { AuditManifest, Finding } from '@odysseus/core';
import { createAuditModel, type AuditDocumentFields } from './schemas/audit.schema.js';
import { createFindingModel } from './schemas/finding.schema.js';

function toAuditDocumentFields(manifest: AuditManifest): AuditDocumentFields {
  const { startedAt, finishedAt, renormalizedAt, ...rest } = manifest;
  return {
    ...rest,
    startedAt: new Date(startedAt),
    finishedAt: new Date(finishedAt),
    ...(renormalizedAt !== undefined ? { renormalizedAt: new Date(renormalizedAt) } : {}),
  };
}

export async function persistAudit(
  connection: Connection,
  manifest: AuditManifest,
  findings: readonly Finding[],
): Promise<void> {
  const AuditModel = createAuditModel(connection);
  const FindingModel = createFindingModel(connection);

  await AuditModel.findOneAndUpdate(
    { auditId: manifest.auditId },
    { $set: toAuditDocumentFields(manifest) },
    { upsert: true },
  );

  if (findings.length === 0) {
    await FindingModel.deleteMany({ auditId: manifest.auditId });
    return;
  }

  await FindingModel.bulkWrite(
    findings.map((finding) => ({
      updateOne: {
        filter: { auditId: finding.auditId, dedupeKey: finding.dedupeKey },
        update: { $set: { ...finding, siteUrl: manifest.siteUrl } },
        upsert: true,
      },
    })),
  );

  await FindingModel.deleteMany({
    auditId: manifest.auditId,
    dedupeKey: { $nin: findings.map((finding) => finding.dedupeKey) },
  });
}
