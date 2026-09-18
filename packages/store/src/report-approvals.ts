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

/**
 * French approval is sufficient for the canonical report. When the approval
 * also contains English, that attachment must match too. Historical callers
 * can keep using the old function name.
 */
export function approvalMatchesReportPair(
  approval: ReportApprovalDocument | null,
  reports: {
    fr: { reportId?: string; pdfDigest?: string };
    en?: { reportId?: string; pdfDigest?: string };
  },
): boolean {
  if (
    !approval ||
    !reports.fr.reportId ||
    approval.fr.reportId !== reports.fr.reportId ||
    approval.fr.pdfDigest !== reports.fr.pdfDigest
  ) {
    return false;
  }
  if (approval.en === undefined) return true;
  return Boolean(
    reports.en?.reportId &&
      approval.en.reportId === reports.en.reportId &&
      approval.en.pdfDigest === reports.en.pdfDigest,
  );
}
