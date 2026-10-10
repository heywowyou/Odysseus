/**
 * Issue #561: one document per UTC day and campaign holding that day's
 * outreach funnel, counts only. Unlike the threads and outcomes it is
 * derived from, it has no TTL: the aggregates must outlive the 90-day
 * record expiry so the brief's kill criteria can still be read
 * (docs/rules/prospect-qualification.md allows keeping aggregates). No
 * prospect, domain, address or thread identifier is stored.
 */

import {
  OUTREACH_ACCESSIBILITY_CARD_SEGMENTS,
  OUTREACH_GROUP_SEGMENTS,
  OUTREACH_LOST_REASONS,
  OUTREACH_MATURITY_BUCKETS,
  OUTREACH_OUTCOMES,
  OUTREACH_STAR_SEGMENTS,
  type OutreachCampaignResults,
  type OutreachOutcome,
} from '@odysseus/core';
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
  /** Plan 078. Absent on rows stored before it: those days keep the counts
   *  above and say nothing about maturity, reasons or segments. */
  results?: OutreachCampaignResults;
  takenAt: Date;
}

const count = { type: Number, required: true } as const;

function counts(keys: readonly string[]): Record<string, typeof count> {
  return Object.fromEntries(keys.map((key) => [key, count]));
}

function segmentCounts(keys: readonly string[]): Schema {
  const segment = new Schema(
    { delivered: count, matured: count, replies: count, positiveReplies: count },
    { _id: false },
  );
  return new Schema(
    Object.fromEntries(keys.map((key) => [key, { type: segment, required: true }])),
    { _id: false },
  );
}

const resultsSchema = new Schema(
  {
    maturity: {
      type: new Schema(counts(OUTREACH_MATURITY_BUCKETS), { _id: false }),
      required: true,
    },
    delivered: count,
    matured: count,
    positiveReplies: count,
    objections: count,
    repliesByLastTouch: {
      type: new Schema({ 1: count, 2: count, 3: count }, { _id: false }),
      required: true,
    },
    declineReasons: {
      type: new Schema(counts([...OUTREACH_LOST_REASONS, 'unspecified']), { _id: false }),
      required: true,
    },
    segments: {
      type: new Schema(
        {
          stars: { type: segmentCounts(OUTREACH_STAR_SEGMENTS), required: true },
          groupStatus: { type: segmentCounts(OUTREACH_GROUP_SEGMENTS), required: true },
          accessibilityCard: {
            type: segmentCounts(OUTREACH_ACCESSIBILITY_CARD_SEGMENTS),
            required: true,
          },
        },
        { _id: false },
      ),
      required: true,
    },
  },
  { _id: false },
);

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
    results: { type: resultsSchema },
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
