import { Schema, type Connection, type Model } from 'mongoose';

export interface ReferenceAuditLinkDocumentFields {
  linkId: string;
  tokenHash: string;
  prospectId: string;
  threadId: string;
  draftId?: string;
  registrableDomain: string;
  roleAddress: string;
  referenceVersion: string;
  createdAt: Date;
  expiresAt: Date;
  firstRequestedAt?: Date;
  lastRequestedAt?: Date;
  requestCount: number;
}

export type ReferenceAuditLinkDocument = ReferenceAuditLinkDocumentFields;

const referenceAuditLinkSchema = new Schema<ReferenceAuditLinkDocument>(
  {
    linkId: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true, unique: true },
    prospectId: { type: String, required: true },
    threadId: { type: String, required: true },
    draftId: { type: String },
    registrableDomain: { type: String, required: true },
    roleAddress: { type: String, required: true },
    referenceVersion: { type: String, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    firstRequestedAt: { type: Date },
    lastRequestedAt: { type: Date },
    requestCount: { type: Number, required: true, min: 0, default: 0 },
  },
  { collection: 'reference_audit_links', minimize: false },
);

referenceAuditLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
referenceAuditLinkSchema.index({ prospectId: 1, createdAt: -1 });

export function createReferenceAuditLinkModel(
  connection: Connection,
): Model<ReferenceAuditLinkDocument> {
  return (
    connection.models['ReferenceAuditLink'] ??
    connection.model<ReferenceAuditLinkDocument>('ReferenceAuditLink', referenceAuditLinkSchema)
  );
}
