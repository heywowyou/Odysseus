/**
 * Persists a completed audit: upserts the audit document by auditId, then
 * replaces its finding set through keyed upserts and obsolete-row cleanup.
 * Replacing rather than inserting means a retried `audit` invocation (same
 * auditId) is idempotent and cannot retain findings absent from the retry.
 */

import type { Connection } from 'mongoose';
import type { AuditManifest, FindingsDeltaCoverage, Finding } from '@odysseus/core';
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
  /** Plan 059 step 35: the run's evidence coverage signature, from the
   *  audit's assembled evidence graph. Absent when the graph was never
   *  assembled, which leaves the audit without a stored signature and the
   *  re-audit delta with nothing to claim observability from. */
  evidenceCoverage?: FindingsDeltaCoverage,
): Promise<void> {
  const AuditModel = createAuditModel(connection);
  const FindingModel = createFindingModel(connection);

  await AuditModel.findOneAndUpdate(
    { auditId: manifest.auditId },
    {
      $set: {
        ...toAuditDocumentFields(manifest),
        ...(evidenceCoverage !== undefined ? { evidenceCoverage } : {}),
      },
      /* A retried stage that re-persists without a graph removes any
       * signature from an earlier assembly: an audit whose record claims
       * observability its surviving evidence cannot show would hand the
       * re-audit delta a comparability nobody can verify. */
      ...(evidenceCoverage === undefined ? { $unset: { evidenceCoverage: 1 } } : {}),
    },
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
