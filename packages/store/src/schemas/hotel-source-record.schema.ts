/**
 * Mongoose schema for the `hotel_source_records` collection, milestone 9c.
 * Insert-only for the same reason as schemas/prospect.schema.ts: a quarterly
 * refresh of a national source is a new observation of an establishment, not
 * a correction of the previous one, and the two must stay separately readable
 * so a later disagreement between source versions is visible rather than
 * overwritten.
 *
 * Subject to the 90 day operational retention policy, via the same precomputed
 * `expiresAt` + `expireAfterSeconds: 0` pattern prospect.schema.ts chose over a
 * raw TTL on `createdAt`.
 *
 * This collection holds establishment facts, never contact addresses. A source
 * row that happens to carry an email is not promoted here; role-address
 * discovery is a separate, allowlist-enforcing stage.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type {
  HotelCatalogueSourceName,
  HotelCampaignEligibility,
  HotelStarRating,
} from '@odysseus/core';

export interface HotelSourceRecordDocumentFields {
  /** Groups every record written by one ingest run, so a run can be counted,
   *  compared against its yield report, or excluded wholesale. */
  ingestRunId: string;
  source: HotelCatalogueSourceName;
  sourceId: string;
  sourceVersion: string;
  retrievedAt: Date;
  licence: string;
  name: string;
  address?: string;
  postcode?: string;
  commune?: string;
  declaredWebsite?: string;
  accommodationType: string;
  starRating?: HotelStarRating;
  roomCount?: number;
  capacity?: number;
  /** Stored rather than recomputed on read: the campaign threshold is a
   *  recorded operator decision, so which rows a given run considered eligible
   *  must stay answerable even if that decision later changes. */
  campaignEligibility: HotelCampaignEligibility;
  warnings: string[];
  createdAt: Date;
  expiresAt: Date;
}

export type HotelSourceRecordDocument = HotelSourceRecordDocumentFields;

const hotelSourceRecordSchema = new Schema<HotelSourceRecordDocument>(
  {
    ingestRunId: { type: String, required: true },
    source: { type: String, required: true, enum: ['atout-france', 'datatourisme'] },
    sourceId: { type: String, required: true },
    sourceVersion: { type: String, required: true },
    retrievedAt: { type: Date, required: true },
    licence: { type: String, required: true },
    name: { type: String, required: true },
    address: { type: String },
    postcode: { type: String },
    commune: { type: String },
    declaredWebsite: { type: String },
    accommodationType: { type: String, required: true },
    starRating: { type: Number, enum: [1, 2, 3, 4, 5] },
    roomCount: { type: Number },
    capacity: { type: Number },
    campaignEligibility: {
      type: String,
      required: true,
      enum: ['eligible', 'parked-below-three-stars', 'parked-unknown-rating'],
    },
    warnings: { type: [String], required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'hotel_source_records' },
);

/** One establishment appears at most once per source per run. A retried or
 *  resumed run reuses its ingestRunId, so this index is what makes a retry
 *  idempotent rather than doubling the catalogue. */
hotelSourceRecordSchema.index({ ingestRunId: 1, source: 1, sourceId: 1 }, { unique: true });
hotelSourceRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
hotelSourceRecordSchema.index({ source: 1, sourceVersion: 1 });
hotelSourceRecordSchema.index({ campaignEligibility: 1, postcode: 1 });

export function createHotelSourceRecordModel(
  connection: Connection,
): Model<HotelSourceRecordDocument> {
  return (
    connection.models['HotelSourceRecord'] ??
    connection.model<HotelSourceRecordDocument>('HotelSourceRecord', hotelSourceRecordSchema)
  );
}
