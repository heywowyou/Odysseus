/**
 * Issue #533: the outreach funnel per campaign, as counts only.
 *
 * Threads and outcomes expire after 90 days by design (data minimisation,
 * docs/rules/prospect-qualification.md), so the experiment's evidence must be
 * exported as aggregates before the first rows go
 * (docs/product/outreach-experiment-design.md section 4). This reads the live
 * collections and returns numbers per campaign: no prospect, address,
 * domain or thread identifier leaves this function.
 */

import type { Connection } from 'mongoose';
import {
  FIRST_OUTREACH_CAMPAIGN_VERSION,
  OUTREACH_LOST_REASONS,
  OUTREACH_MATURITY_BUCKETS,
  OUTREACH_ACCESSIBILITY_CARD_SEGMENTS,
  OUTREACH_GROUP_SEGMENTS,
  OUTREACH_OUTCOMES,
  OUTREACH_PACE_WINDOW_DAYS,
  OUTREACH_STAR_SEGMENTS,
  classifyOutreachMaturity,
  earliestOutreachMaturityDate,
  isDeliveredOutreachBucket,
  isMaturedOutreachBucket,
  isOutreachPositiveOutcome,
  outreachLostReasonRule,
  outreachSequenceDays,
  projectOutreachCheckpoints,
  utcDay,
  type OutreachCampaignProjectionInputs,
  type OutreachCampaignResults,
  type OutreachCheckpointProjection,
  type OutreachLostReason,
  type OutreachOutcome,
  type OutreachSegmentCounts,
  type OutreachThreadState,
} from '@odysseus/core';
import {
  createOutreachFunnelSnapshotModel,
  type OutreachFunnelSnapshotDocument,
} from './schemas/outreach-funnel-snapshot.schema.js';
import { createOutreachOutcomeModel } from './schemas/outreach-outcome.schema.js';
import { createOutreachPreviewModel } from './schemas/outreach-preview.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { createProspectHubModel } from './schemas/prospect-hub.schema.js';

export interface OutreachCampaignFunnel {
  campaignVersion: string;
  /** Threads opened (a first email was at least prepared). */
  threads: number;
  /** Threads carrying a first email the provider or the operator confirms
   *  was sent, bounced ones included. */
  firstTouchSent: number;
  /** A reply the sync saw, or one the operator recorded as a reply, a call,
   *  a quote or a win. Objections are counted apart, in `optedOut`. */
  replied: number;
  bounced: number;
  optedOut: number;
  won: number;
  /** `replied` by the last touch sent before the reply (hypothesis H4). */
  repliesAfterTouch: { 1: number; 2: number; 3: number };
  /** Each thread's current operator-recorded outcome; threads without one
   *  are not counted here. */
  outcomes: Record<OutreachOutcome, number>;
  results: OutreachCampaignResults;
  projection: OutreachCampaignProjectionInputs;
}

const REPLY_OUTCOMES: ReadonlySet<OutreachOutcome> = new Set([
  'reply-positive',
  'reply-not-now',
  'reply-negative',
  'call',
  'quoted',
  'won',
]);

const DAY_MS = 24 * 60 * 60 * 1000;

interface FunnelThreadRow {
  prospectId: string;
  previewId: string;
  campaignVersion?: string;
  state: OutreachThreadState;
  stateReason?: string;
  touches: { touch: number; sentAt: Date; confirmedBy?: 'operator' }[];
  spacing: { touch2AfterDays: number; touch3AfterDays: number; replyWindowDays: number };
  currentOutcome?: string;
  createdAt: Date;
}

function zeroCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

function zeroSegments<K extends string>(keys: readonly K[]): Record<K, OutreachSegmentCounts> {
  return Object.fromEntries(
    keys.map((key) => [key, { delivered: 0, matured: 0, replies: 0, positiveReplies: 0 }]),
  ) as Record<K, OutreachSegmentCounts>;
}

