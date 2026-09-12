/**
 * Mongoose schema for the `prescans` collection, milestone 9c plan 004.
 * One document per prescan run of one candidate.
 *
 * **Inserted, never upserted** - the opposite of
 * `hotel-qualification.schema.ts`, and deliberately so. The difference is
 * what a re-run means. Re-qualifying is a retry of an interrupted batch over
 * a cheap deterministic check, so a second evaluation at the same version
 * replaces the first. A second prescan is a *new measurement*: the site may
 * have changed, and even if it has not, LCP and blocking time are observed
 * quantities that differ run to run (see page-metrics.ts). Overwriting would
 * destroy the earlier observation, which is the only thing a later "did this
 * site get worse" question can be answered against. This is the
 * `persistAnalysis` side of the distinction trade-off 5 draws.
 *
 * Not preventing repeated work is therefore a property of this collection,
 * not a gap: the prescan job's default skip is what stops a batch
 * re-measuring hotels it already measured, and `--rescan` is what
 * deliberately overrides it.
 *
 * Subject to plan 004's 90 day operational retention, via the precomputed
 * `expiresAt` pattern the other 9c collections use.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type {
  HotelPrescanEvidence,
  HotelPrescanPage,
  HotelPrescanRoleAbsence,
  HotelPrescanStatus,
} from '@odysseus/core';

export interface PrescanDocumentFields {
  prescanId: string;
  candidateId: string;
  resolutionVersion: string;
  qualificationVersion: string;
  prescanVersion: string;
  scanJobId: string;
  domain: string;
  startUrl: string;
  status: HotelPrescanStatus;
  pages: HotelPrescanPage[];
  absentRoles: HotelPrescanRoleAbsence[];
  offsiteBookingLinks: string[];
  robotsTxtFound: boolean;
  effectiveDelayMs: number;
  artifactsDir: string;
  browserVersion: string;
  startedAt: Date;
  durationMs: number;
  evidence?: HotelPrescanEvidence;
  createdAt: Date;
  expiresAt: Date;
}

export type PrescanDocument = PrescanDocumentFields;

const prescanSchema = new Schema<PrescanDocument>(
  {
    prescanId: { type: String, required: true, unique: true },
    candidateId: { type: String, required: true },
    resolutionVersion: { type: String, required: true },
    qualificationVersion: { type: String, required: true },
    prescanVersion: { type: String, required: true },
    scanJobId: { type: String, required: true },
    domain: { type: String, required: true },
    startUrl: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: [
        'complete',
        'blocked-by-robots',
        'homepage-unreachable',
        'homepage-interstitial-unresolved',
      ],
    },
    // Pages and absences are Mixed for the reason hotel-qualification.schema
    // gives about reasons and notes: the authority for these shapes is the
    // TypeScript union in @odysseus/core, checked at compile time on every
    // write path, and a hard Mongoose enum here is exactly what would need a
    // migration the first time a page role or an absence reason is added.
    pages: { type: Schema.Types.Mixed, required: true, default: [] },
    absentRoles: { type: Schema.Types.Mixed, required: true, default: [] },
    offsiteBookingLinks: { type: [String], required: true, default: [] },
    robotsTxtFound: { type: Boolean, required: true },
    effectiveDelayMs: { type: Number, required: true },
    artifactsDir: { type: String, required: true },
    browserVersion: { type: String, required: true },
    startedAt: { type: Date, required: true },
    durationMs: { type: Number, required: true },
    evidence: { type: Schema.Types.Mixed, required: false },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'prescans', minimize: false },
);

prescanSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// The skip query: the most recent prescan for a candidate at a version.
// Descending on startedAt so "latest" is the first document read, not a sort
// over everything a repeatedly-prescanned candidate has accumulated.
prescanSchema.index({ prescanVersion: 1, candidateId: 1, startedAt: -1 });
prescanSchema.index({ prescanVersion: 1, status: 1 });
prescanSchema.index({ prescanVersion: 1, 'evidence.status': 1 });
prescanSchema.index({ scanJobId: 1 });

export function createPrescanModel(connection: Connection): Model<PrescanDocument> {
  return (
    connection.models['Prescan'] ?? connection.model<PrescanDocument>('Prescan', prescanSchema)
  );
}
