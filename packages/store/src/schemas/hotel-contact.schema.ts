/**
 * Mongoose schema for the `hotel_contacts` collection, milestone 9c plan 007.
 * One document per contact evaluation of one cohort member at one contact
 * version.
 *
 * Upserted on (contactVersion, candidateId) rather than inserted, following
 * hotel-qualification.schema.ts rather than hotel-source-record.schema.ts. The
 * distinction is what a re-run means: a second pass over a bounded cohort is a
 * retry of an interrupted batch, and inserting again would make the coverage
 * report count the same hotel twice. A changed rule is a new contactVersion,
 * which is a new document beside the old one.
 *
 * `cohortId` is denormalized from the score cohort for discovered contacts.
 * Plan 045's `manual-v1` override is candidate-scoped: when there is a
 * discovered row to inherit from it keeps that cohort, otherwise the field is
 * absent rather than populated with a synthetic cohort id.
 *
 * Subject to the 90 day operational retention policy (binding decision 12), via
 * the precomputed `expiresAt` pattern every other 9c collection uses.
 *
 * Automated discovery still has no path for named or free-mail addresses. Plan
 * 045 adds a separate operator-entered override, with an explicit per-record
 * origin and a timestamped free-mail attestation when that exception is used.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type {
  ContactSourceKind,
  HotelContactAddressOrigin,
  HotelContactReason,
  HotelContactState,
  MailDomainStatus,
} from '@odysseus/core';

export interface HotelContactDocumentFields {
  contactId: string;
  candidateId: string;
  cohortId?: string;
  contactVersion: string;
  domain: string;
  state: HotelContactState;
  reason: HotelContactReason;
  address?: string;
  localPart?: string;
  source?: ContactSourceKind;
  sourceUrl?: string;
  addressOrigin?: HotelContactAddressOrigin;
  freeMailAttestedAt?: Date;
  mxStatus: MailDomainStatus;
  validatedAt: Date;
  createdAt: Date;
  expiresAt: Date;
}

export type HotelContactDocument = HotelContactDocumentFields;

const hotelContactSchema = new Schema<HotelContactDocument>(
  {
    contactId: { type: String, required: true, unique: true },
    candidateId: { type: String, required: true },
    cohortId: { type: String, required: false },
    contactVersion: { type: String, required: true },
    domain: { type: String, required: true },
    state: {
      type: String,
      required: true,
      enum: ['found', 'parked', 'rejected', 'suppressed'],
    },
    // Reasons as plain strings, the choice hotel-qualification.schema.ts
    // records: a hard Mongoose enum is what made prospect.schema.ts unable to
    // accept a later stage's vocabulary without a migration. The authority is
    // the union in @odysseus/core, checked at compile time on every write.
    reason: { type: String, required: true },
    address: { type: String, required: false },
    localPart: { type: String, required: false },
    source: { type: String, required: false },
    sourceUrl: { type: String, required: false },
    addressOrigin: { type: String, required: false },
    freeMailAttestedAt: { type: Date, required: false },
    mxStatus: { type: String, required: true, enum: ['has-mx', 'no-mx', 'unknown'] },
    validatedAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'hotel_contacts', minimize: false },
);

/** The idempotency mechanism: one contact evaluation per candidate per version. */
hotelContactSchema.index({ contactVersion: 1, candidateId: 1 }, { unique: true });
hotelContactSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
hotelContactSchema.index({ contactVersion: 1, state: 1 });
hotelContactSchema.index({ cohortId: 1 });

export function createHotelContactModel(connection: Connection): Model<HotelContactDocument> {
  return (
    connection.models['HotelContact'] ??
    connection.model<HotelContactDocument>('HotelContact', hotelContactSchema)
  );
}
