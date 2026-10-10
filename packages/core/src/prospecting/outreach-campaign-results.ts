/**
 * Plan 078: the counts a campaign is reported in, shared by the store that
 * tallies them, the snapshot that keeps them and the page that prints them.
 * Counts and days only: nothing here can name a prospect.
 */

import type { OutreachMaturityBucket } from './outreach-maturity.js';
import type { OutreachLostReason } from './outreach-outcome.js';

/** Decision 4: the three stored facets a campaign is read by. A
 *  missing prospect, facet or preview is `unknown`; nothing is inferred. */
export const OUTREACH_STAR_SEGMENTS = ['1', '2', '3', '4', '5', 'unknown'] as const;
export const OUTREACH_GROUP_SEGMENTS = [
  'independent',
  'group-member',
  'vendor-hosted',
  'unknown',
] as const;
/** Whether accessibility is among the three cards of the preview sent. */
export const OUTREACH_ACCESSIBILITY_CARD_SEGMENTS = ['yes', 'no', 'unknown'] as const;

export type OutreachStarSegment = (typeof OUTREACH_STAR_SEGMENTS)[number];
export type OutreachGroupSegment = (typeof OUTREACH_GROUP_SEGMENTS)[number];
export type OutreachAccessibilityCardSegment =
  (typeof OUTREACH_ACCESSIBILITY_CARD_SEGMENTS)[number];

/** One segment's delivered first emails and what came back. */
export interface OutreachSegmentCounts {
  delivered: number;
  matured: number;
  replies: number;
  positiveReplies: number;
}

/** A refusal recorded before a reason was asked for has none. */
export type OutreachDeclineReasonKey = OutreachLostReason | 'unspecified';

/** Plan 078: a campaign counted in matured first touches, the unit the
 *  brief's checkpoints are written in. Counts only. */
export interface OutreachCampaignResults {
  /** Every thread, in exactly one bucket. */
  maturity: Record<OutreachMaturityBucket, number>;
  /** First emails that reached a recipient of their own: the denominator
   *  of every rate. */
  delivered: number;
  /** Replied, or the sequence closed without a reply. */
  matured: number;
  /** Among the replies (`maturity['matured-replied']`). */
  positiveReplies: number;
  objections: number;
  /** Replies by the last touch sent before them. */
  repliesByLastTouch: { 1: number; 2: number; 3: number };
  declineReasons: Record<OutreachDeclineReasonKey, number>;
  segments: {
    stars: Record<OutreachStarSegment, OutreachSegmentCounts>;
    groupStatus: Record<OutreachGroupSegment, OutreachSegmentCounts>;
    accessibilityCard: Record<OutreachAccessibilityCardSegment, OutreachSegmentCounts>;
  };
}

/** What a checkpoint date is computed from. Days and counts, no thread. */
export interface OutreachCampaignProjectionInputs {
  /** UTC day of the first delivered first email. */
  firstSendDay?: string;
  /** Delivered first emails sent over the last `OUTREACH_PACE_WINDOW_DAYS`. */
  recentFirstTouchSends: number;
  /** Delivered threads not yet matured, by the UTC day each matures at the
   *  earliest, oldest day first. */
  pendingMaturity: { day: string; threads: number }[];
  /** Days from a first email to the close of its sequence, at the spacing
   *  of the campaign's most recent thread. */
  sequenceDays: number;
}
