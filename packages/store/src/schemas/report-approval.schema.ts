import { Schema, type Connection, type Model } from 'mongoose';

export interface ApprovedReportRef {
  reportId: string;
  pdfDigest: string;
}

export interface ReportApprovalDocumentFields {
  approvalId: string;
  auditId: string;
  fr: ApprovedReportRef;
  en: ApprovedReportRef;
  approvedAt: Date;
}

export type ReportApprovalDocument = ReportApprovalDocumentFields;

const reportRefSchema = new Schema<ApprovedReportRef>(
  {
    reportId: { type: String, required: true },
    pdfDigest: { type: String, required: true },
  },
  { _id: false },
);

const reportApprovalSchema = new Schema<ReportApprovalDocument>(
  {
    approvalId: { type: String, required: true },
    auditId: { type: String, required: true },
    fr: { type: reportRefSchema, required: true },
    en: { type: reportRefSchema, required: true },
    approvedAt: { type: Date, required: true },
  },
  { collection: 'reportApprovals' },
);

reportApprovalSchema.index({ approvalId: 1 }, { unique: true });
reportApprovalSchema.index({ auditId: 1, approvedAt: -1 });

export function createReportApprovalModel(connection: Connection): Model<ReportApprovalDocument> {
  return (
    connection.models['ReportApproval'] ??
    connection.model<ReportApprovalDocument>('ReportApproval', reportApprovalSchema)
  );
}
