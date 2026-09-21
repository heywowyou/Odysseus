import { Schema, type Connection, type Model } from 'mongoose';

export interface ApprovedReportRef {
  reportId: string;
  pdfDigest: string;
  /** Optional light sibling digest. Legacy approvals remain dark-only. */
  variantDigests?: {
    light?: string;
  };
}

export interface ReportApprovalDocumentFields {
  approvalId: string;
  auditId: string;
  /** French is the canonical deliverable. */
  fr: ApprovedReportRef;
  /** Optional English attachment, Plan 067. Legacy bilingual rows still populate it. */
  en?: ApprovedReportRef;
  approvedAt: Date;
}

export type ReportApprovalDocument = ReportApprovalDocumentFields;

const reportRefSchema = new Schema<ApprovedReportRef>(
  {
    reportId: { type: String, required: true },
    pdfDigest: { type: String, required: true },
    variantDigests: {
      _id: false,
      type: {
        light: { type: String },
      },
    },
  },
  { _id: false },
);

const reportApprovalSchema = new Schema<ReportApprovalDocument>(
  {
    approvalId: { type: String, required: true },
    auditId: { type: String, required: true },
    fr: { type: reportRefSchema, required: true },
    en: { type: reportRefSchema },
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