function emptyFunnel(campaignVersion: string): OutreachCampaignFunnel {
  return {
    campaignVersion,
    threads: 0,
    firstTouchSent: 0,
    replied: 0,
    bounced: 0,
    optedOut: 0,
    won: 0,
    repliesAfterTouch: { 1: 0, 2: 0, 3: 0 },
    outcomes: zeroCounts(OUTREACH_OUTCOMES),
    results: {
      maturity: zeroCounts(OUTREACH_MATURITY_BUCKETS),
      delivered: 0,
      matured: 0,
      positiveReplies: 0,
      objections: 0,
      repliesByLastTouch: { 1: 0, 2: 0, 3: 0 },
      declineReasons: zeroCounts([...OUTREACH_LOST_REASONS, 'unspecified'] as const),
      segments: {
        stars: zeroSegments(OUTREACH_STAR_SEGMENTS),
        groupStatus: zeroSegments(OUTREACH_GROUP_SEGMENTS),
        accessibilityCard: zeroSegments(OUTREACH_ACCESSIBILITY_CARD_SEGMENTS),
      },
    },
    projection: { recentFirstTouchSends: 0, pendingMaturity: [], sequenceDays: 0 },
  };
}

/**
 * Every campaign's funnel, from four collection reads whatever the number
 * of threads: threads, their current outcomes, their prospects' two hotel
 * facets and their previews' card categories.
 */
