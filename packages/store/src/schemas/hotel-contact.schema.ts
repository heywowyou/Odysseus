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
 * `cohortId` is denormalized from the score cohort so this document is readable
 * on its own, and so plan 014 can ask which cohort a contacted hotel belonged
 * to without reconstructing the selection that produced it.
 *
 * Subject to the 90 day operational retention policy (binding decision 12), via
 * the precomputed `expiresAt` pattern every other 9c collection uses.
 *
 * What this schema deliberately has no place for: a named contact, a phone
 * number, a free-mail address, a catch-all verdict, or any field a verification
 * vendor would populate. The absence is the design - see
 * docs/rules/prospect-qualification.md section 6.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type {
  ContactSourceKind,
  HotelContactReason,
  HotelContactState,
  MailDomainStatus,
} from '@odysseus/core';

export interface HotelContactDocumentFields {
  contactId: string;
  candidateId: string;
  cohortId: string;
  contactVersion: string;
  domain: string;
  state: HotelContactState;
  reason: HotelContactReason;
  address?: string;
  localPart?: string;
  source?: ContactSourceKind;
  sourceUrl?: string;
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
    cohortId: { type: String, required: true },
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
