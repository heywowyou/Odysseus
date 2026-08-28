/**
 * Mongoose schema for the `hotel_score_cohorts` collection, milestone 9c
 * plan 006. One document per selection run.
 *
 * A cohort is a separate document rather than a `selected` flag written back
 * onto each score, because a score is immutable and a decile is a property of
 * a *set*. The same score can belong to one cohort and not to the next one
 * computed an hour later after more hotels were prescanned, and both of those
 * facts have to survive: plan 014 asks whether score predicted replies, which
 * needs to know which cohort was actually contacted, not which cohort the
 * current population would produce today.
 *
 * Members carry a reason each. Rows that were considered and not selected are
 * kept as counts by reason rather than in full: the useful question about them
 * is "how many fell where", and storing thousands of rejections per run would
 * make a cohort document grow with the catalogue rather than with the cohort.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { OutreachSelectionReason, OutreachSelectionState } from '@odysseus/core';

export interface HotelScoreCohortMember {
  candidateId: string;
  scoreId: string;
  rank: number;
  state: OutreachSelectionState;
  reason: OutreachSelectionReason;
}

export interface HotelScoreCohortDocumentFields {
  cohortId: string;
  scoringVersion: string;
  selectionRuleVersion: string;
  approved: boolean;
  populationSize: number;
  abilityCutoff: number | null;
  brokennessCutoff: number | null;
  selectedCount: number;
  members: HotelScoreCohortMember[];
  notSelectedByReason: Record<string, number>;
  computedAt: Date;
  createdAt: Date;
  expiresAt: Date;
}

export type HotelScoreCohortDocument = HotelScoreCohortDocumentFields;

const hotelScoreCohortSchema = new Schema<HotelScoreCohortDocument>(
  {
    cohortId: { type: String, required: true, unique: true },
    scoringVersion: { type: String, required: true },
    selectionRuleVersion: { type: String, required: true },
    approved: { type: Boolean, required: true },
    populationSize: { type: Number, required: true },
    abilityCutoff: { type: Number, required: false, default: null },
    brokennessCutoff: { type: Number, required: false, default: null },
    selectedCount: { type: Number, required: true },
    members: { type: Schema.Types.Mixed, required: true, default: [] },
    notSelectedByReason: { type: Schema.Types.Mixed, required: true, default: {} },
    computedAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'hotel_score_cohorts', minimize: false },
);

hotelScoreCohortSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
hotelScoreCohortSchema.index({ scoringVersion: 1, computedAt: -1 });
hotelScoreCohortSchema.index({ 'members.candidateId': 1 });

export function createHotelScoreCohortModel(
  connection: Connection,
): Model<HotelScoreCohortDocument> {
  return (
    connection.models['HotelScoreCohort'] ??
    connection.model<HotelScoreCohortDocument>('HotelScoreCohort', hotelScoreCohortSchema)
  );
}
