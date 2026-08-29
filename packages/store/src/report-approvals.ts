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

export function approvalMatchesReportPair(
  approval: ReportApprovalDocument | null,
  reports: {
    fr: { reportId?: string; pdfDigest?: string };
    en: { reportId?: string; pdfDigest?: string };
  },
): boolean {
  return Boolean(
    approval &&
    reports.fr.reportId &&
    reports.en.reportId &&
    approval.fr.reportId === reports.fr.reportId &&
    approval.fr.pdfDigest === reports.fr.pdfDigest &&
    approval.en.reportId === reports.en.reportId &&
    approval.en.pdfDigest === reports.en.pdfDigest,
  );
}
