import { describe, expect, it } from 'vitest';
import { outreachCampaignSchema } from '../lib/api-schemas';
import { CAMPAIGN_FIXTURE } from './campaign-fixture';
import {
  RATE_MIN_DENOMINATOR,
  buildCampaignView,
  formatRate,
  hasDeliveredFirstEmail,
  rateCell,
  selectCampaign,
} from './campaign-model';

const campaign = outreachCampaignSchema.parse(CAMPAIGN_FIXTURE);
const today = '2026-10-10';

describe('rates on a small denominator (plan 078 decision 5)', () => {
  it('prints the two counts under 20 and a percentage from 20', () => {
    expect(RATE_MIN_DENOMINATOR).toBe(20);
    expect(rateCell(3, 19)).toEqual({ kind: 'counts', numerator: 3, denominator: 19 });
    expect(rateCell(3, 20)).toEqual({ kind: 'percent', ratio: 0.15 });
    expect(formatRate(rateCell(3, 19), 'fr')).toBe('3 / 19');
    expect(formatRate(rateCell(3, 20), 'fr')).toMatch(/^15\s%$/u);
    expect(formatRate(rateCell(3, 20), 'en')).toBe('15%');
    expect(formatRate(rateCell(0, 0), 'fr')).toBe('0 / 0');
  });

  it('applies the rule to every segment row, over matured first emails', () => {
    const view = buildCampaignView(campaign, today);
    const byStars = Object.fromEntries(view.segments.stars.map((row) => [row.segment, row]));
    // 22 matured: a percentage. 11 matured: the two counts.
    expect(byStars['3']!.replyRate).toEqual({ kind: 'percent', ratio: 5 / 22 });
    expect(byStars['4']!.replyRate).toEqual({ kind: 'counts', numerator: 1, denominator: 11 });
    expect(view.maturedShare).toEqual({ kind: 'percent', ratio: 34 / 59 });
  });
});

describe('buildCampaignView', () => {
  const view = buildCampaignView(campaign, today);

  it('accepts what the server reports', () => {
    expect(outreachCampaignSchema.safeParse(CAMPAIGN_FIXTURE).success).toBe(true);
  });

  it('reads the four headline counts from delivered and matured first emails', () => {
    expect(view).toMatchObject({
      delivered: 59,
      bounced: 2,
      matured: 34,
      replies: 6,
      positiveReplies: 2,
      objections: 1,
      won: 1,
      merged: 1,
    });
  });

  it('lists where delivered first emails stand, strongest claim first', () => {
    expect(view.standing).toEqual([
      { key: 'replied', count: 6 },
      { key: 'silent', count: 28 },
      { key: 'reply-window', count: 7 },
      { key: 'in-sequence', count: 18 },
    ]);
    expect(view.standing.reduce((sum, entry) => sum + entry.count, 0)).toBe(view.delivered);
  });

  it('gives a thread closed for an unlisted reason its own entry, never another one', () => {
    const withUnknown = buildCampaignView(
      {
        ...campaign,
        results: {
          ...campaign.results,
          maturity: { ...campaign.results.maturity, 'closed-other': 2 },
        },
      },
      today,
    );
    expect(withUnknown.standing.at(-1)).toEqual({ key: 'closed-other', count: 2 });
    expect(withUnknown.standing.slice(0, 4)).toEqual(view.standing);
  });

  it('names the next maturity day and the threads maturing within seven days', () => {
    expect(view.nextMaturityDay).toBe('2026-10-12');
    expect(view.maturingWithinSevenDays).toBe(7);
    const late = buildCampaignView(campaign, '2026-10-14');
    expect(late.nextMaturityDay).toBe('2026-10-14');
  });

  it('keeps a segment with no first email out, and unknown last even when empty', () => {
    expect(view.segments.stars.map((row) => row.segment)).toEqual(['3', '4', 'unknown']);
    expect(view.segments.groupStatus.map((row) => row.segment)).toEqual([
      'independent',
      'group-member',
      'unknown',
    ]);
    expect(view.segments.groupStatus.at(-1)).toMatchObject({ delivered: 0 });
  });

  it('orders decline reasons largest first and leaves out the ones never given', () => {
    expect(view.declineReasons).toEqual([
      { reason: 'misread-offer', count: 2 },
      { reason: 'existing-provider', count: 1 },
      { reason: 'timing', count: 1 },
      { reason: 'unspecified', count: 1 },
    ]);
  });

  it('carries each checkpoint with the matured count and its progress', () => {
    expect(
      view.checkpoints.map(({ checkpoint, matured, progress }) => [checkpoint, matured, progress]),
    ).toEqual([
      [100, 34, 34],
      [300, 34, (34 / 300) * 100],
      [500, 34, (34 / 500) * 100],
    ]);
    expect(view.checkpoints[0]!.status).toMatchObject({ kind: 'estimated', day: '2026-12-01' });
  });
});

describe('selectCampaign', () => {
  const older = { ...campaign, campaignVersion: 'a-older' };
  const newer = {
    ...campaign,
    campaignVersion: 'b-newer',
    projection: { ...campaign.projection, firstSendDay: '2026-11-02' },
  };
  const unsent = {
    ...campaign,
    campaignVersion: 'z-unsent',
    projection: { ...campaign.projection, firstSendDay: undefined },
  };

  it('opens the campaign asked for, else the one sent most recently', () => {
    expect(selectCampaign([older, newer, unsent], 'a-older')?.campaignVersion).toBe('a-older');
    expect(selectCampaign([older, newer, unsent], null)?.campaignVersion).toBe('b-newer');
    expect(selectCampaign([older, newer, unsent], 'gone')?.campaignVersion).toBe('b-newer');
    expect(selectCampaign([], null)).toBeUndefined();
  });

  it('knows when no campaign delivered a first email', () => {
    const empty = { ...campaign, results: { ...campaign.results, delivered: 0 } };
    expect(hasDeliveredFirstEmail([empty])).toBe(false);
    expect(hasDeliveredFirstEmail([empty, campaign])).toBe(true);
    expect(hasDeliveredFirstEmail([])).toBe(false);
  });
});
