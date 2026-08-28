/**
 * Mongoose schema for the `hotel_scores` collection, milestone 9c plan 006.
 * One document per scoring of one prescan under one scoring version.
 *
 * **Inserted, never upserted**, for the reason `prescan.schema.ts` gives about
 * itself and for one more: a score is the record of a decision, and rescoring
 * the same prescan under new weights is a *second* decision worth comparing
 * against the first, not a correction of it. Overwriting would destroy the only
 * evidence a "did the new weights actually rank differently" question can be
 * answered against, which is the whole reason plan 006 versions its weights.
 *
 * There is deliberately **no `prospectId`**. The hotel funnel emits no
 * `prospects` events - see `prescans.ts` on why - so a pointer into that
 * collection would name a document this funnel never writes.
 *
 * Subject to the same 90 day operational retention as the rest of 9c, via the
 * precomputed `expiresAt` pattern.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { HotelOutreachScore } from '@odysseus/core';

export interface HotelScoreDocumentFields {
  scoreId: string;
  candidateId: string;
  prescanId: string;
  domain: string;
  resolutionVersion: string;
  qualificationVersion: string;
  prescanVersion: string;
  scoringVersion: string;
  brokenness: HotelOutreachScore['brokenness'];
  ability: HotelOutreachScore['ability'];
  worthy: boolean;
  /** Whether the prescan this score was computed from carried complete
   *  evidence. Denormalized onto the score because selection asks it of a whole
   *  population at once, and a prescan lookup per row is the shape that stops
   *  working once the catalogue is scored. */
  evidenceComplete: boolean;
  computedAt: Date;
  createdAt: Date;
  expiresAt: Date;
}

export type HotelScoreDocument = HotelScoreDocumentFields;

const hotelScoreSchema = new Schema<HotelScoreDocument>(
  {
    scoreId: { type: String, required: true, unique: true },
    candidateId: { type: String, required: true },
    prescanId: { type: String, required: true },
    domain: { type: String, required: true },
    resolutionVersion: { type: String, required: true },
    qualificationVersion: { type: String, required: true },
    prescanVersion: { type: String, required: true },
    scoringVersion: { type: String, required: true },
    // Mixed for the reason the sibling schemas give: the authority for a
    // breakdown's shape is the TypeScript contract in @odysseus/core, checked
    // on every write path, and a Mongoose enum of component ids is what would
    // need a migration the first time a weight is added under a new version.
    brokenness: { type: Schema.Types.Mixed, required: true },
    ability: { type: Schema.Types.Mixed, required: true },
    worthy: { type: Boolean, required: true },
    evidenceComplete: { type: Boolean, required: true },
    computedAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'hotel_scores', minimize: false },
);

hotelScoreSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Deliberately not unique: a rescore inserts. Descending on computedAt so the
// latest score for a candidate is the first document read.
hotelScoreSchema.index({ scoringVersion: 1, candidateId: 1, computedAt: -1 });
hotelScoreSchema.index({ scoringVersion: 1, worthy: 1 });

export function createHotelScoreModel(connection: Connection): Model<HotelScoreDocument> {
  return (
    connection.models['HotelScore'] ??
    connection.model<HotelScoreDocument>('HotelScore', hotelScoreSchema)
  );
}
