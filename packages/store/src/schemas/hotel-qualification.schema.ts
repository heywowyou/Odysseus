/**
 * Mongoose schema for the `hotel_qualifications` collection, milestone 9c plan
 * 003. One document per evaluation of one candidate at one qualification
 * version.
 *
 * Its own collection rather than an emission into `prospects` (execution
 * decision 2 in advisor-plans/003-cheap-hotel-qualification.md): a prospect
 * document requires a `scanJobId`, and at this stage no scan exists or should.
 * Widening `prospects` to make that field optional would leave the collection
 * meaning two different things depending on which fields happen to be present,
 * which is exactly the ambiguity insert-only event logs exist to avoid. Plan
 * 004 emits the `prospects` event, when a scan job genuinely exists.
 *
 * Upserted on (qualificationVersion, candidateId) rather than inserted, unlike
 * hotel-source-record.schema.ts. The difference is what a re-run means. A
 * second national ingest is a new observation of the world and both are worth
 * keeping. A second qualification run at the same version is a retry of an
 * interrupted 7,000-domain batch, and inserting again would make the coverage
 * report count the same hotel twice - the same distinction persistAudit and
 * persistAnalysis already draw for audits. A changed rule is a new
 * qualificationVersion, which is a new document beside the old one, so the
 * history a version comparison needs is preserved by versioning rather than by
 * duplication.
 *
 * Subject to the 90 day operational retention policy, via the precomputed
 * `expiresAt` pattern the other 9c collections use.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type {
  HotelQualificationNote,
  HotelQualificationOutcome,
  HotelQualificationReason,
  HotelSiteFacts,
} from '@odysseus/core';

export interface HotelQualificationDocumentFields {
  qualificationId: string;
  candidateId: string;
  resolutionVersion: string;
  /** Which set of qualification rules produced this. Bumped when a rule
   *  changes, never edited in place, for the reason hotel-candidate.ts gives
   *  about resolutionVersion: a later yield comparison must not silently mix
   *  two definitions of "qualified". */
  qualificationVersion: string;
  /** The registrable domain actually checked, denormalized from the candidate
   *  so this document is readable on its own. */
  domain: string | null;
  outcome: HotelQualificationOutcome;
  reasons: HotelQualificationReason[];
  notes: HotelQualificationNote[];
  /** What the probe observed, kept verbatim. Stored because a reason alone
   *  cannot be audited: "rejected, parked-domain-page" is a claim, and the
   *  final URL and the signature that matched are the evidence for it. */
  siteFacts: HotelSiteFacts;
  evaluatedAt: Date;
  createdAt: Date;
  expiresAt: Date;
}

export type HotelQualificationDocument = HotelQualificationDocumentFields;

const hotelQualificationSchema = new Schema<HotelQualificationDocument>(
  {
    qualificationId: { type: String, required: true, unique: true },
    candidateId: { type: String, required: true },
    resolutionVersion: { type: String, required: true },
    qualificationVersion: { type: String, required: true },
    domain: { type: String, default: null },
    outcome: {
      type: String,
      required: true,
      enum: ['qualified', 'parked', 'rejected', 'already-engaged', 'group-routed'],
    },
    // Reasons and notes are stored as plain strings rather than as Mongoose
    // enums, unlike prospect.schema.ts. That schema's hard enum is precisely
    // what made it unable to accept this stage's vocabulary without a
    // migration; the authority for these values is the TypeScript union in
    // @odysseus/core, which is checked at compile time on every write path.
    reasons: { type: [String], required: true, default: [] },
    notes: { type: [String], required: true, default: [] },
    siteFacts: { type: Schema.Types.Mixed, required: true },
    evaluatedAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'hotel_qualifications', minimize: false },
);

/** The idempotency mechanism: one evaluation per candidate per version. */
hotelQualificationSchema.index({ qualificationVersion: 1, candidateId: 1 }, { unique: true });
hotelQualificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
hotelQualificationSchema.index({ qualificationVersion: 1, outcome: 1 });

export function createHotelQualificationModel(
  connection: Connection,
): Model<HotelQualificationDocument> {
  return (
    connection.models['HotelQualification'] ??
    connection.model<HotelQualificationDocument>('HotelQualification', hotelQualificationSchema)
  );
}
