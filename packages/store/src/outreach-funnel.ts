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
  OUTREACH_OUTCOMES,
  type OutreachOutcome,
} from '@odysseus/core';
import {
  createOutreachFunnelSnapshotModel,
  type OutreachFunnelSnapshotDocument,
} from './schemas/outreach-funnel-snapshot.schema.js';
import { createOutreachOutcomeModel } from './schemas/outreach-outcome.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';

export interface OutreachCampaignFunnel {
  campaignVersion: string;
  /** Threads opened (a first email was at least prepared). */
  threads: number;
  /** Threads whose first email the provider confirms was sent: the
   *  denominator of every rate. */
  firstTouchSent: number;
  /** A reply of any kind: the sync saw one, or the operator recorded a reply,
   *  a call, a quote or a win. */
  replied: number;
  bounced: number;
  optedOut: number;
  won: number;
  /** Replies by the last touch sent before them (hypothesis H4). */
  repliesAfterTouch: { 1: number; 2: number; 3: number };
  /** Each thread's current operator-recorded outcome; threads without one
   *  are not counted here. */
  outcomes: Record<OutreachOutcome, number>;
}

const REPLY_OUTCOMES: ReadonlySet<OutreachOutcome> = new Set([
  'reply-positive',
  'reply-not-now',
  'reply-negative',
  'call',
  'quoted',
  'won',
]);

interface FunnelThreadRow {
  campaignVersion?: string;
  state: string;
  touches: { touch: number }[];
  currentOutcome?: string;
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
    outcomes: Object.fromEntries(OUTREACH_OUTCOMES.map((outcome) => [outcome, 0])) as Record<
      OutreachOutcome,
      number
    >,
  };
}

export async function aggregateOutreachFunnel(
  connection: Connection,
): Promise<OutreachCampaignFunnel[]> {
  const threads = await createOutreachThreadModel(connection)
    .find({})
    .select({ _id: 0, campaignVersion: 1, state: 1, 'touches.touch': 1, currentOutcome: 1 })
    .lean<FunnelThreadRow[]>();
  const outcomeIds = threads.flatMap((thread) =>
    thread.currentOutcome === undefined ? [] : [thread.currentOutcome],
  );
  const outcomeRows =
    outcomeIds.length === 0
      ? []
      : await createOutreachOutcomeModel(connection)
          .find({ outcomeId: { $in: outcomeIds } })
          .select({ _id: 0, outcomeId: 1, outcome: 1 })
          .lean<{ outcomeId: string; outcome: OutreachOutcome }[]>();
  const outcomeById = new Map(outcomeRows.map((row) => [row.outcomeId, row.outcome]));

  const funnels = new Map<string, OutreachCampaignFunnel>();
  for (const thread of threads) {
    const campaignVersion = thread.campaignVersion ?? FIRST_OUTREACH_CAMPAIGN_VERSION;
    let funnel = funnels.get(campaignVersion);
    if (funnel === undefined) {
      funnel = emptyFunnel(campaignVersion);
      funnels.set(campaignVersion, funnel);
    }
    const outcome =
      thread.currentOutcome === undefined ? undefined : outcomeById.get(thread.currentOutcome);
    const lastTouch = Math.max(0, ...thread.touches.map((touch) => touch.touch));

    funnel.threads += 1;
    if (thread.touches.some((touch) => touch.touch === 1)) funnel.firstTouchSent += 1;
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
  }
  return [...funnels.values()].sort((a, b) => a.campaignVersion.localeCompare(b.campaignVersion));
}

/** Issue #561: stores today's funnel (UTC day) per campaign, replacing an
 *  earlier snapshot of the same day, so a restart or a second sweep writes
 *  no duplicate. Returns the number of campaigns written. */
export async function recordOutreachFunnelSnapshot(
  connection: Connection,
  now: Date,
): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  const funnels = await aggregateOutreachFunnel(connection);
  if (funnels.length === 0) return 0;
  await createOutreachFunnelSnapshotModel(connection).bulkWrite(
    funnels.map((funnel) => ({
      replaceOne: {
        filter: { day, campaignVersion: funnel.campaignVersion },
        replacement: { day, ...funnel, takenAt: now },
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
