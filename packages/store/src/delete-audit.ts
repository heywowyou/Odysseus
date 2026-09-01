/**
 * Deletion of one audit and every derived document that names it, plus the
 * queue-history unlinking the audits page needs. persist-audit upserts and
 * persist-analysis/persist-report insert (trade-off 5), so a scan fans out
 * across five collections (audits, findings, analyses, reports,
 * reportApprovals); centralizing the cascade here keeps that fan-out in
 * store, where the collection names live, instead of scattering
 * Mongoose deletes through the interface package.
 *
 * The audit's artifacts directory is deliberately NOT this function's job:
 * store has no filesystem root (package boundary), so the route layer
 * removes it after the documents are gone.
 */

import type { Connection } from 'mongoose';
import { createAnalysisModel } from './schemas/analysis.schema.js';
import { createAuditModel } from './schemas/audit.schema.js';
import { createFindingModel } from './schemas/finding.schema.js';
import { createReportApprovalModel } from './schemas/report-approval.schema.js';
import { createReportModel } from './schemas/report.schema.js';

export interface AuditCascadeCounts {
  audits: number;
  findings: number;
  analyses: number;
  reports: number;
  reportApprovals: number;
}

export async function deleteAuditCascade(
  connection: Connection,
  auditId: string,
): Promise<AuditCascadeCounts> {
  const [audits, findings, analyses, reports, reportApprovals] = await Promise.all([
    createAuditModel(connection).deleteOne({ auditId }).exec(),
    createFindingModel(connection).deleteMany({ auditId }).exec(),
    createAnalysisModel(connection).deleteMany({ auditId }).exec(),
    createReportModel(connection).deleteMany({ auditId }).exec(),
    createReportApprovalModel(connection).deleteMany({ auditId }).exec(),
  ]);
  return {
    audits: audits.deletedCount,
    findings: findings.deletedCount,
    analyses: analyses.deletedCount,
    reports: reports.deletedCount,
    reportApprovals: reportApprovals.deletedCount,
  };
}
