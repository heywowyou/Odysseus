/**
 * Issue #561: one document per UTC day and campaign holding that day's
 * outreach funnel, counts only. Unlike the threads and outcomes it is
 * derived from, it has no TTL: the aggregates must outlive the 90-day
 * record expiry so the brief's kill criteria can still be read
 * (docs/rules/prospect-qualification.md allows keeping aggregates). No
 * prospect, domain, address or thread identifier is stored.
 */

import { OUTREACH_OUTCOMES, type OutreachOutcome } from '@odysseus/core';
import { Schema, type Connection, type Model } from 'mongoose';

export interface OutreachFunnelSnapshotDocument {
  /** UTC calendar day, `YYYY-MM-DD`. */
  day: string;
  campaignVersion: string;
  threads: number;
  firstTouchSent: number;
  replied: number;
  bounced: number;
  optedOut: number;
  won: number;
  repliesAfterTouch: { 1: number; 2: number; 3: number };
  outcomes: Record<OutreachOutcome, number>;
  takenAt: Date;
}

const count = { type: Number, required: true } as const;

const outreachFunnelSnapshotSchema = new Schema<OutreachFunnelSnapshotDocument>(
  {
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/u },
    campaignVersion: { type: String, required: true },
    threads: count,
    firstTouchSent: count,
    replied: count,
    bounced: count,
    optedOut: count,
    won: count,
    repliesAfterTouch: {
      _id: false,
      type: { 1: count, 2: count, 3: count },
      required: true,
    },
    outcomes: {
      _id: false,
      type: Object.fromEntries(OUTREACH_OUTCOMES.map((outcome) => [outcome, count])),
      required: true,
    },
    takenAt: { type: Date, required: true },
  },
  { collection: 'outreach_funnel_snapshots' },
);
outreachFunnelSnapshotSchema.index({ day: 1, campaignVersion: 1 }, { unique: true });

export function createOutreachFunnelSnapshotModel(
  connection: Connection,
): Model<OutreachFunnelSnapshotDocument> {
  return (
    connection.models['OutreachFunnelSnapshot'] ??
    connection.model<OutreachFunnelSnapshotDocument>(
      'OutreachFunnelSnapshot',
      outreachFunnelSnapshotSchema,
    )
  );
}
