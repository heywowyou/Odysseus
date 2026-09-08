/**
 * Mongoose schema for the `hotel_candidates` collection, milestone 9c.
 *
 * Deliberately *not* insert-only, unlike hotel-source-record.schema.ts and
 * prospect.schema.ts next door. Those two record observations, where a later
 * reading is a new fact rather than a correction. This collection holds the
 * tool's current belief about an establishment, which is exactly the thing that
 * should converge rather than accumulate: it is an upsert collection in the
 * sense persist-sirene-cache.ts describes.
 *
 * Provenance survives that mutability because a candidate never absorbs a
 * source record. It holds `sourceRefs` pointing at the immutable rows, so the
 * evidence behind a merge outlives any number of re-resolutions.
 *
 * Every candidate is stamped with a `resolutionVersion` and the unique index is
 * on (resolutionVersion, identityKey), so changing a resolution rule produces a
 * parallel generation of candidates rather than editing the previous one in
 * place. That is what keeps a yield comparison between two campaigns
 * interpretable instead of silently mixing two definitions of the same word.
 *
 * Subject to the same 90 day operational retention as the two shipped
 * prospecting collections, via the same precomputed `expiresAt` +
 * `expireAfterSeconds: 0` pattern rather than a raw TTL on `createdAt`.
 *
 * Like `hotel_source_records`, this collection holds establishment facts and
 * never contact addresses. Role-address discovery is a separate stage.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { HotelCandidate } from '@odysseus/core';

/** The stored shape is the core contract plus the two retention fields. Keeping
 *  it structurally identical to `HotelCandidate` is what lets a caller read a
 *  document and hand it straight to a pure function without a mapping layer. */
export interface HotelCandidateDocumentFields extends HotelCandidate {
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export type HotelCandidateDocument = HotelCandidateDocumentFields;

const sourceRefSchema = new Schema(
  {
    source: { type: String, required: true },
    sourceId: { type: String, required: true },
    sourceVersion: { type: String, required: true },
    ingestRunId: { type: String, required: true },
  },
  { _id: false },
);

const websiteCandidateSchema = new Schema(
  {
    raw: { type: String, required: true },
    source: { type: String, required: true },
    sourceId: { type: String, required: true },
    kind: { type: String, required: true, enum: ['own-domain', 'vendor-hosted', 'unusable'] },
    hostname: { type: String },
    registrableDomain: { type: String },
    unusableReason: { type: String },
    vendor: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const conflictSchema = new Schema(
  {
    kind: { type: String, required: true },
    detail: { type: String, required: true },
    candidateIds: { type: [String], required: true },
  },
  { _id: false },
);

/** The pointer, not the record. The evidence stays in `hotel_qualifications`;
 *  this exists so prescan selection is one indexed query over the catalogue. */
const qualificationStateSchema = new Schema(
  {
    outcome: {
      type: String,
      required: true,
      enum: ['qualified', 'parked', 'rejected', 'already-engaged', 'group-routed'],
    },
    qualificationVersion: { type: String, required: true },
    evaluatedAt: { type: Date, required: true },
  },
  { _id: false },
);

/** The prescan pointer. Same pointer-not-record rule as
 *  qualificationStateSchema above; the measurements stay in `prescans`, one
 *  immutable document per run. */
const prescanStateSchema = new Schema(
  {
    prescanId: { type: String, required: true },
    prescanVersion: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['complete', 'blocked-by-robots', 'homepage-unreachable'],
    },
    prescannedAt: { type: Date, required: true },
  },
  { _id: false },
);

const hotelCandidateSchema = new Schema<HotelCandidateDocument>(
  {
    candidateId: { type: String, required: true },
    resolutionVersion: { type: String, required: true },
    identityKey: { type: String, required: true },
    identityStatus: {
      type: String,
      required: true,
      enum: ['resolved', 'needs-review', 'ambiguous', 'unmatched'],
    },
    matchedOn: { type: Schema.Types.Mixed },
    siret: { type: String },
    siren: { type: String },
    sourceRefs: { type: [sourceRefSchema], required: true },
    name: { type: String, required: true },
    normalizedName: { type: String, required: true },
    address: { type: String },
    postcode: { type: String },
    commune: { type: String },
    accommodationType: { type: String },
    starRating: { type: Number, enum: [1, 2, 3, 4, 5] },
    roomCount: { type: Number },
    capacity: { type: Number },
    campaignEligibility: {
      type: String,
      required: true,
      enum: ['eligible', 'parked-below-three-stars', 'parked-unknown-rating'],
    },
    websiteCandidates: { type: [websiteCandidateSchema], required: true },
    ownRegistrableDomain: { type: String },
    domainProvenance: { type: String, enum: ['declared', 'redirect-adopted'] },
    declaredRegistrableDomain: { type: String },
    groupStatus: {
      type: String,
      required: true,
      enum: ['independent', 'group-member', 'vendor-hosted', 'unknown'],
    },
    groupDomain: { type: String },
    groupSize: { type: Number },
    qualification: { type: qualificationStateSchema },
    prescan: { type: prescanStateSchema },
    conflicts: { type: [conflictSchema], required: true },
    review: {
      state: {
        type: String,
        required: true,
        enum: ['not-required', 'pending', 'accepted', 'rejected'],
      },
      queuedReason: { type: String },
      actor: { type: String },
      reason: { type: String },
      decidedAt: { type: Date },
    },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'hotel_candidates', minimize: false },
);

/** One candidate per identity per resolution version. This index IS the
 *  idempotency mechanism for a resumed or retried resolve run, so the writer
 *  must await Model.init() before its first write - see
 *  hotel-source-records.ts for the race this avoids. */
hotelCandidateSchema.index({ resolutionVersion: 1, identityKey: 1 }, { unique: true });
hotelCandidateSchema.index({ candidateId: 1 }, { unique: true });
hotelCandidateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
hotelCandidateSchema.index({ resolutionVersion: 1, ownRegistrableDomain: 1 });
hotelCandidateSchema.index({ resolutionVersion: 1, groupStatus: 1, campaignEligibility: 1 });
hotelCandidateSchema.index({ resolutionVersion: 1, identityStatus: 1, 'review.state': 1 });
// Plan 004's prescan selection query: the qualified candidates of one run.
hotelCandidateSchema.index({ resolutionVersion: 1, 'qualification.outcome': 1 });
// Plan 004's skip query: which of those have not been prescanned at the
// current version. Sparse would not help - a candidate never prescanned has
// no `prescan` subdocument at all, and that absence is precisely what the
// query selects on.
hotelCandidateSchema.index({ resolutionVersion: 1, 'prescan.prescanVersion': 1 });

export function createHotelCandidateModel(connection: Connection): Model<HotelCandidateDocument> {
  return (
    connection.models['HotelCandidate'] ??
    connection.model<HotelCandidateDocument>('HotelCandidate', hotelCandidateSchema)
  );
}
