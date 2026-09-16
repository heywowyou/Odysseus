/**
 * Mongoose schema for the `suppression` collection: opt-outs, permanent,
 * never subject to the 90 day retention policy that applies to
 * prospects.schema.ts. See docs/rules/prospect-qualification.md section 7: "An
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
import type { SuppressionReasonCode } from '@odysseus/core';

/** Placeholder `addressKey` for a domain-only suppression. Not a valid hash
 *  output, so it can never collide with a real address hash. */
export const DOMAIN_ONLY_ADDRESS_KEY = 'domain-only';

export interface SuppressionDocumentFields {
  suppressionId: string;
  domainHash: string;
  addressHash?: string;
  /** The address part of the idempotency key: `addressHash` for an address
   *  suppression, `DOMAIN_ONLY_ADDRESS_KEY` for a domain-only one. Absent on
   *  rows written before the key existed. */
  addressKey?: string;
  reasonCode: SuppressionReasonCode;
  reason: string;
  createdAt: Date;
}

export type SuppressionDocument = SuppressionDocumentFields;

const suppressionSchema = new Schema<SuppressionDocument>(
  {
    suppressionId: { type: String, required: true, unique: true },
    domainHash: { type: String, required: true },
    addressHash: { type: String },
    addressKey: { type: String },
    reasonCode: {
      type: String,
      required: true,
      enum: ['objection', 'hard-bounce', 'sequence-complete', 'operator-request'],
    },
    reason: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { collection: 'suppression' },
);

suppressionSchema.index({ domainHash: 1 });
suppressionSchema.index({ addressHash: 1 }, { sparse: true });
// Idempotency: a retried objection or bounce-confirm for the same cause must
// not write a second row. One unique key covers both shapes: addressKey is the
// address hash, or the literal DOMAIN_ONLY_ADDRESS_KEY placeholder for a
// domain-only row, so neither shape needs a "field is missing" filter.
// MongoDB partial indexes cannot express `$exists: false`; an index declared
// that way fails to build, and Mongoose's auto-index swallows the error. The
// partial filter here is `$exists: true`, which is supported, and only keeps
// rows written before addressKey existed out of the index instead of making
// the build fail on them.
suppressionSchema.index(
  { domainHash: 1, addressKey: 1, reasonCode: 1 },
  { unique: true, partialFilterExpression: { addressKey: { $exists: true } } },
);

export function createSuppressionModel(connection: Connection): Model<SuppressionDocument> {
  return (
    connection.models['Suppression'] ??
    connection.model<SuppressionDocument>('Suppression', suppressionSchema)
  );
}
