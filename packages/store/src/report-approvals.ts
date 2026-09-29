import type { ClientSession, Connection } from 'mongoose';
import {
  createReportApprovalModel,
  type ReportApprovalDocument,
  type ReportApprovalDocumentFields,
} from './schemas/report-approval.schema.js';

export async function persistReportApproval(
  connection: Connection,
  fields: ReportApprovalDocumentFields,
  session?: ClientSession,
): Promise<void> {
  const Model = createReportApprovalModel(connection);
  await Model.create([fields], session ? { session } : undefined);
}

export async function getLatestReportApproval(
  connection: Connection,
  auditId: string,
): Promise<ReportApprovalDocument | null> {
  return createReportApprovalModel(connection)
    .findOne({ auditId })
    .sort({ approvedAt: -1 })
    .lean<ReportApprovalDocument>();
}
