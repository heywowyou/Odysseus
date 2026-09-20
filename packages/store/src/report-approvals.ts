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
/**
 * Whether one language's report is the exact one that approval covers.
 *
 * Distinct from approvalMatchesReportPair on purpose. That asks "does this
 * approval cover this whole pair", which is the right question when approving
 * and when reporting an audit's lifecycle. Delivering a single language is a
 * narrower question, and asking the pair question there made a bilingual
 * audit's French report undeliverable: the stored approval carried an English
 * attachment, the French delivery path passed no English report to compare it
 * against, and the pair check therefore refused an approval that does cover
 * the French report being served.
 */
export function approvalCoversReport(
  approval: ReportApprovalDocument | null,
  language: 'fr' | 'en',
  report: { reportId?: string; pdfDigest?: string },
): boolean {
  if (!approval || !report.reportId) return false;
  const approved = language === 'fr' ? approval.fr : approval.en;
  return (
    approved !== undefined &&
    approved.reportId === report.reportId &&
    approved.pdfDigest === report.pdfDigest
  );
}

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
