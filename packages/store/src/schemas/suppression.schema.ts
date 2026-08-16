/**
 * Mongoose schema for the `suppression` collection: opt-outs, permanent,
 * never subject to the 90 day retention policy that applies to
 * prospects.schema.ts. See docs/prospect-qualification.md section 7: "An
 * opt-out must survive deletion of everything else about that prospect,
 * or the deletion policy silently resurrects them."
 *
 * DO NOT add a TTL index or an `expiresAt` field to this schema under any
 * circumstance. The 90 day exemption is architectural, not a flag: this
 * is a structurally separate collection/schema file a prospects-focused
 * refactor cannot accidentally touch.
 *
 * Stores hashes only (domain/address hashed via
 * @odysseus/core's suppression-hash.ts), never the raw value - a
 * suppression list existing specifically to *stop* contact should not
 * itself become a second store of the same personal data.
 */

import { Schema, type Connection, type Model } from 'mongoose';

export interface SuppressionDocumentFields {
  suppressionId: string;
  domainHash: string;
  addressHash?: string;
  reason: string;
  createdAt: Date;
}

export type SuppressionDocument = SuppressionDocumentFields;

const suppressionSchema = new Schema<SuppressionDocument>(
  {
    suppressionId: { type: String, required: true, unique: true },
    domainHash: { type: String, required: true },
    addressHash: { type: String },
    reason: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'suppression' },
);

suppressionSchema.index({ domainHash: 1 });
suppressionSchema.index({ addressHash: 1 }, { sparse: true });

export function createSuppressionModel(connection: Connection): Model<SuppressionDocument> {
  return connection.models['Suppression'] ?? connection.model<SuppressionDocument>('Suppression', suppressionSchema);
}
