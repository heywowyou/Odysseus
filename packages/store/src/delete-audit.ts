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
import { createJobModel } from './schemas/job.schema.js';
import { createProspectHubModel } from './schemas/prospect-hub.schema.js';
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

/** Issue #381: the single-site scan jobs that produced an audit being purged
 *  by archive retention. Without them the Audits page would keep history rows
 *  linking to an audit that no longer exists. Multi-site batch jobs are left
 *  alone (they name other prospects' audits too), and a queued or running job
 *  is never removed here: the caller's active-job guard refuses first. */
export async function deleteFinishedScanJobsForAudit(
  connection: Connection,
  auditId: string,
): Promise<number> {
  const result = await createJobModel(connection)
    .deleteMany({
      auditId,
      type: { $in: ['full-audit', 'quick-check', 'prospecting-audit', 'outreach-full-scan'] },
      status: { $nin: ['queued', 'running'] },
    })
    .exec();
  return result.deletedCount;
}

/** Issue #381: archived prospects that still own audits - archived before
 *  archive purged scan storage, or whose purge stopped part-way. The purge
 *  itself is the interface's `purgeProspectAuditStorage`; this only finds
 *  the work, so the reconciliation and the archive action cannot drift. */
export async function listArchivedProspectsWithAudits(
  connection: Connection,
): Promise<{ prospectId: string; name: string; audits: number }[]> {
  const archived = await createProspectHubModel(connection)
    .find({ archivedAt: { $exists: true } })
    .select({ prospectId: 1, name: 1, _id: 0 })
    .lean<{ prospectId: string; name: string }[]>();
  if (archived.length === 0) return [];
  const counts = await createAuditModel(connection).aggregate<{ _id: string; audits: number }>([
    { $match: { prospectId: { $in: archived.map((prospect) => prospect.prospectId) } } },
    { $group: { _id: '$prospectId', audits: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((row) => [row._id, row.audits]));
  return archived
    .filter((prospect) => byId.has(prospect.prospectId))
    .map((prospect) => ({ ...prospect, audits: byId.get(prospect.prospectId)! }));
}
