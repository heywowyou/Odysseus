import { describe, expect, it } from 'vitest';
import type { OutreachCampaignReport, OutreachFunnelSnapshotDocument } from '@odysseus/store';
import { formatCampaignReport, formatFunnelHistory } from './outreach-funnel.js';

const segment = { delivered: 0, matured: 0, replies: 0, positiveReplies: 0 };

const results: OutreachCampaignReport['results'] = {
  maturity: {
    prepared: 2,
    'in-sequence': 20,
    'reply-window': 5,
    'matured-replied': 3,
    'matured-silent': 12,
    undelivered: 1,
    merged: 1,
    'closed-other': 0,
  },
  delivered: 40,
  matured: 15,
  positiveReplies: 1,
  objections: 1,
  repliesByLastTouch: { 1: 2, 2: 1, 3: 0 },
  declineReasons: {
    'existing-provider': 0,
    'misread-offer': 1,
    'not-a-priority': 0,
    budget: 0,
    timing: 0,
    'wrong-recipient': 0,
    'scope-mismatch': 0,
    other: 0,
    unspecified: 0,
  },
  segments: {
    stars: {
      '1': segment,
      '2': segment,
      '3': { delivered: 25, matured: 10, replies: 2, positiveReplies: 1 },
      '4': { delivered: 15, matured: 5, replies: 1, positiveReplies: 0 },
      '5': segment,
      unknown: segment,
    },
    groupStatus: {
      independent: { delivered: 40, matured: 15, replies: 3, positiveReplies: 1 },
      'group-member': segment,
      'vendor-hosted': segment,
      unknown: segment,
    },
    accessibilityCard: {
      yes: { delivered: 30, matured: 12, replies: 3, positiveReplies: 1 },
      no: { delivered: 10, matured: 3, replies: 0, positiveReplies: 0 },
      unknown: segment,
    },
  },
};

const legacy = {
  campaignVersion: 'first-100-2026-09',
  threads: 42,
  firstTouchSent: 42,
  replied: 2,
  bounced: 1,
  optedOut: 1,
  won: 0,
  repliesAfterTouch: { 1: 2, 2: 0, 3: 0 },
  outcomes: {
    'no-reply': 0,
    'reply-positive': 1,
    'reply-not-now': 0,
    'reply-negative': 1,
    'opt-out': 0,
    call: 0,
    quoted: 0,
    won: 0,
    lost: 0,
  },
};

describe('outreach-funnel output (plan 078)', () => {
  it('prints matured counts, reasons, segments and checkpoints of a campaign', () => {
    const lines = formatCampaignReport({
      ...legacy,
      results,
      projection: {
        firstSendDay: '2026-09-24',
        recentFirstTouchSends: 28,
        pendingMaturity: [{ day: '2026-10-20', threads: 25 }],
        sequenceDays: 29,
      },
      checkpoints: [
        { checkpoint: 100, kind: 'estimated', day: '2026-12-08', firstTouchesPerDay: 2 },
        { checkpoint: 300, kind: 'no-estimate' },
        { checkpoint: 500, kind: 'no-estimate' },
      ],
    }).join('\n');

    expect(lines).toContain('delivered first emails 40');
    expect(lines).toContain('matured               15');
    expect(lines).toContain('replies, any kind     3 (positive 1, objections 1)');
    expect(lines).toContain('decline reasons       misread-offer 1');
    expect(lines).toContain('3              delivered 25, matured 10, replies 2, positive 1');
    expect(lines).toContain(
      'checkpoint 100        2026-12-08 estimated, at 2.0 first emails a day',
    );
    expect(lines).toContain('checkpoint 300        no estimate');
  });

  it('prints a day stored before the maturity counts as unavailable, never as zero', () => {
    const takenAt = new Date('2026-10-01T03:00:00.000Z');
    const before: OutreachFunnelSnapshotDocument = { day: '2026-10-01', ...legacy, takenAt };
    const after: OutreachFunnelSnapshotDocument = { ...before, day: '2026-10-10', results };

    const [, old, current] = formatFunnelHistory([before, after]);

    expect(old).toMatch(/2026-10-01 .* n\/a +n\/a +n\/a +n\/a$/u);
    expect(old).not.toMatch(/ 0 +0 +0 +0$/u);
    expect(current).toMatch(/2026-10-10 .* 40 +15 +3 +1$/u);
  });
});
