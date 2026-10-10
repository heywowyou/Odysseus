/**
 * Plan 078: turns one campaign of GET /api/outreach/funnel into what the
 * campaign page prints. Pure: no fetch, no clock, no copy. The page reports
 * counts and never concludes from them.
 */

import type {
  OutreachCampaignFunnel,
  OutreachCheckpoint,
  OutreachSegmentCounts,
} from '../lib/api-types';

/** Plan 078 decision 5: below this denominator a percentage is noise, so
 *  the two counts are printed instead. */
export const RATE_MIN_DENOMINATOR = 20;

export type RateCell =
  { kind: 'percent'; ratio: number } | { kind: 'counts'; numerator: number; denominator: number };

export function rateCell(numerator: number, denominator: number): RateCell {
  return denominator >= RATE_MIN_DENOMINATOR
    ? { kind: 'percent', ratio: numerator / denominator }
    : { kind: 'counts', numerator, denominator };
}

export function formatRate(cell: RateCell, language: 'fr' | 'en'): string {
  if (cell.kind === 'counts') return `${cell.numerator} / ${cell.denominator}`;
  return new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(cell.ratio);
}

export type CampaignFacet = 'stars' | 'groupStatus' | 'accessibilityCard';

export const CAMPAIGN_FACETS: readonly CampaignFacet[] = [
  'stars',
  'groupStatus',
  'accessibilityCard',
];

export interface SegmentRow extends OutreachSegmentCounts {
  segment: string;
  /** Replies over matured first emails, the only rate the page prints. */
  replyRate: RateCell;
}

export type StandingKey = 'replied' | 'silent' | 'reply-window' | 'in-sequence' | 'closed-other';

export interface CheckpointRow {
  checkpoint: number;
  matured: number;
  /** 0 to 100, for the bar. */
  progress: number;
  status: OutreachCheckpoint;
}

export interface CampaignView {
  campaignVersion: string;
  firstSendDay: string | undefined;
  delivered: number;
  bounced: number;
  matured: number;
  maturedShare: RateCell;
  replies: number;
  positiveReplies: number;
  objections: number;
  won: number;
  merged: number;
  /** Delivered first emails by where their sequence stands. A thread closed
   *  for an unlisted reason is listed only when one exists. */
  standing: { key: StandingKey; count: number }[];
  /** The earliest day a thread still in its sequence matures. */
  nextMaturityDay: string | undefined;
  maturingWithinSevenDays: number;
  checkpoints: CheckpointRow[];
  repliesByLastTouch: { touch: '1' | '2' | '3'; count: number }[];
  /** Reasons with at least one refusal, largest first. */
  declineReasons: { reason: string; count: number }[];
  segments: Record<CampaignFacet, SegmentRow[]>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Segments that received a first email, in the server's order, with
 *  `unknown` always last and always shown. */
function segmentRows(segments: Record<string, OutreachSegmentCounts>): SegmentRow[] {
  const empty = { delivered: 0, matured: 0, replies: 0, positiveReplies: 0 };
  const row = (segment: string, counts: OutreachSegmentCounts): SegmentRow => ({
    segment,
    ...counts,
    replyRate: rateCell(counts.replies, counts.matured),
  });
  return [
    ...Object.entries(segments)
      .filter(([segment, counts]) => segment !== 'unknown' && counts.delivered > 0)
      .map(([segment, counts]) => row(segment, counts)),
    row('unknown', segments['unknown'] ?? empty),
  ];
}

/** `today` is the UTC day the page is read on. */
export function buildCampaignView(campaign: OutreachCampaignFunnel, today: string): CampaignView {
  const { results, projection } = campaign;
  const { maturity } = results;
  const upcoming = projection.pendingMaturity.filter((entry) => entry.threads > 0);
  const weekEnd = addDays(today, 7);
  const first = upcoming[0];
  const standing: CampaignView['standing'] = [
    { key: 'replied', count: maturity['matured-replied'] },
    { key: 'silent', count: maturity['matured-silent'] },
    { key: 'reply-window', count: maturity['reply-window'] },
    { key: 'in-sequence', count: maturity['in-sequence'] },
  ];
  if (maturity['closed-other'] > 0) {
    standing.push({ key: 'closed-other', count: maturity['closed-other'] });
  }
  return {
    campaignVersion: campaign.campaignVersion,
    firstSendDay: projection.firstSendDay,
    delivered: results.delivered,
    bounced: maturity.undelivered,
    matured: results.matured,
    maturedShare: rateCell(results.matured, results.delivered),
    replies: maturity['matured-replied'],
    positiveReplies: results.positiveReplies,
    objections: results.objections,
    won: campaign.won,
    merged: maturity.merged,
    standing,
    // A day already behind us means a follow-up is late: today is the
    // earliest it can still happen.
    nextMaturityDay: first === undefined ? undefined : first.day < today ? today : first.day,
    maturingWithinSevenDays: upcoming
      .filter((entry) => entry.day <= weekEnd)
      .reduce((sum, entry) => sum + entry.threads, 0),
    checkpoints: campaign.checkpoints.map((status) => ({
      checkpoint: status.checkpoint,
      matured: results.matured,
      progress: Math.min(100, (results.matured / status.checkpoint) * 100),
      status,
    })),
    repliesByLastTouch: (['1', '2', '3'] as const).map((touch) => ({
      touch,
      count: results.repliesByLastTouch[touch],
    })),
    declineReasons: Object.entries(results.declineReasons)
      .filter(([, count]) => count > 0)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    segments: {
      stars: segmentRows(results.segments.stars),
      groupStatus: segmentRows(results.segments.groupStatus),
      accessibilityCard: segmentRows(results.segments.accessibilityCard),
    },
  };
}

/** The campaign the page opens on: the one asked for, else the one whose
 *  first email is the most recent, else the last listed. */
export function selectCampaign(
  campaigns: readonly OutreachCampaignFunnel[],
  requested: string | null,
): OutreachCampaignFunnel | undefined {
  const asked = campaigns.find((campaign) => campaign.campaignVersion === requested);
  if (asked !== undefined) return asked;
  return [...campaigns].sort((a, b) =>
    (a.projection.firstSendDay ?? '').localeCompare(b.projection.firstSendDay ?? ''),
  )[campaigns.length - 1];
}

/** True when at least one campaign delivered a first email. */
export function hasDeliveredFirstEmail(campaigns: readonly OutreachCampaignFunnel[]): boolean {
  return campaigns.some((campaign) => campaign.results.delivered > 0);
}
