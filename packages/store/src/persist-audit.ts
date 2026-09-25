/**
 * Persists a completed audit: upserts the audit document by auditId, then
 * replaces its finding set through keyed upserts and obsolete-row cleanup.
 * Replacing rather than inserting means a retried `audit` invocation (same
 * auditId) is idempotent and cannot retain findings absent from the retry.
 */

import type { Connection } from 'mongoose';
import type { AuditManifest, FindingsDeltaCoverage, Finding, Severity } from '@odysseus/core';
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
  /** Issue #508: the report's primary-population severity counts for these
   *  findings, stored with them for the Audits list. The caller computes
   *  it (@odysseus/report's primarySeverityRollup); without it, or without
   *  a findings digest to key it to, any older rollup is removed. */
  primarySeverityRollup?: Record<Severity, number>,
): Promise<void> {
  const AuditModel = createAuditModel(connection);
  const FindingModel = createFindingModel(connection);

  const findingsDigest = manifest.findingsProvenance?.findingsDigest;
  const storedRollup =
    primarySeverityRollup !== undefined && findingsDigest !== undefined
      ? { ...primarySeverityRollup, findingsDigest }
      : undefined;
  /* A retried stage that re-persists without a graph removes any
   * signature from an earlier assembly: an audit whose record claims
   * observability its surviving evidence cannot show would hand the
   * re-audit delta a comparability nobody can verify. */
  const unset = {
    ...(evidenceCoverage === undefined ? { evidenceCoverage: 1 } : {}),
    ...(storedRollup === undefined ? { primarySeverityRollup: 1 } : {}),
  };
  await AuditModel.findOneAndUpdate(
    { auditId: manifest.auditId },
    {
      $set: {
        ...toAuditDocumentFields(manifest),
        ...(evidenceCoverage !== undefined ? { evidenceCoverage } : {}),
        ...(storedRollup !== undefined ? { primarySeverityRollup: storedRollup } : {}),
      },
      ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
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
