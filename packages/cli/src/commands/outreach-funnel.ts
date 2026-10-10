/**
 * `odysseus outreach-funnel` (issue #533): the outreach funnel per campaign,
 * counts only, from the live thread and outcome collections. Read-only.
 * Issue #561: `--history` reads the daily snapshots the retention sweeper
 * stores, which outlive the 90-day thread expiry.
 */

import type { Command } from 'commander';
import { OUTREACH_MATURITY_BUCKETS } from '@odysseus/core';
import {
  connectToMongo,
  disconnectFromMongo,
  listOutreachFunnelSnapshots,
  reportOutreachCampaigns,
  type OutreachCampaignReport,
  type OutreachFunnelSnapshotDocument,
} from '@odysseus/store';

/** Printed where a stored day predates a count: unknown, never zero. */
const UNAVAILABLE = 'n/a';

const HISTORY_HEADER =
  'day         campaign         threads  sent  replied  bounced  opted-out  won  ' +
  'delivered  matured  replies  positive';

/** One line per stored day. A snapshot taken before plan 078 has no
 *  maturity counts, and prints them as unavailable. */
export function formatFunnelHistory(
  snapshots: readonly OutreachFunnelSnapshotDocument[],
): string[] {
  return [
    HISTORY_HEADER,
    ...snapshots.map((row) =>
      [
        row.day.padEnd(11),
        row.campaignVersion.padEnd(16),
        String(row.threads).padStart(7),
        String(row.firstTouchSent).padStart(5),
        String(row.replied).padStart(8),
        String(row.bounced).padStart(8),
        String(row.optedOut).padStart(10),
        String(row.won).padStart(4),
        String(row.results?.delivered ?? UNAVAILABLE).padStart(10),
        String(row.results?.matured ?? UNAVAILABLE).padStart(8),
        String(row.results?.maturity['matured-replied'] ?? UNAVAILABLE).padStart(8),
        String(row.results?.positiveReplies ?? UNAVAILABLE).padStart(9),
      ].join(' '),
    ),
  ];
}

function nonZero(counts: Record<string, number>): string {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  return entries.length === 0
    ? 'none'
    : entries.map(([key, count]) => `${key} ${count}`).join(', ');
}

function segmentLines(
  title: string,
  rows: Record<
    string,
    { delivered: number; matured: number; replies: number; positiveReplies: number }
  >,
): string[] {
  return [
    `  ${title}`,
    ...Object.entries(rows)
      .filter(([, row]) => row.delivered > 0)
      .map(
        ([segment, row]) =>
          `    ${segment.padEnd(14)} delivered ${row.delivered}, matured ${row.matured}, ` +
          `replies ${row.replies}, positive ${row.positiveReplies}`,
      ),
  ];
}

/** A campaign's counts as the terminal prints them. Counts and days only. */
export function formatCampaignReport(campaign: OutreachCampaignReport): string[] {
  const { results, projection } = campaign;
  return [
    `Campaign ${campaign.campaignVersion}`,
    `  threads opened        ${campaign.threads}`,
    `  first emails sent     ${campaign.firstTouchSent}`,
    `  replied               ${campaign.replied}`,
    `  bounced               ${campaign.bounced}`,
    `  opted out             ${campaign.optedOut}`,
    `  won                   ${campaign.won}`,
    `  replies after touch   1: ${campaign.repliesAfterTouch[1]}, ` +
      `2: ${campaign.repliesAfterTouch[2]}, 3: ${campaign.repliesAfterTouch[3]}`,
    `  current outcomes      ${nonZero(campaign.outcomes)}`,
    `  delivered first emails ${results.delivered}`,
    `  matured               ${results.matured}`,
    `  replies, any kind     ${results.maturity['matured-replied']} ` +
      `(positive ${results.positiveReplies}, objections ${results.objections})`,
    `  maturity              ${OUTREACH_MATURITY_BUCKETS.map(
      (bucket) => `${bucket} ${results.maturity[bucket]}`,
    ).join(', ')}`,
    `  decline reasons       ${nonZero(results.declineReasons)}`,
    ...segmentLines('by stars', results.segments.stars),
    ...segmentLines('by group status', results.segments.groupStatus),
    ...segmentLines('accessibility among the preview cards', results.segments.accessibilityCard),
    `  first emails, last 14 days ${projection.recentFirstTouchSends}`,
    ...campaign.checkpoints.map((checkpoint) => {
      const label = `  checkpoint ${String(checkpoint.checkpoint).padEnd(11)}`;
      switch (checkpoint.kind) {
        case 'reached':
          return `${label}reached${
            checkpoint.reachedOn === undefined ? '' : ` on ${checkpoint.reachedOn.day}`
          }`;
        case 'dated':
          return `${label}${checkpoint.day} at the earliest`;
        case 'estimated':
          return (
            `${label}${checkpoint.day} estimated, at ` +
            `${checkpoint.firstTouchesPerDay.toFixed(1)} first emails a day`
          );
        case 'no-estimate':
          return `${label}no estimate`;
      }
    }),
  ];
}

export function registerOutreachFunnelCommand(program: Command): void {
  program
    .command('outreach-funnel')
    .description(
      'Print the outreach funnel per campaign (threads, first emails sent, replies, bounces, ' +
        'opt-outs, wins, replies by touch, current outcomes, matured first emails, decline ' +
        'reasons, segments, checkpoints), as counts only. Read-only.',
    )
    .option('--json', 'Print the counts as JSON, for keeping beside the experiment record')
    .option('--history', 'Print the stored daily snapshots instead of the live counts')
    .action(async (opts: { json?: boolean; history?: boolean }) => {
      const connection = await connectToMongo();
      try {
        if (opts.history === true) {
          const snapshots = await listOutreachFunnelSnapshots(connection);
          if (opts.json === true) {
            console.log(JSON.stringify({ snapshots }, null, 2));
            return;
          }
          if (snapshots.length === 0) {
            console.log('No funnel snapshots stored yet.');
            return;
          }
          for (const line of formatFunnelHistory(snapshots)) console.log(line);
          return;
        }
        const campaigns = await reportOutreachCampaigns(connection);
        if (opts.json === true) {
          console.log(JSON.stringify({ exportedAt: new Date().toISOString(), campaigns }, null, 2));
          return;
        }
        if (campaigns.length === 0) {
          console.log('No outreach threads stored.');
          return;
        }
        for (const campaign of campaigns) {
          for (const line of formatCampaignReport(campaign)) console.log(line);
        }
      } finally {
        await disconnectFromMongo(connection);
      }
    });
}