export async function aggregateOutreachFunnel(
  connection: Connection,
  now: Date = new Date(),
): Promise<OutreachCampaignFunnel[]> {
  const threads = await createOutreachThreadModel(connection)
    .find({})
    .select({
      _id: 0,
      prospectId: 1,
      previewId: 1,
      campaignVersion: 1,
      state: 1,
      stateReason: 1,
      'touches.touch': 1,
      'touches.sentAt': 1,
      'touches.confirmedBy': 1,
      spacing: 1,
      currentOutcome: 1,
      createdAt: 1,
    })
    .lean<FunnelThreadRow[]>();
  const [outcomeRows, prospectRows, previewRows] = await Promise.all([
    createOutreachOutcomeModel(connection)
      .find({
        outcomeId: {
          $in: threads.flatMap((thread) =>
            thread.currentOutcome === undefined ? [] : [thread.currentOutcome],
          ),
        },
      })
      .select({ _id: 0, outcomeId: 1, outcome: 1, lostReason: 1 })
      .lean<{ outcomeId: string; outcome: OutreachOutcome; lostReason?: OutreachLostReason }[]>(),
    createProspectHubModel(connection)
      .find({ prospectId: { $in: threads.map((thread) => thread.prospectId) } })
      .select({ _id: 0, prospectId: 1, 'hotel.stars': 1, 'hotel.groupStatus': 1 })
      .lean<{ prospectId: string; hotel?: { stars?: number; groupStatus?: string } }[]>(),
    createOutreachPreviewModel(connection)
      .find({ previewId: { $in: threads.map((thread) => thread.previewId) } })
      .select({ _id: 0, previewId: 1, 'publishedFacts.priorityCardCategories': 1 })
      .lean<{ previewId: string; publishedFacts?: { priorityCardCategories?: string[] } }[]>(),
  ]);
  const outcomeById = new Map(outcomeRows.map((row) => [row.outcomeId, row]));
  const hotelByProspect = new Map(prospectRows.map((row) => [row.prospectId, row.hotel]));
  const cardsByPreview = new Map(
    previewRows.map((row) => [row.previewId, row.publishedFacts?.priorityCardCategories]),
  );

  const funnels = new Map<string, OutreachCampaignFunnel>();
  const pendingByCampaign = new Map<string, Map<string, number>>();
  const newestThreadAt = new Map<string, number>();
  const paceWindowStart = now.getTime() - OUTREACH_PACE_WINDOW_DAYS * DAY_MS;
  for (const thread of threads) {
    const campaignVersion = thread.campaignVersion ?? FIRST_OUTREACH_CAMPAIGN_VERSION;
    let funnel = funnels.get(campaignVersion);
    if (funnel === undefined) {
      funnel = emptyFunnel(campaignVersion);
      funnels.set(campaignVersion, funnel);
      pendingByCampaign.set(campaignVersion, new Map());
    }
    const outcomeRow =
      thread.currentOutcome === undefined ? undefined : outcomeById.get(thread.currentOutcome);
    const outcome = outcomeRow?.outcome;
    const lastTouch = Math.max(0, ...thread.touches.map((touch) => touch.touch));
    const firstTouch = thread.touches.find((touch) => touch.touch === 1);

    funnel.threads += 1;
    if (firstTouch !== undefined) funnel.firstTouchSent += 1;
    const replied =
      thread.state === 'replied' || (outcome !== undefined && REPLY_OUTCOMES.has(outcome));
    if (replied) {
      funnel.replied += 1;
      if (lastTouch === 1 || lastTouch === 2 || lastTouch === 3) {
        funnel.repliesAfterTouch[lastTouch] += 1;
      }
    }
    if (thread.state === 'bounced') funnel.bounced += 1;
    if (thread.state === 'opted-out' || outcome === 'opt-out') funnel.optedOut += 1;
    if (outcome === 'won') funnel.won += 1;
    if (outcome !== undefined) funnel.outcomes[outcome] += 1;

    const created = new Date(thread.createdAt).getTime();
    if (created >= (newestThreadAt.get(campaignVersion) ?? -Infinity)) {
      newestThreadAt.set(campaignVersion, created);
      funnel.projection.sequenceDays = outreachSequenceDays(thread.spacing);
    }

    const results = funnel.results;
    const maturityThread = { ...thread, outcome };
    const bucket = classifyOutreachMaturity(maturityThread);
    results.maturity[bucket] += 1;
    if (outcome !== undefined && outreachLostReasonRule(outcome) !== 'refused') {
      const reason = outcomeRow?.lostReason;
      // A "not now" may carry no reason; only a refusal without one is a gap.
      if (reason !== undefined) results.declineReasons[reason] += 1;
      else if (outreachLostReasonRule(outcome) === 'required') {
        results.declineReasons.unspecified += 1;
      }
    }
    if (!isDeliveredOutreachBucket(bucket) || firstTouch === undefined) continue;

    const matured = isMaturedOutreachBucket(bucket);
    const repliedMatured = bucket === 'matured-replied';
    const positive = repliedMatured && outcome !== undefined && isOutreachPositiveOutcome(outcome);
    results.delivered += 1;
    if (matured) results.matured += 1;
    if (positive) results.positiveReplies += 1;
    if (repliedMatured) {
      if (thread.state === 'opted-out' || outcome === 'opt-out') results.objections += 1;
      if (lastTouch === 1 || lastTouch === 2 || lastTouch === 3) {
        results.repliesByLastTouch[lastTouch] += 1;
      }
    }

    const hotel = hotelByProspect.get(thread.prospectId);
    const stars = String(hotel?.stars ?? '');
    const cards = cardsByPreview.get(thread.previewId);
    const segments = [
      results.segments.stars[isOneOf(OUTREACH_STAR_SEGMENTS, stars) ? stars : 'unknown'],
      results.segments.groupStatus[
        isOneOf(OUTREACH_GROUP_SEGMENTS, hotel?.groupStatus) ? hotel.groupStatus : 'unknown'
      ],
      results.segments.accessibilityCard[
        cards === undefined ? 'unknown' : cards.includes('accessibility') ? 'yes' : 'no'
      ],
    ];
    for (const segment of segments) {
      segment.delivered += 1;
      if (matured) segment.matured += 1;
      if (repliedMatured) segment.replies += 1;
      if (positive) segment.positiveReplies += 1;
    }

    const sentDay = utcDay(new Date(firstTouch.sentAt));
    const projection = funnel.projection;
    if (projection.firstSendDay === undefined || sentDay < projection.firstSendDay) {
      projection.firstSendDay = sentDay;
    }
    if (new Date(firstTouch.sentAt).getTime() > paceWindowStart) {
      projection.recentFirstTouchSends += 1;
    }
    const maturesAt = earliestOutreachMaturityDate(maturityThread);
    if (maturesAt !== undefined) {
      const pending = pendingByCampaign.get(campaignVersion)!;
      pending.set(utcDay(maturesAt), (pending.get(utcDay(maturesAt)) ?? 0) + 1);
    }
  }
  for (const [campaignVersion, pending] of pendingByCampaign) {
    funnels.get(campaignVersion)!.projection.pendingMaturity = [...pending]
      .map(([day, count]) => ({ day, threads: count }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }
  return [...funnels.values()].sort((a, b) => a.campaignVersion.localeCompare(b.campaignVersion));
}

function isOneOf<K extends string>(keys: readonly K[], value: string | undefined): value is K {
  return value !== undefined && (keys as readonly string[]).includes(value);
}

/** A checkpoint as the campaign page prints it. A reached one carries the
 *  first daily snapshot that showed it reached, when one exists. */
export type OutreachCheckpointStatus = OutreachCheckpointProjection & {
  reachedOn?: { day: string; replies: number; positiveReplies: number };
};

export type OutreachCampaignReport = OutreachCampaignFunnel & {
  checkpoints: OutreachCheckpointStatus[];
};

/**
 * Plan 078: every campaign's funnel with its checkpoints, for the campaign
 * page. One read more than the funnel: the daily snapshots, which say when a
 * checkpoint was first reached and what had come back that day.
 */
export async function reportOutreachCampaigns(
  connection: Connection,
  now: Date = new Date(),
): Promise<OutreachCampaignReport[]> {
  const [funnels, snapshots] = await Promise.all([
    aggregateOutreachFunnel(connection, now),
    listOutreachFunnelSnapshots(connection),
  ]);
  return funnels.map((funnel) => {
    const history = snapshots.filter((row) => row.campaignVersion === funnel.campaignVersion);
    const checkpoints = projectOutreachCheckpoints({
      matured: funnel.results.matured,
      ...funnel.projection,
      today: utcDay(now),
    }).map((projected): OutreachCheckpointStatus => {
      if (projected.kind !== 'reached') return projected;
      // Oldest day first; a row stored before the results existed has none.
      const first = history.find((row) => (row.results?.matured ?? 0) >= projected.checkpoint);
      const results = first?.results;
      return first === undefined || results === undefined
        ? projected
        : {
            ...projected,
            reachedOn: {
              day: first.day,
              replies: results.maturity['matured-replied'],
              positiveReplies: results.positiveReplies,
            },
          };
    });
    return { ...funnel, checkpoints };
  });
}

/** Issue #561: stores today's funnel (UTC day) per campaign, replacing an
 *  earlier snapshot of the same day, so a restart or a second sweep writes
 *  no duplicate. Returns the number of campaigns written. */
export async function recordOutreachFunnelSnapshot(
  connection: Connection,
  now: Date,
): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  const funnels = await aggregateOutreachFunnel(connection, now);
  if (funnels.length === 0) return 0;
  await createOutreachFunnelSnapshotModel(connection).bulkWrite(
    // The projection inputs describe one moment and are derived again on
    // every read; only the counts are kept.
    funnels.map(({ projection: _projection, ...counts }) => ({
      replaceOne: {
        filter: { day, campaignVersion: counts.campaignVersion },
        replacement: { day, ...counts, takenAt: now },
        upsert: true,
      },
    })),
  );
  return funnels.length;
}

/** Every stored snapshot, oldest day first. */
export async function listOutreachFunnelSnapshots(
  connection: Connection,
): Promise<OutreachFunnelSnapshotDocument[]> {
  return createOutreachFunnelSnapshotModel(connection)
    .find({})
    .select({ _id: 0, __v: 0 })
    .sort({ day: 1, campaignVersion: 1 })
    .lean<OutreachFunnelSnapshotDocument[]>();
}
