/**
 * Mongoose schema for the `hotel_wave_roster` collection, plan 041 slice B2.
 * One document per operator decision to work one hotel in one wave.
 *
 * This exists because the formula's record and the operator's decision are
 * two different facts. A cohort (score-cohort.schema.ts) records what the
 * selection rule computed over one population at one moment, and is
 * insert-only for that reason. When the operator then decides to work a
 * hotel the rule ranked just below the cut, that decision has nowhere to
 * live: writing it into the cohort would falsify the rule's own record.
 * Wave 1 is exactly that case - the runbook records ten approved domains
 * against a cohort that selected six - and the gap between the two was
 * invisible to the scan gate until this collection existed.
 *
 * An entry is revoked rather than deleted: the useful question later is
 * which hotels were authorized when a scan ran, which a deleted row cannot
 * answer. Suppression is checked independently and always wins, so a roster
 * entry can never re-open a hotel that opted out.
 *
 * `cohortId` and `scoringVersion` are the selection run the decision was
 * taken against, not a claim of membership in it. They are stored because
 * the audit's outreach provenance requires them (audit.schema.ts's
 * `outreach` sub-schema, both required): a roster-authorized scan records
 * the same shape as a cohort-authorized one, and `authorizedBy` on the plan
 * is what distinguishes them.
 */

import { Schema, type Connection, type Model } from 'mongoose';

export type WaveRosterEntryState = 'active' | 'revoked';

export interface WaveRosterEntryDocumentFields {
  entryId: string;
  wave: string;
  candidateId: string;
  /** The hotel's own registrable domain at the moment of the decision, so
   *  the roster says which site was approved rather than leaving it to be
   *  re-derived from a catalogue that may have moved on. The gate still
   *  re-resolves current ownership; this is provenance, not authority. */
  domain: string;
  /** The rank the selection run gave this hotel, when it gave one. A hotel
   *  the operator adds from outside any ranking has none. */
  rank: number | null;
  cohortId: string;
  scoringVersion: string;
  decidedAt: Date;
  actor: string;
  note: string | null;
  state: WaveRosterEntryState;
  revokedAt: Date | null;
  revokedBy: string | null;
  createdAt: Date;
}

export type WaveRosterEntryDocument = WaveRosterEntryDocumentFields;

const waveRosterEntrySchema = new Schema<WaveRosterEntryDocument>(
  {
    entryId: { type: String, required: true, unique: true },
    wave: { type: String, required: true },
    candidateId: { type: String, required: true },
    domain: { type: String, required: true },
    rank: { type: Number, required: false, default: null },
    cohortId: { type: String, required: true },
    scoringVersion: { type: String, required: true },
    decidedAt: { type: Date, required: true },
    actor: { type: String, required: true },
    note: { type: String, required: false, default: null },
    state: { type: String, required: true, enum: ['active', 'revoked'] },
    revokedAt: { type: Date, required: false, default: null },
    revokedBy: { type: String, required: false, default: null },
    createdAt: { type: Date, required: true },
  },
  { collection: 'hotel_wave_roster' },
);

// The gate's per-candidate question ("is this hotel on any active roster")
// and the projection's set question ("which candidates are") are both this
// index.
waveRosterEntrySchema.index({ candidateId: 1, state: 1 });
waveRosterEntrySchema.index({ wave: 1, state: 1 });
// One active entry per hotel per wave: adding the same hotel twice is an
// operator slip, not two decisions. A revoked row stays out of the key, so
// a hotel removed and later re-added gets a second, separate entry.
waveRosterEntrySchema.index(
  { wave: 1, candidateId: 1 },
  { unique: true, partialFilterExpression: { state: 'active' } },
);

// Deliberately no TTL index. A wave roster is a record of operator
// authorization, the same class of fact as a cohort's approval, and the
// prospect retention policy applies to candidate data rather than to the
// decisions taken about it.

export function createWaveRosterEntryModel(connection: Connection): Model<WaveRosterEntryDocument> {
  return (
    connection.models['WaveRosterEntry'] ??
    connection.model<WaveRosterEntryDocument>('WaveRosterEntry', waveRosterEntrySchema)
  );
}
