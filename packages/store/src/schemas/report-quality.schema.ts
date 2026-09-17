import { Schema, type Connection, type Model } from 'mongoose';
import type {
  ReportBundleState,
  ReportQualityModelCall,
  Sha256Digest,
} from '@odysseus/core';

export interface ReportQualityLeaseDocument {
  auditId: string;
  qualityRunId: string;
  leaseTokenHash: Sha256Digest;
  leaseExpiresAt: Date;
  epoch: number;
}

const reportQualityLeaseSchema = new Schema<ReportQualityLeaseDocument>(
  {
    auditId: { type: String, required: true },
    qualityRunId: { type: String, required: true },
    leaseTokenHash: { type: String, required: true },
    leaseExpiresAt: { type: Date, required: true },
    epoch: { type: Number, required: true },
  },
  { collection: 'reportQualityLeases' },
);
reportQualityLeaseSchema.index({ auditId: 1 }, { unique: true });

export interface ReportQualityRunDocument {
  qualityRunId: string;
  auditId: string;
  epoch: number;
  leaseTokenHash: Sha256Digest;
  state: ReportBundleState;
  inputSnapshotDigest?: Sha256Digest;
  approvedEvidenceDigest?: Sha256Digest;
  modelCalls: ReportQualityModelCall[];
  candidateDigests: Sha256Digest[];
  operatorApprovalBundleDigest?: Sha256Digest;
  errorCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const reportQualityRunSchema = new Schema<ReportQualityRunDocument>(
  {
    qualityRunId: { type: String, required: true },
    auditId: { type: String, required: true },
    epoch: { type: Number, required: true },
    leaseTokenHash: { type: String, required: true },
    state: { type: String, required: true },
    inputSnapshotDigest: { type: String },
    approvedEvidenceDigest: { type: String },
    modelCalls: { type: [Schema.Types.Mixed], default: [] },
    candidateDigests: { type: [String], default: [] },
    operatorApprovalBundleDigest: { type: String },
    errorCode: { type: String },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'reportQualityRuns' },
);
reportQualityRunSchema.index({ qualityRunId: 1 }, { unique: true });
reportQualityRunSchema.index({ auditId: 1, createdAt: -1 });

export interface StoredLanguageCandidate {
  pdfDigest: Sha256Digest;
  candidatePath: string;
  pageCount: number;
  objectKey?: string;
}

export interface ReportBundleDocument {
  bundleId: string;
  qualityRunId: string;
  auditId: string;
  epoch: number;
  bundleDigest: Sha256Digest;
  inputSnapshotDigest: Sha256Digest;
  approvedEvidenceDigest: Sha256Digest;
  fr: StoredLanguageCandidate;
  en: StoredLanguageCandidate;
  state: Extract<
    ReportBundleState,
    'quality-approved' | 'awaiting-operator-approval' | 'operator-approved' | 'promoted'
  >;
  operatorApprovedAt?: Date;
  promotedAt?: Date;
  createdAt: Date;
}

const languageCandidateSchema = new Schema<StoredLanguageCandidate>(
  {
    pdfDigest: { type: String, required: true },
    candidatePath: { type: String, required: true },
    pageCount: { type: Number, required: true },
    objectKey: { type: String },
  },
  { _id: false },
);

const reportBundleSchema = new Schema<ReportBundleDocument>(
  {
    bundleId: { type: String, required: true },
    qualityRunId: { type: String, required: true },
    auditId: { type: String, required: true },
    epoch: { type: Number, required: true },
    bundleDigest: { type: String, required: true },
    inputSnapshotDigest: { type: String, required: true },
    approvedEvidenceDigest: { type: String, required: true },
    fr: { type: languageCandidateSchema, required: true },
    en: { type: languageCandidateSchema, required: true },
    state: { type: String, required: true },
    operatorApprovedAt: { type: Date },
    promotedAt: { type: Date },
    createdAt: { type: Date, required: true },
  },
  { collection: 'reportBundles' },
);
reportBundleSchema.index({ bundleId: 1 }, { unique: true });
reportBundleSchema.index({ bundleDigest: 1 }, { unique: true });
reportBundleSchema.index({ auditId: 1, createdAt: -1 });

export interface ActiveReportBundleDocument {
  auditId: string;
  bundleId: string;
  qualityRunId: string;
  bundleDigest: Sha256Digest;
  epoch: number;
  revision: number;
  fr: { pdfDigest: Sha256Digest; objectKey: string };
  en: { pdfDigest: Sha256Digest; objectKey: string };
  activatedAt: Date;
}

const activeLanguageSchema = new Schema(
  {
    pdfDigest: { type: String, required: true },
    objectKey: { type: String, required: true },
  },
  { _id: false },
);

const activeReportBundleSchema = new Schema<ActiveReportBundleDocument>(
  {
    auditId: { type: String, required: true },
    bundleId: { type: String, required: true },
    qualityRunId: { type: String, required: true },
    bundleDigest: { type: String, required: true },
    epoch: { type: Number, required: true },
    revision: { type: Number, required: true },
    fr: { type: activeLanguageSchema, required: true },
    en: { type: activeLanguageSchema, required: true },
    activatedAt: { type: Date, required: true },
  },
  { collection: 'activeReportBundles' },
);
activeReportBundleSchema.index({ auditId: 1 }, { unique: true });

export function createReportQualityLeaseModel(
  connection: Connection,
): Model<ReportQualityLeaseDocument> {
  return (
    connection.models['ReportQualityLease'] ??
    connection.model<ReportQualityLeaseDocument>('ReportQualityLease', reportQualityLeaseSchema)
  );
}

export function createReportQualityRunModel(
  connection: Connection,
): Model<ReportQualityRunDocument> {
  return (
    connection.models['ReportQualityRun'] ??
    connection.model<ReportQualityRunDocument>('ReportQualityRun', reportQualityRunSchema)
  );
}

export function createReportBundleModel(connection: Connection): Model<ReportBundleDocument> {
  return (
    connection.models['ReportBundle'] ??
    connection.model<ReportBundleDocument>('ReportBundle', reportBundleSchema)
  );
}

export function createActiveReportBundleModel(
  connection: Connection,
): Model<ActiveReportBundleDocument> {
  return (
    connection.models['ActiveReportBundle'] ??
    connection.model<ActiveReportBundleDocument>('ActiveReportBundle', activeReportBundleSchema)
  );
}
